/* eslint-disable no-console */
/**
 * Monitoring scheduler — one tick. Run on a Railway cron (e.g. every
 * 15 minutes), exactly like `market-study:daily-cron`:
 *
 *   npm run monitoring:scheduler
 *
 * Queues due re-audits as ordinary AuditOrders for the existing worker.
 * Does nothing unless GEO_MODULE_MONITORING_ENABLED="true". Production
 * runtime job — intentionally NOT behind the non-production DB guard.
 */
import { prisma } from "../src/lib/db";
import { prismaMonitoringStore } from "../src/lib/monitoring/prisma-store";
import { runMonitoringSchedulerTick } from "../src/lib/monitoring/scheduler";
import { createLiveTrackingRunner } from "../src/lib/monitoring/tracking/providers";
import { runTrackingCycleForSubscription } from "../src/lib/monitoring/tracking/service";

async function main(): Promise<void> {
  const maxPerTick = Number(process.env.MONITORING_SCHEDULER_MAX_PER_TICK) || undefined;
  const result = await runMonitoringSchedulerTick({
    store: prismaMonitoringStore,
    now: () => new Date(),
    maxPerTick,
    runTrackingCycle: (sub, cycleKey) =>
      runTrackingCycleForSubscription(sub, { cycleKey, trigger: "scheduler", runner: createLiveTrackingRunner() }),
  });
  console.log(`[monitoring-scheduler] ${JSON.stringify(result)}`);
}

main()
  .catch((err) => {
    console.error("[monitoring-scheduler] tick failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
