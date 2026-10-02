/* eslint-disable no-console */
/**
 * scripts/test-website-prisma-store.ts — the Prisma website-scan store
 * against a NON-PRODUCTION database (strict guard, no override): unique
 * enqueue, single-winner claims, transactional save, previous-scan lookup,
 * immutable changes. Creates and deletes its own fixture subscription.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { fakeSite, html, noSleep } from "./lib/website-fakes";
import { prisma } from "../src/lib/db";
import { prismaWebsiteScanStore as store } from "../src/lib/monitoring/website/prisma-store";
import { enqueueWebsiteScans, runQueuedWebsiteScans } from "../src/lib/monitoring/website/scan-job";

const h = harness("website-prisma-store");
const SUB = `test_website_store_${Date.now()}`;
const target = { siteKind: "customer" as const, siteDomain: "store-test.example", siteUrl: "https://store-test.example/", trackedCompetitorId: null, label: "x" };
const site = (title: string) =>
  fakeSite({ "/robots.txt": { status: 200, body: "User-agent: *\nDisallow:\n" }, "/": { status: 200, body: html({ title, h1: "Store test", paragraphs: ["A page long enough to be captured as a content block."] }) } });

(async () => {
  console.log("[website-prisma-store] running...");
  await prisma.monitoringSubscription.create({
    data: { id: SUB, accessToken: `${SUB}_token_${"x".repeat(20)}`, planKey: "monitoring_monthly", stripeSubscriptionId: `${SUB}_stripe`, status: "active", websiteUrl: "https://store-test.example", email: "store-test@example.invalid", cadenceDays: 30 },
  });
  try {
    await h.check("enqueue is unique per (subscription, cycleKey, site)", async () => {
      const a = await enqueueWebsiteScans({ store, subscriptionId: SUB, cycleKey: "k1", targets: [target], isFixture: true, now: new Date() });
      const b = await enqueueWebsiteScans({ store, subscriptionId: SUB, cycleKey: "k1", targets: [target], isFixture: true, now: new Date() });
      assert.deepEqual([a.created, b.existing], [1, 1]);
    });

    await h.check("concurrent claims: exactly one winner", async () => {
      const now = new Date();
      const [x, y, z] = await Promise.all([store.claimNext(now, SUB), store.claimNext(now, SUB), store.claimNext(now, SUB)]);
      assert.equal([x, y, z].filter(Boolean).length, 1);
      await prisma.websiteScan.updateMany({ where: { subscriptionId: SUB }, data: { status: "queued", attempts: 0, claimedAt: null } });
    });

    await h.check("baseline then compared scan; snapshots + change rows written; cost 0 recorded", async () => {
      const r1 = await runQueuedWebsiteScans({ store, limits: () => ({ maxPagesPerSite: 3, maxSitemapUrlsRead: 10 }), scanDeps: () => ({ fetcher: site("Old title").fetcher, ...noSleep }), now: () => new Date(), maxScans: 1, subscriptionId: SUB });
      assert.equal(r1.outcomes[0]!.diff, "baseline");
      await enqueueWebsiteScans({ store, subscriptionId: SUB, cycleKey: "k2", targets: [target], isFixture: true, now: new Date() });
      const r2 = await runQueuedWebsiteScans({ store, limits: () => ({ maxPagesPerSite: 3, maxSitemapUrlsRead: 10 }), scanDeps: () => ({ fetcher: site("New title").fetcher, ...noSleep }), now: () => new Date(), maxScans: 1, subscriptionId: SUB });
      assert.equal(r2.outcomes[0]!.diff, "compared");
      const scans = await prisma.websiteScan.findMany({ where: { subscriptionId: SUB }, orderBy: { createdAt: "asc" }, include: { pages: true } });
      assert.equal(scans[1]!.comparedToScanId, scans[0]!.id);
      assert.equal(scans[0]!.pages.length, 1);
      assert.equal(Number(scans[1]!.costUsd), 0);
      assert.ok(scans[1]!.requests >= 2 && scans[1]!.bytesFetched > 0);
      const changes = await prisma.websiteChange.findMany({ where: { subscriptionId: SUB } });
      assert.equal(changes.length, 1);
      assert.equal(changes[0]!.changeType, "title_changed");
      assert.equal(changes[0]!.beforeExcerpt, "Old title");
      assert.equal(changes[0]!.isFixture, true);
    });

    await h.check("stale running scan is re-queued", async () => {
      await enqueueWebsiteScans({ store, subscriptionId: SUB, cycleKey: "k3", targets: [target], isFixture: true, now: new Date() });
      await store.claimNext(new Date(), SUB);
      const r = await store.requeueStale(new Date(Date.now() + 60_000), 3, new Date());
      assert.ok(r.requeued >= 1);
    });
  } finally {
    await prisma.monitoringSubscription.delete({ where: { id: SUB } });
    const left = await prisma.websiteScan.count({ where: { subscriptionId: SUB } });
    console.log(`  cleanup: fixture subscription deleted, ${left} scans left`);
    await prisma.$disconnect();
  }
  h.done();
})();
