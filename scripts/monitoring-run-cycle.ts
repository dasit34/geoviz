/* eslint-disable no-console */
/**
 * Manual trigger: run (or resume) ONE prompt-tracking cycle for one
 * monitoring subscription — STAGING / NON-PRODUCTION ONLY (strict guard,
 * no override).
 *
 *   DATABASE_URL=<staging> GEOVIZ_NONPROD_DB_HOSTS=<host> \
 *     npx tsx scripts/monitoring-run-cycle.ts --subscription <id> [--cycle-key <key>]
 *
 * Re-running with the same key resumes that cycle; a finished cycle makes
 * zero provider calls. Samples whose provider outcome is UNKNOWN (possibly
 * billed) are never re-issued automatically. An operator can re-issue them
 * only with BOTH flags, accepting a possible duplicate charge:
 *
 *     --retry-unknown --confirm-possible-duplicate-charge
 */
import "./lib/require-nonprod-db";

import { prisma } from "../src/lib/db";
import { createLiveTrackingClient } from "../src/lib/monitoring/tracking/providers";
import { runTrackingCycleForSubscription } from "../src/lib/monitoring/tracking/service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const id = arg("--subscription");
  if (!id) throw new Error("--subscription <MonitoringSubscription id> is required");
  const retryUnknown = process.argv.includes("--retry-unknown");
  if (retryUnknown && !process.argv.includes("--confirm-possible-duplicate-charge")) {
    throw new Error("--retry-unknown re-issues requests that may already have been billed; add --confirm-possible-duplicate-charge to proceed.");
  }
  const sub = await prisma.monitoringSubscription.findUnique({ where: { id } });
  if (!sub) throw new Error(`no MonitoringSubscription ${id}`);
  const cycleKey = arg("--cycle-key") ?? `manual:${new Date().toISOString().slice(0, 16)}`;
  console.log(`[monitoring-run-cycle] subscription=${sub.id} cycleKey=${cycleKey}${retryUnknown ? " RETRY-UNKNOWN" : ""}`);
  const result = await runTrackingCycleForSubscription(sub, { cycleKey, trigger: "manual", client: createLiveTrackingClient(), retryUnknown });
  if (result.outcome !== "ran") return void console.log(`[monitoring-run-cycle] ${JSON.stringify(result)}`);
  const { metrics, ...rest } = result;
  console.log(`[monitoring-run-cycle] ${JSON.stringify(rest)}`);
  if (metrics) {
    const pct = (x: number | null) => (x === null ? "n/a" : `${Math.round(x * 1000) / 10}%`);
    console.log(
      `[monitoring-run-cycle] samples=${metrics.answers} measured=${metrics.measured} coverage=${pct(metrics.coverage)} unknown=${metrics.unknownOutcomes} ` +
        `mentionRate=${pct(metrics.mentionRate)} citationRate=${pct(metrics.citationRate)} rankedSamples=${metrics.rankedSamples} avgPosition=${metrics.averagePosition ?? "n/a"} shareOfVoice=${pct(metrics.shareOfVoice)}`,
    );
  }
}

main()
  .catch((err) => {
    console.error("[monitoring-run-cycle] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
