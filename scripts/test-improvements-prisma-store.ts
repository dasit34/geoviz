/* eslint-disable no-console */
/**
 * scripts/test-improvements-prisma-store.ts — improvement tasks against a
 * NON-PRODUCTION database (strict guard): fact versions, one open task per
 * finding, status changes + history, cross-subscription isolation, draft
 * versions, single-winner verification claims, scanner → Verified.
 * Creates and deletes its own fixture subscriptions.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { fakeSite, html } from "./lib/website-fakes";
import { prisma } from "../src/lib/db";
import { prismaVerificationStore as store } from "../src/lib/monitoring/improvements/prisma-store";
import { draftForDownload, latestFactSheet, queueVerification, regenerateDraft, saveFacts, transitionTask } from "../src/lib/monitoring/improvements/service";
import { runQueuedVerifications } from "../src/lib/monitoring/improvements/verify";

const h = harness("improvements-prisma-store");
const stamp = Date.now();
const mkSub = (id: string) =>
  prisma.monitoringSubscription.create({
    data: { id, accessToken: `${id}_token_${"x".repeat(20)}`, planKey: "monitoring_monthly", stripeSubscriptionId: `${id}_stripe`, status: "active", currentPeriodEnd: new Date(Date.now() + 20 * 86400000), websiteUrl: "https://store-test.example", businessName: "Store Test HVAC", email: "x@example.invalid", cadenceDays: 30 },
  });
const A = `test_impr_a_${stamp}`;
const B = `test_impr_b_${stamp}`;

(async () => {
  console.log("[improvements-prisma-store] running...");
  const subA = await mkSub(A);
  const subB = await mkSub(B);
  try {
    const task = await prisma.improvementTask.create({
      data: {
        subscriptionId: A, dedupeKey: "audit:schema.no_localbusiness", openKey: `${A}:audit:schema.no_localbusiness`, source: "audit", category: "structured_data", fixKind: "structured_data",
        title: "No LocalBusiness schema", problem: "No LocalBusiness schema", evidence: [{ text: "audit" }], priority: 1, priorityReason: "Do first", proposedFix: "Add it", verificationMethod: "scanner",
        expectation: { type: "structured_data", url: "https://store-test.example/", name: "Store Test HVAC", phoneDigits: "6145550100" }, isFixture: true,
      },
    });

    await h.check("facts are saved as immutable versions", async () => {
      assert.deepEqual(await saveFacts(subA, { name: "Store Test HVAC", phone: "614-555-0100", city: "Columbus" }, "customer"), { ok: true });
      await saveFacts(subA, { name: "Store Test HVAC", phone: "614-555-0100", city: "Columbus", services: "Furnace Repair" }, "customer");
      const f = await latestFactSheet(A);
      assert.equal(f?.version, 2);
      assert.equal(await prisma.businessFactSheet.count({ where: { subscriptionId: A } }), 2);
    });

    await h.check("one open task per finding (openKey unique)", async () => {
      await assert.rejects(prisma.improvementTask.create({ data: { subscriptionId: A, dedupeKey: task.dedupeKey, openKey: task.openKey, source: "audit", category: "x", fixKind: "general", title: "dup", problem: "dup", evidence: [], priority: 2, priorityReason: "x", proposedFix: "x", verificationMethod: "manual" } }), /Unique/);
    });

    await h.check("another subscription can't read or change this task or its drafts", async () => {
      assert.deepEqual(await transitionTask(subB, { taskId: task.id, to: "approved" }, "customer"), { ok: false, message: "Task not found." });
      await regenerateDraft(subA, task.id, "customer");
      const d = await prisma.improvementDraft.findFirstOrThrow({ where: { taskId: task.id } });
      assert.equal(await draftForDownload(B, d.id), null);
      assert.ok(await draftForDownload(A, d.id));
    });

    await h.check("drafts are versioned; regenerating adds a version and keeps the old one", async () => {
      await regenerateDraft(subA, task.id, "customer");
      const versions = (await prisma.improvementDraft.findMany({ where: { taskId: task.id }, orderBy: { version: "asc" } })).map((x) => x.version);
      assert.deepEqual(versions, [1, 2]);
      const latest = await prisma.improvementDraft.findFirstOrThrow({ where: { taskId: task.id }, orderBy: { version: "desc" } });
      assert.match(latest.content, /"telephone": "614-555-0100"/);
      assert.equal(latest.factSheetVersion, 2);
    });

    await h.check("customer flow: approve → implemented queues a check; customer can't verify", async () => {
      assert.deepEqual(await transitionTask(subA, { taskId: task.id, to: "approved" }, "customer"), { ok: true });
      assert.equal((await transitionTask(subA, { taskId: task.id, to: "verified" }, "customer")).ok, false);
      assert.deepEqual(await transitionTask(subA, { taskId: task.id, to: "implemented", notes: "Added schema" }, "customer"), { ok: true });
      assert.equal(await prisma.improvementVerification.count({ where: { taskId: task.id, status: "queued" } }), 1);
      await queueVerification(subA, task.id);
      assert.equal(await prisma.improvementVerification.count({ where: { taskId: task.id } }), 1, "no duplicate queued checks");
    });

    await h.check("concurrent claims: exactly one winner; real runner ignores fixture checks", async () => {
      assert.equal(await store.claimNext(new Date(), { subscriptionId: A }), null, "fixture check not claimed by real runner");
      const now = new Date();
      const got = await Promise.all([1, 2, 3].map(() => store.claimNext(now, { subscriptionId: A, fixtures: true })));
      assert.equal(got.filter(Boolean).length, 1);
      await prisma.improvementVerification.updateMany({ where: { taskId: task.id }, data: { status: "queued", attempts: 0, claimedAt: null } });
    });

    await h.check("passing scanner check → Verified, openKey released, history recorded", async () => {
      const site = fakeSite({ "/robots.txt": { status: 404 }, "/": { status: 200, body: html({ title: "Store Test HVAC", h1: "Hi", jsonLd: { "@context": "https://schema.org", "@type": "HVACBusiness", name: "Store Test HVAC", telephone: "614-555-0100" } }) } });
      const r = await runQueuedVerifications({ store, now: () => new Date(), maxChecks: 2, subscriptionId: A, fixtures: true, deps: () => ({ fetcher: site.fetcher, sleep: async () => {} }) });
      assert.deepEqual(r.outcomes.map((o) => o.outcome), ["verified"]);
      const t = await prisma.improvementTask.findUniqueOrThrow({ where: { id: task.id } });
      assert.equal(t.status, "verified");
      assert.equal(t.verifiedBy, "scanner");
      assert.equal(t.openKey, null);
      const events = await prisma.improvementEvent.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "asc" } });
      assert.ok(events.some((e) => e.type === "verification") && events.some((e) => e.toStatus === "verified" && e.actor === "system"));
    });
  } finally {
    await prisma.monitoringSubscription.deleteMany({ where: { id: { in: [A, B] } } });
    console.log(`  cleanup: ${await prisma.improvementTask.count({ where: { subscriptionId: { in: [A, B] } } })} tasks left`);
    await prisma.$disconnect();
  }
  h.done();
})();
