/* eslint-disable no-console */
/** Proof Engine — experiments: creation rules, every outcome state, frozen final outcomes, no causation (DB-free). */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { makeProofFakes, results } from "./lib/proof-fakes";
import { EXPERIMENT_OUTCOMES, type ExperimentOutcome } from "../src/lib/monitoring/proof/experiment";
import { activateSet, approveSet, assessAndRecord, createExperiment, loadProofDashboard, proposeDraft } from "../src/lib/monitoring/proof/service";

let passed = 0, failed = 0;
async function check(label: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✓ ${label}`); } catch (e) { failed += 1; console.log(`  ✗ ${label} — ${(e as Error).message}`); }
}
const SUB = { id: "sub_a", websiteUrl: "https://www.example.com", businessName: "Example Co" };
const D = (s: string) => new Date(`2026-${s}T00:00:00Z`);
const PROV = ["openai", "claude"];

/** A subscription with an active v1 set, a baseline cycle (3/12 mentions) and an approved task. */
async function setup() {
  const f = makeProofFakes();
  const r = await proposeDraft(f.stores, SUB, { businessName: "Example Co", businessCategory: "plumbing contractor", isLocal: false }, D("09-01"));
  if (!r.ok) throw new Error(r.reason);
  await approveSet(f.stores, SUB, r.value.id, "operator", D("09-01"));
  await activateSet(f.stores, SUB, r.value.id, D("09-01"));
  const set = (await f.stores.questionSets.activeSet(SUB.id))!;
  const promptIds = set.items.slice(0, 3).map((i) => i.trackedPromptId!);
  f.addCycle({ id: "baseline", subscriptionId: SUB.id, startedAt: D("09-05"), questionSetId: set.id, questionSetVersion: set.version, results: results(promptIds, PROV, 2, { mentionedCount: 3 }) });
  f.addTask({ id: "task_1", subscriptionId: SUB.id, status: "approved" });
  return { f, set, promptIds };
}
const followUp = (s: Awaited<ReturnType<typeof setup>>, o: { mentionedCount: number; at?: Date; fingerprint?: string; version?: number; failEvery?: number; prompts?: string[] }) =>
  s.f.addCycle({ id: `follow_${o.mentionedCount}_${o.fingerprint ?? ""}`, subscriptionId: SUB.id, startedAt: o.at ?? D("10-20"), questionSetId: s.set.id, questionSetVersion: o.version ?? s.set.version,
    results: results(o.prompts ?? s.promptIds, PROV, 2, { mentionedCount: o.mentionedCount, fingerprint: o.fingerprint, failEvery: o.failEvery }) });
const implement = (s: Awaited<ReturnType<typeof setup>>, verified: boolean) => {
  Object.assign(s.f.tasks[0]!, { status: verified ? "verified" : "implemented", implementedAt: D("10-10"), verifiedAt: verified ? D("10-11") : null });
  s.f.verifications.set("task_1", { outcome: verified ? "verified" : "not_found", checkedAt: D("10-11"), url: "https://www.example.com/", expected: {}, observed: {} });
};
async function outcomeOf(s: Awaited<ReturnType<typeof setup>>) {
  const e = await createExperiment(s.f.stores, SUB, { taskId: "task_1", expectedCategory: "structured_data" }, D("09-06"));
  if (!e.ok) throw new Error(e.reason);
  return e.value;
}

(async () => {
  console.log("[proof-experiment] running...");
  const seen = new Set<ExperimentOutcome>();

  await check("creation needs an approved task, an active set and a completed baseline of that set", async () => {
    const f = makeProofFakes();
    f.addTask({ id: "t", subscriptionId: SUB.id, status: "suggested", approvedAt: null });
    assert.match((await createExperiment(f.stores, SUB, { taskId: "t", expectedCategory: "x" }, D("09-06")) as { reason: string }).reason, /approved/);
    f.tasks[0]!.status = "approved"; f.tasks[0]!.approvedAt = D("09-02");
    assert.match((await createExperiment(f.stores, SUB, { taskId: "t", expectedCategory: "x" }, D("09-06")) as { reason: string }).reason, /question set/);
    const s = await setup();
    const exp = await outcomeOf(s);
    assert.equal(exp.baselineCycleId, "baseline");
    assert.equal(exp.findingId, "audit:schema");
    assert.equal((await createExperiment(s.f.stores, SUB, { taskId: "task_1", expectedCategory: "x" }, D("09-06")) as { ok: boolean }).ok, false, "one experiment per task");
  });

  for (const [label, prepare, expected] of [
    ["not implemented", (_s: Awaited<ReturnType<typeof setup>>) => {}, "implementation_not_verified"],
    ["implemented but the website check didn't verify it", (s: Awaited<ReturnType<typeof setup>>) => { implement(s, false); followUp(s, { mentionedCount: 10 }); }, "implementation_not_verified"],
    ["verified, no follow-up measurement yet", (s: Awaited<ReturnType<typeof setup>>) => implement(s, true), "insufficient_evidence"],
    ["verified, follow-up measured with a different model configuration", (s: Awaited<ReturnType<typeof setup>>) => { implement(s, true); followUp(s, { mentionedCount: 10, fingerprint: "fp-new-model" }); }, "measurement_not_comparable"],
    ["verified, follow-up with too few comparable answers (partial run)", (s: Awaited<ReturnType<typeof setup>>) => { implement(s, true); followUp(s, { mentionedCount: 3, prompts: s.promptIds.slice(0, 1) }); }, "insufficient_evidence"],
    ["verified, mention rate rose materially", (s: Awaited<ReturnType<typeof setup>>) => { implement(s, true); followUp(s, { mentionedCount: 8 }); }, "improvement_observed"],
    ["verified, mention rate fell materially", (s: Awaited<ReturnType<typeof setup>>) => { implement(s, true); s.f.cycles[0]!.results = results(s.promptIds, PROV, 2, { mentionedCount: 9 }); followUp(s, { mentionedCount: 2 }); }, "decline_observed"],
    ["verified, small change", (s: Awaited<ReturnType<typeof setup>>) => { implement(s, true); followUp(s, { mentionedCount: 4 }); }, "no_material_change"],
  ] as const) {
    await check(`outcome — ${label} → ${expected}`, async () => {
      const s = await setup();
      const exp = await outcomeOf(s);
      prepare(s);
      const a = await assessAndRecord(s.f.stores, SUB, exp.id, D("10-25"));
      assert.ok(a.ok, a.ok ? "" : a.reason);
      if (!a.ok) return;
      assert.equal(a.value.outcome, expected, a.value.reason);
      seen.add(a.value.outcome);
      assert.match(a.value.summary, /does not show that the change caused/);
      assert.ok(!/\bcaused (the|an|a) (improvement|increase|decline)|because of (the|this) change|led to|resulted in/i.test(a.value.summary + a.value.reason), "no causal claim");
      const stored = s.f.experiments[0]!;
      assert.equal(stored.outcome, expected);
      assert.equal(stored.outcomeVersion, "proof-outcome@1.0.0");
    });
  }

  await check("every outcome state is reachable", () => {
    for (const o of EXPERIMENT_OUTCOMES) assert.ok(seen.has(o), `never produced ${o}`);
  });

  await check("final outcomes are frozen; non-final outcomes are re-assessed once evidence arrives", async () => {
    const s = await setup();
    const exp = await outcomeOf(s);
    implement(s, true);
    const first = await assessAndRecord(s.f.stores, SUB, exp.id, D("10-12"));
    assert.ok(first.ok && first.value.outcome === "insufficient_evidence");
    followUp(s, { mentionedCount: 8 });
    const second = await assessAndRecord(s.f.stores, SUB, exp.id, D("10-25"));
    assert.ok(second.ok && second.value.outcome === "improvement_observed");
    followUp(s, { mentionedCount: 0, at: D("11-20") });
    const third = await assessAndRecord(s.f.stores, SUB, exp.id, D("11-25"));
    assert.equal(third.ok, false, "a recorded final outcome can't be overwritten");
    assert.equal(s.f.experiments[0]!.outcome, "improvement_observed");
  });

  await check("proof view: comparable flag, rates, citation diff and a plain-English, non-causal summary", async () => {
    const s = await setup();
    await outcomeOf(s);
    implement(s, true);
    followUp(s, { mentionedCount: 8 });
    const dash = await loadProofDashboard(s.f.stores, SUB, { now: D("10-25"), recommendations: [] });
    const v = dash.experiments[0]!;
    assert.equal(v.comparable, true);
    assert.equal(v.mentionRate.baseline, 3 / 12);
    assert.equal(v.mentionRate.followUp, 8 / 12);
    assert.equal(v.outcome.state, "improvement_observed");
    assert.equal(v.outcome.recorded, false, "computed live until recorded — nothing written by a read");
    assert.match(v.noCausationNote, /does not show that the change caused/);
    assert.equal(v.action.title, "Add WebSite and SoftwareApplication schema");
  });

  console.log(`[proof-experiment] passed=${passed} failed=${failed}`);
  if (failed > 0) process.exit(1);
})();
