/* eslint-disable no-console */
/**
 * Cron entrypoint for the daily Market Study automation — see
 * `src/lib/market-studies/automation/runTick.ts` for the actual logic
 * and `docs/MARKET_STUDY_DAILY_AUTOMATION.md` for the Railway setup.
 *
 * Deployed as its OWN Railway service (Cron Schedule, e.g. every 15
 * min) — separate from `scripts/geo-worker.ts`, which is never
 * modified or blocked by this. Idempotent and cheap on a no-op tick
 * (one indexed query), so a frequent schedule is safe.
 *
 * Never logs a secret value — only counts, ids, and classified error
 * text (the same discipline `geo-worker.ts` already follows).
 */

import { prisma } from "@/lib/db";
import { runTick } from "@/lib/market-studies/automation/runTick";

async function main(): Promise<void> {
  console.log("[market-study-daily] tick starting");
  try {
    const result = await runTick(prisma);
    console.log(`[market-study-daily] tick done · ${JSON.stringify(result)}`);
  } catch (err) {
    console.error(
      `[market-study-daily] tick threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
