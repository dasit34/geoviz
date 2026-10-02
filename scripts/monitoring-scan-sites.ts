/* eslint-disable no-console */
/**
 * Manual trigger: enqueue + run website scans for ONE monitoring
 * subscription — STAGING / NON-PRODUCTION ONLY (strict guard, no override).
 *
 *   DATABASE_URL=<staging> GEOVIZ_NONPROD_DB_HOSTS=<host> \
 *     npx tsx scripts/monitoring-scan-sites.ts --subscription <id> [--cycle-key <key>]
 *
 * Operator setup (staging only), confirming a competitor's website the
 * operator verified by hand — never inferred from a name:
 *
 *     --confirm-competitor "<Name>=<domain>"   (repeatable)
 *
 * Re-running with the same cycle key is idempotent (existing scans are
 * not re-created; finished scans are not re-run).
 */
import "./lib/require-nonprod-db";

import { prisma } from "../src/lib/db";
import { addTrackedCompetitor } from "../src/lib/monitoring/tracking/service";
import { enqueueWebsiteScansForSubscription, runWebsiteScans, setCompetitorWebsite } from "../src/lib/monitoring/website/service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function args(name: string): string[] {
  return process.argv.flatMap((a, i) => (a === name && process.argv[i + 1] ? [process.argv[i + 1]] : []));
}

async function main(): Promise<void> {
  const id = arg("--subscription");
  if (!id) throw new Error("--subscription <MonitoringSubscription id> is required");
  const sub = await prisma.monitoringSubscription.findUnique({ where: { id } });
  if (!sub) throw new Error(`no MonitoringSubscription ${id}`);

  for (const pair of args("--confirm-competitor")) {
    const [name, domain] = pair.split("=").map((s) => s.trim());
    if (!name || !domain) throw new Error(`--confirm-competitor expects "Name=domain", got ${pair}`);
    const added = await addTrackedCompetitor(sub, name, domain, "customer");
    if (!added.ok) {
      const existing = await prisma.trackedCompetitor.findFirst({ where: { subscriptionId: sub.id, isActive: true, name } });
      if (!existing) throw new Error(`could not add ${name}: ${added.message}`);
      const set = await setCompetitorWebsite(sub, existing.id, domain);
      if (!set.ok) throw new Error(`could not confirm ${name}: ${set.message}`);
    }
    console.log(`[monitoring-scan-sites] confirmed competitor website ${name} = ${domain}`);
  }

  const cycleKey = arg("--cycle-key") ?? `manual:${new Date().toISOString().slice(0, 16)}`;
  const enq = await enqueueWebsiteScansForSubscription(sub, cycleKey);
  console.log(`[monitoring-scan-sites] cycleKey=${cycleKey} enqueue=${JSON.stringify(enq)}`);
  const run = await runWebsiteScans({ maxScans: 10, subscriptionId: sub.id });
  for (const o of run.outcomes) {
    console.log(
      `[monitoring-scan-sites] ${o.siteDomain}: status=${o.status} diff=${o.diff ?? "-"} changes=${o.changes} pagesOk=${o.result.pagesOk} pagesFailed=${o.result.pagesFailed} robots=${o.result.robotsOutcome} requests=${o.result.requests} bytes=${o.result.bytesFetched} durationMs=${o.result.durationMs}${o.retryAt ? ` retryAt=${o.retryAt.toISOString()}` : ""}${o.result.error ? ` error=${JSON.stringify(o.result.error)}` : ""}`,
    );
  }
  if (run.stale.requeued || run.stale.failed) console.log(`[monitoring-scan-sites] stale=${JSON.stringify(run.stale)}`);
}

main()
  .catch((err) => {
    console.error("[monitoring-scan-sites] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
