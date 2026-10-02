/* eslint-disable no-console */
/**
 * Manual trigger: run (or resume) ONE prompt-tracking cycle for one
 * monitoring subscription — STAGING / NON-PRODUCTION ONLY. The strict
 * guard below refuses any production or unknown DATABASE_URL, and there
 * is no override.
 *
 *   DATABASE_URL=<staging> GEOVIZ_NONPROD_DB_HOSTS=<host> \
 *     npx tsx scripts/monitoring-run-cycle.ts --subscription <id> [--cycle-key <key>]
 *
 * Without --cycle-key a fresh "manual:<ISO minute>" key is used. Re-running
 * with the same key resumes that cycle and never re-calls a provider for an
 * answer already recorded (see src/lib/monitoring/tracking/cycle.ts).
 */
import "./lib/require-nonprod-db";

import { prisma } from "../src/lib/db";
import { createLiveTrackingRunner } from "../src/lib/monitoring/tracking/providers";
import { runTrackingCycleForSubscription } from "../src/lib/monitoring/tracking/service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const id = arg("--subscription");
  if (!id) throw new Error("--subscription <MonitoringSubscription id> is required");
  const sub = await prisma.monitoringSubscription.findUnique({ where: { id } });
  if (!sub) throw new Error(`no MonitoringSubscription ${id}`);
  const cycleKey = arg("--cycle-key") ?? `manual:${new Date().toISOString().slice(0, 16)}`;
  console.log(`[monitoring-run-cycle] subscription=${sub.id} cycleKey=${cycleKey}`);
  const result = await runTrackingCycleForSubscription(sub, { cycleKey, trigger: "manual", runner: createLiveTrackingRunner() });
  const { metrics, ...rest } = result as typeof result & { metrics?: unknown };
  console.log(`[monitoring-run-cycle] ${JSON.stringify(rest)}`);
  if (metrics) {
    const m = metrics as { measured: number; notMeasured: number; mentionRate: number | null; citationRate: number | null; shareOfVoice: number | null };
    console.log(`[monitoring-run-cycle] measured=${m.measured} notMeasured=${m.notMeasured} mentionRate=${m.mentionRate} citationRate=${m.citationRate} shareOfVoice=${m.shareOfVoice}`);
  }
}

main()
  .catch((err) => {
    console.error("[monitoring-run-cycle] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
