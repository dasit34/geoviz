/* eslint-disable no-console */
/**
 * scripts/test-tracking-prisma-store.ts — the real tracking store against
 * a NON-PRODUCTION database (strict guard). Proves the DB-level guarantees
 * the cycle relies on: one cycle per key, one claimed result per
 * (cycle, prompt, provider), atomic stale re-claim, durable prompt and
 * competitor uniqueness. Disposable rows, deleted in `finally`.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { harness } from "./lib/monitoring-fakes";
import { prisma } from "../src/lib/db";
import { prismaTrackingStore as store } from "../src/lib/monitoring/tracking/prisma-store";
import { addTrackedCompetitor, addTrackedPrompt, deactivateTrackedPrompt, runTrackingCycleForSubscription } from "../src/lib/monitoring/tracking/service";
import { createFakeRunner } from "./lib/tracking-fakes";

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

    await h.check("cycle key is unique: second getOrCreate returns the same cycle", async () => {
      const args = { subscriptionId: sub.id, cycleKey: `k_${tag}`, trigger: "manual" as const, promptIds: [], providers: ["openai"], competitors: [], now: new Date() };
      const a = await store.getOrCreateCycle(args);
      const b = await store.getOrCreateCycle(args);
      assert.equal(a.created, true);
      assert.equal(b.created, false);
      assert.equal(a.cycle.id, b.cycle.id);
    });

    await h.check("result claim is atomic: concurrent claims → exactly one 'claimed'", async () => {
      const p = await prisma.trackedPrompt.findFirstOrThrow({ where: { subscriptionId: sub.id } });
      const { cycle } = await store.getOrCreateCycle({ subscriptionId: sub.id, cycleKey: `claim_${tag}`, trigger: "manual", promptIds: [p.id], providers: ["openai"], competitors: [], now: new Date() });
      const now = new Date();
      const claims = await Promise.all([1, 2, 3].map(() => store.claimResult({ cycleId: cycle.id, trackedPromptId: p.id, provider: "openai", subscriptionId: sub.id, now, staleBefore: new Date(now.getTime() - 900_000) })));
      assert.equal(claims.filter((c) => c.state === "claimed").length, 1);
      assert.equal(claims.filter((c) => c.state === "in_progress").length, 2);
      const stale = await store.claimResult({ cycleId: cycle.id, trackedPromptId: p.id, provider: "openai", subscriptionId: sub.id, now: new Date(now.getTime() + 1_000_000), staleBefore: new Date(now.getTime() + 100_000) });
      assert.equal(stale.state, "claimed", "a claim older than the stale window is re-claimable");
    });

    await h.check("full cycle via the service with a fake runner: results stored, metrics summary saved, rerun is a no-op", async () => {
      const { runner, calls } = createFakeRunner(() => ({ answerText: "Rock Roofing Test and Acme Roofing are popular.", namedBusinesses: ["Rock Roofing Test", "Acme Roofing"], nativeCitationUrls: ["https://yelp.com/x"] }));
      const r = await runTrackingCycleForSubscription(sub, { cycleKey: `svc_${tag}`, trigger: "manual", runner });
      assert.equal(r.outcome, "ran");
      assert.equal(calls.length, 4, "1 active prompt × 4 Early Access providers");
      const cyc = await prisma.monitoringCycle.findUniqueOrThrow({ where: { subscriptionId_cycleKey: { subscriptionId: sub.id, cycleKey: `svc_${tag}` } } });
      assert.equal(cyc.status, "completed");
      const summary = cyc.summary as { mentionRate: number; shareOfVoice: number };
      assert.equal(summary.mentionRate, 1);
      assert.equal(summary.shareOfVoice, 0.5);
      const rows = await prisma.promptRunResult.findMany({ where: { cycleId: cyc.id } });
      assert.equal(rows.length, 4);
      assert.ok(rows.every((x) => x.status === "measured" && x.mentioned === true && x.position === 1));
      const again = await runTrackingCycleForSubscription(sub, { cycleKey: `svc_${tag}`, trigger: "manual", runner });
      assert.equal(again.outcome, "already_completed");
      assert.equal(calls.length, 4);
    });
  } finally {
    await prisma.monitoringSubscription.delete({ where: { id: sub.id } }); // cascades prompts, competitors, cycles, results
    await prisma.$disconnect();
  }
  h.done();
})();
