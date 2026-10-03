/* eslint-disable no-console */
/**
 * scripts/backfill-monitoring-site-keys.ts — give every legacy
 * MonitoringSubscription (siteKey null) its business key
 * (normalizeDomain(websiteUrl)), so the (email, siteKey) unique index covers
 * it. Idempotent. When two legacy rows already share an (email, site), the
 * most recent keeps the key and the rest are reported (left null, never
 * merged or deleted — operator decision). The sync also claims keys lazily.
 *
 *   npx tsx scripts/backfill-monitoring-site-keys.ts [--dry-run]
 */
import "./lib/require-nonprod-db-or-break-glass";

import { prisma } from "../src/lib/db";
import { siteKeyFor } from "../src/lib/monitoring/subscription-sync";
import { prismaMonitoringStore } from "../src/lib/monitoring/prisma-store";

const dryRun = process.argv.includes("--dry-run");

(async () => {
  const rows = await prisma.monitoringSubscription.findMany({
    where: { siteKey: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, websiteUrl: true },
  });
  let claimed = 0;
  const conflicts: string[] = [];
  for (const r of rows) {
    const key = siteKeyFor(r.websiteUrl);
    if (dryRun) {
      console.log(`[backfill-site-keys] would set ${r.id} → ${key}`);
      continue;
    }
    if (await prismaMonitoringStore.claimSiteKey(r.id, key)) claimed += 1;
    else conflicts.push(r.id);
  }
  console.log(`[backfill-site-keys] legacy rows=${rows.length} claimed=${claimed} conflicts=${conflicts.length}${dryRun ? " (dry run)" : ""}`);
  if (conflicts.length) console.log(`[backfill-site-keys] left null (another row owns the key): ${conflicts.join(", ")}`);
  await prisma.$disconnect();
})().catch(async (err) => {
  console.error("[backfill-site-keys] failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
