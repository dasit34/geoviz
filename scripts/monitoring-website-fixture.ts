/* eslint-disable no-console */
/**
 * FIXTURE DEMO — STAGING / NON-PRODUCTION ONLY (strict guard, no override).
 *
 * Records two scans of the fake site `fixture-hvac.example` (served from
 * memory, never fetched) against one monitoring subscription, so the
 * Website Changes tab shows real diffs. Every row is stored with
 * isFixture = true and is labelled "FIXTURE (demonstration data)" in the
 * UI; fixture changes never feed customer recommendations.
 *
 *   npx tsx scripts/monitoring-website-fixture.ts --subscription <id>
 */
import "./lib/require-nonprod-db";

import { fakeSite } from "./lib/website-fakes";
import { FIXTURE_V1, FIXTURE_V2 } from "./lib/website-fixture-site";
import { prisma } from "../src/lib/db";
import { prismaWebsiteScanStore as store } from "../src/lib/monitoring/website/prisma-store";
import { enqueueWebsiteScans, runQueuedWebsiteScans } from "../src/lib/monitoring/website/scan-job";

const DOMAIN = "fixture-hvac.example";

async function main(): Promise<void> {
  const i = process.argv.indexOf("--subscription");
  const id = i >= 0 ? process.argv[i + 1] : undefined;
  if (!id) throw new Error("--subscription <id> is required");
  const sub = await prisma.monitoringSubscription.findUnique({ where: { id }, select: { id: true } });
  if (!sub) throw new Error(`no MonitoringSubscription ${id}`);
  const realQueued = await prisma.websiteScan.count({ where: { subscriptionId: id, isFixture: false, status: { in: ["queued", "running"] } } });
  if (realQueued > 0) throw new Error("real scans are queued for this subscription — run them first so the fixture runner can't claim them");

  const target = { siteKind: "customer" as const, siteDomain: DOMAIN, siteUrl: `https://${DOMAIN}/`, trackedCompetitorId: null, label: "Fixture site" };
  for (const [cycleKey, routes] of [["fixture:v1", FIXTURE_V1], ["fixture:v2", FIXTURE_V2]] as const) {
    await enqueueWebsiteScans({ store, subscriptionId: id, cycleKey, targets: [target], isFixture: true, now: new Date() });
    const r = await runQueuedWebsiteScans({
      store,
      limits: () => ({ maxPagesPerSite: 12, maxSitemapUrlsRead: 200 }),
      scanDeps: (scan) => {
        if (!scan.isFixture) throw new Error("fixture runner refuses real scans");
        return { fetcher: fakeSite(routes).fetcher, sleep: async () => {} };
      },
      now: () => new Date(),
      maxScans: 1,
      subscriptionId: id,
    });
    for (const o of r.outcomes) console.log(`[website-fixture] ${cycleKey}: status=${o.status} diff=${o.diff} changes=${o.changes} pagesOk=${o.result.pagesOk} pagesFailed=${o.result.pagesFailed}`);
  }
  const changes = await prisma.websiteChange.findMany({ where: { subscriptionId: id, isFixture: true }, orderBy: { createdAt: "asc" } });
  for (const c of changes) console.log(`  FIXTURE ${c.changeType} ${c.url} | before=${JSON.stringify(c.beforeExcerpt)} | after=${JSON.stringify(c.afterExcerpt)}`);
}

main()
  .catch((err) => {
    console.error("[website-fixture] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
