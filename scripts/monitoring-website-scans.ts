/* eslint-disable no-console */
/**
 * Website-scan runner — one pass. Run on a Railway cron next to the
 * monitoring scheduler (e.g. every 15 minutes):
 *
 *   npm run monitoring:website-scans
 *
 * Re-queues stale scans, then claims and runs up to
 * MONITORING_WEBSITE_SCANS_PER_RUN queued scans (default 4). Scans are
 * separate jobs: a failure here never touches re-audits or question
 * tracking. Does nothing unless GEO_MODULE_MONITORING_ENABLED="true".
 * Production runtime job — intentionally NOT behind the non-production
 * DB guard (like `monitoring:scheduler`).
 */
import { prisma } from "../src/lib/db";
import { isMonitoringEnabled } from "../src/lib/monitoring/plans";
import { runWebsiteScans } from "../src/lib/monitoring/website/service";

async function main(): Promise<void> {
  if (!isMonitoringEnabled()) return void console.log('[monitoring-website-scans] {"outcome":"disabled"}');
  const maxScans = Number(process.env.MONITORING_WEBSITE_SCANS_PER_RUN) || 4;
  const result = await runWebsiteScans({ maxScans });
  console.log(`[monitoring-website-scans] ${JSON.stringify(result)}`);
}

main()
  .catch((err) => {
    console.error("[monitoring-website-scans] run failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
