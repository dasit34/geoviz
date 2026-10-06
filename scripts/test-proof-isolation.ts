/* eslint-disable no-console */
/** Proof Engine — tenant isolation: stores, service and routes never cross subscriptions (DB-free). */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeProofFakes, results } from "./lib/proof-fakes";
import { isProofEngineEnabled } from "../src/lib/monitoring/proof/flags";
import { parseDraftItems } from "../src/lib/monitoring/proof/question-set";
import { activateSet, approveSet, assessAndRecord, createExperiment, editDraft, loadProofDashboard, newVersionFrom, proposeDraft } from "../src/lib/monitoring/proof/service";

let passed = 0, failed = 0;
async function check(label: string, fn: () => Promise<void> | void) {
  try { await fn(); passed += 1; console.log(`  ✓ ${label}`); } catch (e) { failed += 1; console.log(`  ✗ ${label} — ${(e as Error).message}`); }
}
const A = { id: "sub_a", websiteUrl: "https://a.example", businessName: "Alpha Roofing" };
const B = { id: "sub_b", websiteUrl: "https://b.example", businessName: "Beta Dental" };
const D = (s: string) => new Date(`2026-${s}T00:00:00Z`);
const src = (p: string) => readFileSync(p, "utf8");

(async () => {
  console.log("[proof-isolation] running...");
  const f = makeProofFakes();
  const r = await proposeDraft(f.stores, A, { businessName: "Alpha Roofing", businessCategory: "roofing contractor", isLocal: true, city: "Toledo", state: "OH" }, D("09-01"));
  if (!r.ok) throw new Error(r.reason);
  const setA = r.value;

  await check("B cannot read, edit, approve, activate or clone A's question set", async () => {
    assert.equal(await f.stores.questionSets.getSet(B.id, setA.id), null);
    assert.equal((await editDraft(f.stores, B, setA.id, [{ text: "Who is the best dentist?", intent: "unbranded_discovery", rationale: "x" }])).ok, false);
    assert.equal((await approveSet(f.stores, B, setA.id, "operator", D("09-02"))).ok, false);
    assert.equal((await activateSet(f.stores, B, setA.id, D("09-02"))).ok, false);
    assert.equal((await newVersionFrom(f.stores, B, setA.id, D("09-02"))).ok, false);
    assert.equal((await f.stores.questionSets.getSet(A.id, setA.id))!.status, "draft", "A's set unchanged");
  });

  await approveSet(f.stores, A, setA.id, "operator", D("09-02"));
  await activateSet(f.stores, A, setA.id, D("09-02"));
  const active = (await f.stores.questionSets.activeSet(A.id))!;
  const pids = active.items.slice(0, 3).map((i) => i.trackedPromptId!);
  f.addCycle({ id: "cycle_a", subscriptionId: A.id, startedAt: D("09-05"), questionSetId: active.id, questionSetVersion: active.version, results: results(pids, ["openai", "claude"], 2, { mentionedCount: 3 }) });
  f.runRows.set("cycle_a", [{
    id: "r1", trackedPromptId: pids[0]!, provider: "openai", sampleIndex: 0, model: "gpt-4.1-mini", status: "measured", callState: "completed",
    errorCode: null, errorMessage: null, groundingMode: "web_search", answerText: "Alpha Roofing is highly rated in Toledo.", mentioned: true, position: null,
    positionStatus: "no_ordered_list", namedBusinesses: ["Alpha Roofing"], competitorIdsMentioned: [], citedUrls: [], rawResponse: null, matchEvidence: null,
    claimedAt: D("09-05"), completedAt: D("09-05"),
  }]);
  f.addTask({ id: "task_a", subscriptionId: A.id, status: "approved" });
  const exp = await createExperiment(f.stores, A, { taskId: "task_a", expectedCategory: "structured_data" }, D("09-06"));
  if (!exp.ok) throw new Error(exp.reason);

  await check("B cannot create an experiment from A's task, or assess A's experiment", async () => {
    assert.equal((await createExperiment(f.stores, B, { taskId: "task_a", expectedCategory: "x" }, D("09-06"))).ok, false);
    assert.equal((await assessAndRecord(f.stores, B, exp.value.id, D("10-01"))).ok, false);
    assert.equal(f.experiments[0]!.outcome, null);
  });

  await check("B's dashboard contains none of A's sets, experiments, answers or competitors", async () => {
    const dB = await loadProofDashboard(f.stores, B, { now: D("10-01"), recommendations: [] });
    assert.deepEqual([dB.questionSets.length, dB.experiments.length, dB.latestEvidence.length], [0, 0, 0]);
    assert.equal(dB.activeSet, null);
    assert.ok(!JSON.stringify(dB).includes("Alpha Roofing"));
    const dA = await loadProofDashboard(f.stores, A, { now: D("10-01"), recommendations: [] });
    assert.equal(dA.experiments.length, 1);
    assert.ok(dA.latestEvidence.length > 0);
  });

  await check("admin API requires the admin session or ADMIN_SECRET, and the monitoring flag, before any lookup", () => {
    const s = src("src/app/api/admin/proof/route.ts");
    const gate = s.indexOf("if (!isAuthed() && !isValidAdminKey(key))");
    assert.ok(s.indexOf("if (!isMonitoringEnabled())") > -1 && gate > -1);
    assert.ok(gate < s.indexOf("prisma.monitoringSubscription.findUnique"));
  });

  await check("admin page is gated by isAdminPageRequest + the monitoring flag and scoped to the URL's subscription", () => {
    const s = src("src/app/admin/proof/[subscriptionId]/page.tsx");
    const gate = s.indexOf("if (!isMonitoringEnabled() || !isAdminPageRequest(");
    assert.ok(gate > -1 && gate < s.indexOf("prisma.monitoringSubscription.findUnique"));
    assert.match(s, /where: \{ subscriptionId: sub\.id/);
  });

  await check("customer Proof tab: owned subscription first, then the proof flag", () => {
    const s = src("src/app/(future)/monitoring/account/[subscriptionId]/page.tsx");
    const owned = s.indexOf("requireOwnedSubscription(params.subscriptionId)");
    const load = s.indexOf("loadProofDashboard(prismaProofStores, sub");
    assert.ok(owned > -1 && load > owned);
    assert.match(s, /proofOn && tab === "proof"/);
  });

  await check("proof flag: off unless monitoring AND GEO_MODULE_PROOF_ENGINE_ENABLED are both on", () => {
    assert.equal(isProofEngineEnabled({}), false);
    assert.equal(isProofEngineEnabled({ GEO_MODULE_PROOF_ENGINE_ENABLED: "true" }), false);
    assert.equal(isProofEngineEnabled({ GEO_MODULE_MONITORING_ENABLED: "true" }), false);
    assert.equal(isProofEngineEnabled({ GEO_MODULE_MONITORING_ENABLED: "true", GEO_MODULE_PROOF_ENGINE_ENABLED: "true" }), true);
  });

  await check("draft editor parser: rejects unknown intents and malformed lines", () => {
    assert.equal(typeof parseDraftItems("bogus | Who is best?"), "string");
    assert.equal(typeof parseDraftItems("just a line"), "string");
    const ok = parseDraftItems("branded_accuracy | What does Alpha Roofing do? |\nunbranded_discovery | Who are the best roofers in Toledo? | why");
    assert.ok(Array.isArray(ok) && ok.length === 2 && ok[1]!.rationale === "why");
  });

  console.log(`[proof-isolation] passed=${passed} failed=${failed}`);
  if (failed > 0) process.exit(1);
})();
