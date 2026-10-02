/* eslint-disable no-console */
/**
 * scripts/test-tracking-prisma-store.ts — the real tracking store against
 * a NON-PRODUCTION database (strict guard). Proves the DB-level guarantees
 * the cycle relies on: one cycle per key, one row per (cycle, prompt,
 * provider, sample), compare-and-set call-state transitions (stale pending
 * re-claim, in_flight → unknown, explicit-only unknown retry), durable
 * prompt and competitor uniqueness. Disposable rows, deleted in `finally`.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { harness } from "./lib/monitoring-fakes";
import { prisma } from "../src/lib/db";
import { prismaTrackingStore as store } from "../src/lib/monitoring/tracking/prisma-store";
import { addTrackedCompetitor, addTrackedPrompt, deactivateTrackedPrompt, runTrackingCycleForSubscription } from "../src/lib/monitoring/tracking/service";
import { createFakeClient } from "./lib/tracking-fakes";

const h = harness("tracking-prisma-store");
const tag = randomBytes(5).toString("hex");

(async () => {
  console.log("[tracking-prisma-store] running...");
  const sub = await prisma.monitoringSubscription.create({
    data: {
      accessToken: `tok_trk_${tag}_${randomBytes(12).toString("hex")}`,
      planKey: "monthly", stripeSubscriptionId: `sub_trk_${tag}`, status: "active",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      websiteUrl: `https://rock-roofing-${tag}.invalid`, businessName: "Rock Roofing Test", email: "t@example.invalid", cadenceDays: 30,
    },
  });
  try {
    await h.check("prompts: add, dedupe, deactivate, re-activate keeps one durable row", async () => {
      assert.deepEqual(await addTrackedPrompt(sub, "Who is the best roofer in Toledo?", "custom"), { ok: true });
      assert.equal((await addTrackedPrompt(sub, "who is the best roofer in toledo", "custom")).ok, false);
      const p = await prisma.trackedPrompt.findFirstOrThrow({ where: { subscriptionId: sub.id } });
      assert.deepEqual(await deactivateTrackedPrompt(sub, p.id), { ok: true });
      assert.deepEqual(await addTrackedPrompt(sub, "Who is the best roofer in Toledo?", "suggested"), { ok: true });
      assert.equal(await prisma.trackedPrompt.count({ where: { subscriptionId: sub.id } }), 1);
    });

    await h.check("competitors: limit of 3 enforced against the database", async () => {
      for (const n of ["Acme Roofing", "Best Roofs", "Crown Roofing"]) assert.deepEqual(await addTrackedCompetitor(sub, n, null, "customer"), { ok: true });
      const fourth = await addTrackedCompetitor(sub, "Delta Roofing", null, "customer");
      assert.equal(fourth.ok, false);
    });

    await h.check("cycle key is unique: second getOrCreate returns the same cycle (with its sample count)", async () => {
      const args = { subscriptionId: sub.id, cycleKey: `k_${tag}`, trigger: "manual" as const, promptIds: [], providers: ["openai"], competitors: [], samplesPerPrompt: 2, now: new Date() };
      const a = await store.getOrCreateCycle(args);
      const b = await store.getOrCreateCycle(args);
      assert.equal(a.created, true);
      assert.equal(b.created, false);
      assert.equal(b.cycle.samplesPerPrompt, 2);
    });

    await h.check("per-sample claims: concurrent claims of one sample → one claimer; other samples independent", async () => {
      const p = await prisma.trackedPrompt.findFirstOrThrow({ where: { subscriptionId: sub.id } });
      const { cycle } = await store.getOrCreateCycle({ subscriptionId: sub.id, cycleKey: `claim_${tag}`, trigger: "manual", promptIds: [p.id], providers: ["openai"], competitors: [], samplesPerPrompt: 2, now: new Date() });
      const now = new Date();
      const stale = new Date(now.getTime() - 900_000);
      const base = { cycleId: cycle.id, trackedPromptId: p.id, provider: "openai", subscriptionId: sub.id, now, staleBefore: stale, retryUnknown: false };
      const claims = await Promise.all([1, 2, 3].map(() => store.claimSample({ ...base, sampleIndex: 0 })));
      assert.equal(claims.filter((c) => c.state === "claimed").length, 1);
      const s1 = await store.claimSample({ ...base, sampleIndex: 1 });
      assert.equal(s1.state, "claimed", "sample 1 is a separate row");
    });

    await h.check("stale pending → re-claimable; stale in_flight → stale_in_flight → markUnknown (atomic, once)", async () => {
      const p = await prisma.trackedPrompt.findFirstOrThrow({ where: { subscriptionId: sub.id } });
      const { cycle } = await store.getOrCreateCycle({ subscriptionId: sub.id, cycleKey: `state_${tag}`, trigger: "manual", promptIds: [p.id], providers: ["claude"], competitors: [], samplesPerPrompt: 1, now: new Date() });
      const t0 = new Date();
      const base = { cycleId: cycle.id, trackedPromptId: p.id, provider: "claude", sampleIndex: 0, subscriptionId: sub.id, retryUnknown: false };
      const c1 = await store.claimSample({ ...base, now: t0, staleBefore: new Date(t0.getTime() - 900_000) });
      assert.equal(c1.state, "claimed");
      const t1 = new Date(t0.getTime() + 1_000_000);
      const c2 = await store.claimSample({ ...base, now: t1, staleBefore: new Date(t1.getTime() - 900_000) });
      assert.equal(c2.state, "claimed", "stale pending (nothing sent) is re-claimable");
      if (c2.state !== "claimed") return;
      await store.markInFlight(c2.resultId, { now: t1, promptVersion: "tracking-prompt@2.0.0" });
      const t2 = new Date(t1.getTime() + 1_000_000);
      const staleBefore = new Date(t2.getTime() - 900_000);
      const c3 = await store.claimSample({ ...base, now: t2, staleBefore });
      assert.equal(c3.state, "stale_in_flight");
      const flips = await Promise.all([store.markUnknown(c2.resultId, { now: t2, staleBefore }), store.markUnknown(c2.resultId, { now: t2, staleBefore })]);
      assert.equal(flips.filter(Boolean).length, 1);
      const row = await prisma.promptRunResult.findUniqueOrThrow({ where: { id: c2.resultId } });
      assert.equal(row.callState, "unknown");
      assert.equal(row.status, "not_measured");
      assert.equal((await store.claimSample({ ...base, now: t2, staleBefore })).state, "unknown", "unknown is not re-claimed automatically");
      assert.equal((await store.claimSample({ ...base, now: t2, staleBefore, retryUnknown: true })).state, "claimed", "only an explicit operator retry re-claims it");
    });

    await h.check("full cycle via the service: 1 question × 4 providers × 2 samples; rerun makes 0 calls", async () => {
      const { client, calls } = createFakeClient(() => ({ text: "Top picks:\n1. **Rock Roofing Test**\n2. **Acme Roofing**", citations: ["https://yelp.com/x"], usage: { inputTokens: 500, outputTokens: 300, searchCalls: 1 } }));
      const r = await runTrackingCycleForSubscription(sub, { cycleKey: `svc_${tag}`, trigger: "manual", client });
      assert.equal(r.outcome, "ran");
      assert.equal(calls.length, 8);
      const cyc = await prisma.monitoringCycle.findUniqueOrThrow({ where: { subscriptionId_cycleKey: { subscriptionId: sub.id, cycleKey: `svc_${tag}` } } });
      assert.equal(cyc.status, "completed");
      assert.equal(cyc.samplesPerPrompt, 2);
      assert.ok(Number(cyc.estimatedCostUsd) > 0);
      const rows = await prisma.promptRunResult.findMany({ where: { cycleId: cyc.id } });
      assert.equal(rows.length, 8);
      assert.ok(rows.every((x) => x.callState === "completed" && x.positionStatus === "ranked" && x.position === 1 && x.configFingerprint && x.rawResponse));
      assert.equal(new Set(rows.map((x) => `${x.provider}#${x.sampleIndex}`)).size, 8);
      const again = await runTrackingCycleForSubscription(sub, { cycleKey: `svc_${tag}`, trigger: "manual", client });
      assert.equal(again.outcome, "already_completed");
      assert.equal(calls.length, 8);
    });
  } finally {
    await prisma.monitoringSubscription.delete({ where: { id: sub.id } }); // cascades prompts, competitors, cycles, results
    await prisma.$disconnect();
  }
  h.done();
})();
