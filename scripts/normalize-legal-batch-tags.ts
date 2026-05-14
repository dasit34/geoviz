/* eslint-disable no-console */
/**
 * scripts/normalize-legal-batch-tags.ts
 *
 * One-off remediation. Renormalizes the operator-supplied tags on
 * the 2026-05-14 legal/lawyer calibration batch from the informal
 * values the operator typed at submission to canonical taxonomy
 * values.
 *
 *   FROM:  industryCategoryRaw = "lawyers/legal"
 *          benchmarkTag        = "lawyers/legal 5.14.26"
 *
 *   TO:    industryCategoryRaw = "legal"
 *          benchmarkTag        = "legal_batch_2026_05_14"
 *
 *   AuditOrder.adminNotes JSON is rebuilt via stringifyCalibrationNotes
 *   so the queue-side source of truth matches the renormalized values.
 *
 * Dry-run by default. Pass `--apply` to write.
 *
 *   npx tsx scripts/normalize-legal-batch-tags.ts            # dry-run
 *   npx tsx scripts/normalize-legal-batch-tags.ts --apply    # write
 *
 * What this script does NOT touch:
 *   • reportMarkdown (customer report).
 *   • Any scoring column.
 *   • industryCategoryNormalized (already "legal" via the taxonomy).
 *   • Any row whose benchmarkTag does NOT exactly match the OLD value.
 *   • Operator review state (operatorVerdict / operatorReviewed / etc).
 *
 * Safe to re-run: idempotent. If you run it after a successful apply
 * the WHERE filter matches zero rows and the script exits cleanly.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  parseCalibrationNotes,
  stringifyCalibrationNotes,
} from "../src/lib/calibration";

const OLD_BENCHMARK_TAG = "lawyers/legal 5.14.26";
const NEW_INDUSTRY_RAW = "legal";
const NEW_BENCHMARK_TAG = "legal_batch_2026_05_14";

const APPLY = process.argv.includes("--apply");

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  console.log(
    `\n[normalize-legal-batch] mode=${APPLY ? "APPLY" : "DRY-RUN"} old=${OLD_BENCHMARK_TAG}`,
  );

  const rows = await prisma.auditIntelligence.findMany({
    where: { benchmarkTag: OLD_BENCHMARK_TAG },
    select: {
      id: true,
      auditOrderId: true,
      websiteUrl: true,
      industryCategoryRaw: true,
      industryCategoryNormalized: true,
      benchmarkTag: true,
      auditOrder: { select: { adminNotes: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (rows.length === 0) {
    console.log("\n[normalize-legal-batch] no rows match — nothing to do.\n");
    await prisma.$disconnect();
    return;
  }

  console.log(`\n[normalize-legal-batch] found ${rows.length} row(s)\n`);

  // Print the before/after preview for every row, regardless of mode.
  // Even in --apply, the operator wants to see what changed.
  const plans = rows.map((r) => {
    const parsed = parseCalibrationNotes(r.auditOrder.adminNotes);
    const nextNotes = stringifyCalibrationNotes({
      expected: parsed?.expected ?? null,
      notes: parsed?.notes ?? null,
      industry: NEW_INDUSTRY_RAW,
      benchmarkTag: NEW_BENCHMARK_TAG,
    });
    return { row: r, nextNotes };
  });

  for (const { row: r, nextNotes } of plans) {
    console.log(
      `row id=${r.id.slice(-8)} orderId=${r.auditOrderId.slice(-8)} url=${r.websiteUrl}`,
    );
    console.log(
      `  before  industryRaw="${r.industryCategoryRaw ?? "(null)"}"  normalized="${r.industryCategoryNormalized ?? "(null)"}"  benchmarkTag="${r.benchmarkTag ?? "(null)"}"`,
    );
    console.log(`  before  adminNotes=${r.auditOrder.adminNotes ?? "(null)"}`);
    console.log(
      `  after   industryRaw="${NEW_INDUSTRY_RAW}"  normalized="${r.industryCategoryNormalized ?? "(null)"}" (unchanged)  benchmarkTag="${NEW_BENCHMARK_TAG}"`,
    );
    console.log(`  after   adminNotes=${nextNotes}`);
    console.log("");
  }

  if (!APPLY) {
    console.log(
      "[normalize-legal-batch] DRY-RUN complete. Re-run with --apply to write.\n",
    );
    await prisma.$disconnect();
    return;
  }

  // Each row is written in its own transaction so a single row's
  // failure doesn't cascade. Both updates per row are atomic together.
  let ok = 0;
  let failed = 0;
  for (const { row: r, nextNotes } of plans) {
    try {
      await prisma.$transaction([
        prisma.auditIntelligence.update({
          where: { id: r.id },
          data: {
            industryCategoryRaw: NEW_INDUSTRY_RAW,
            benchmarkTag: NEW_BENCHMARK_TAG,
          },
        }),
        prisma.auditOrder.update({
          where: { id: r.auditOrderId },
          data: { adminNotes: nextNotes },
        }),
      ]);
      ok += 1;
      console.log(
        `[geo-benchmark] tag normalized orderId=${r.auditOrderId} url=${r.websiteUrl} industry=${NEW_INDUSTRY_RAW} benchmarkTag=${NEW_BENCHMARK_TAG}`,
      );
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[normalize-legal-batch] FAILED orderId=${r.auditOrderId} reason=${message}`,
      );
    }
  }

  console.log(
    `\n[normalize-legal-batch] complete — ok=${ok} failed=${failed} total=${plans.length}\n`,
  );
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[normalize-legal-batch] fatal:", err);
  process.exit(1);
});
