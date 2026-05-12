/* eslint-disable no-console */
/**
 * scripts/backfill-audit-intelligence.ts
 *
 * One-shot backfill — creates `AuditIntelligence` rows for historic
 * `AuditOrder`s that completed (have `reportMarkdown`) but predate
 * the intelligence table.
 *
 * Hard invariants (mirrored by the lib function):
 *
 *   • Never overwrite an existing intelligence row. A `findUnique`
 *     pre-check + a `create` (not upsert) enforces this. A race with
 *     a concurrent worker write surfaces as Prisma error P2002,
 *     reported as `race_already_inserted` and skipped cleanly.
 *
 *   • Only audits with `reportStatus = "generated"` AND non-empty
 *     `reportMarkdown` are eligible. Empty / queued / failed rows
 *     are skipped with a logged reason.
 *
 *   • Backfilled rows are stamped `auditEngineVersion = "legacy_v1"`
 *     and `scoringVersion = "legacy_v1"` so V2 cohort queries can
 *     distinguish live vs retroactively-built data.
 *
 *   • `confidenceLevel` caps at `"medium"` for backfill rows; we
 *     don't claim high confidence on historic markdown.
 *
 *   • `operatorReviewed` is inferred from the order's existing
 *     `reviewStatus` enum (true only when `"approved"`).
 *
 * Usage:
 *
 *   npm run backfill:audit-intelligence -- --dry-run
 *   npm run backfill:audit-intelligence -- --dry-run --verbose
 *   npm run backfill:audit-intelligence -- --dry-run --limit=10
 *   npm run backfill:audit-intelligence
 *
 * **Always dry-run first.** The summary tells you exactly how many
 * rows would be created, how many would be skipped (with reasons),
 * and the per-field population profile across the cohort. Inspect
 * that output before running the real backfill.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  backfillAuditIntelligence,
  type BackfillFieldStats,
} from "../src/lib/audit-intelligence";

const ARGS = new Set(process.argv.slice(2));
const RAW_ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.has("--dry-run");
const VERBOSE = ARGS.has("--verbose");
const LIMIT = (() => {
  const flag = RAW_ARGS.find((a) => a.startsWith("--limit="));
  if (!flag) return undefined;
  const n = Number(flag.slice("--limit=".length));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined;
})();

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const mode = DRY_RUN ? "DRY-RUN" : "WRITE";

  console.log(
    `[backfill] mode=${mode}${LIMIT ? ` limit=${LIMIT}` : ""} verbose=${VERBOSE}`,
  );

  if (!DRY_RUN) {
    console.log(
      "[backfill] WRITE mode active. Rows will be inserted. Press Ctrl-C in the next 3 seconds to abort…",
    );
    await new Promise((r) => setTimeout(r, 3000));
  }

  const candidates = await prisma.auditOrder.findMany({
    where: {
      reportStatus: "generated",
      reportMarkdown: { not: null },
      intelligence: { is: null },
    },
    select: {
      id: true,
      businessName: true,
      websiteUrl: true,
      competitorUrl: true,
      reportMarkdown: true,
      reviewStatus: true,
      reportGeneratedAt: true,
    },
    orderBy: { reportGeneratedAt: "asc" },
    take: LIMIT,
  });

  console.log(
    `[backfill] candidates: ${candidates.length} order(s) with generated reports and no intelligence row`,
  );

  const counts = { backfilled: 0, wouldBackfill: 0, skipped: 0 };
  const skipReasons = new Map<string, number>();
  const fieldPop: Record<keyof BackfillFieldStats, number> = {
    overallScorePopulated: 0,
    semanticClarityScorePopulated: 0,
    crawlerAccessibilityScorePopulated: 0,
    trustSignalScorePopulated: 0,
    structuredIdentityScorePopulated: 0,
    recommendationReadinessScorePopulated: 0,
    industryDetected: 0,
    industrySlug: 0, // unused as a count — slug histogram lives below
    operatorReviewed: 0,
    confidenceLevel: 0, // unused — confidence histogram lives below
    populatedScoreCount: 0, // running sum, averaged in summary
  };
  const slugHistogram = new Map<string, number>();
  const confidenceHistogram = new Map<string, number>();
  let totalPopulatedScoreCount = 0;

  for (const c of candidates) {
    const result = await backfillAuditIntelligence({
      orderId: c.id,
      businessName: c.businessName,
      websiteUrl: c.websiteUrl,
      competitorUrl: c.competitorUrl,
      reportMarkdown: c.reportMarkdown,
      reviewStatus: c.reviewStatus,
      dryRun: DRY_RUN,
    });

    if (!result.ok) {
      counts.skipped += 1;
      skipReasons.set(
        result.reason,
        (skipReasons.get(result.reason) ?? 0) + 1,
      );
      if (VERBOSE) {
        console.log(
          `[backfill] skip orderId=${c.id} reason=${result.reason}`,
        );
      }
      continue;
    }

    if (result.outcome === "backfilled") counts.backfilled += 1;
    else counts.wouldBackfill += 1;

    if (result.stats.overallScorePopulated) fieldPop.overallScorePopulated += 1;
    if (result.stats.semanticClarityScorePopulated)
      fieldPop.semanticClarityScorePopulated += 1;
    if (result.stats.crawlerAccessibilityScorePopulated)
      fieldPop.crawlerAccessibilityScorePopulated += 1;
    if (result.stats.trustSignalScorePopulated)
      fieldPop.trustSignalScorePopulated += 1;
    if (result.stats.structuredIdentityScorePopulated)
      fieldPop.structuredIdentityScorePopulated += 1;
    if (result.stats.recommendationReadinessScorePopulated)
      fieldPop.recommendationReadinessScorePopulated += 1;
    if (result.stats.industryDetected) fieldPop.industryDetected += 1;
    if (result.stats.operatorReviewed) fieldPop.operatorReviewed += 1;
    totalPopulatedScoreCount += result.stats.populatedScoreCount;

    slugHistogram.set(
      result.stats.industrySlug,
      (slugHistogram.get(result.stats.industrySlug) ?? 0) + 1,
    );
    confidenceHistogram.set(
      result.stats.confidenceLevel,
      (confidenceHistogram.get(result.stats.confidenceLevel) ?? 0) + 1,
    );

    if (VERBOSE) {
      console.log(
        `[backfill] ${result.outcome} orderId=${c.id} confidence=${result.stats.confidenceLevel} scores=${result.stats.populatedScoreCount}/6 industry=${result.stats.industrySlug} reviewed=${result.stats.operatorReviewed}`,
      );
    }
  }

  const total = counts.backfilled + counts.wouldBackfill + counts.skipped;

  console.log("\n[backfill] ────── Summary ──────");
  console.log(`  Mode:               ${mode}`);
  console.log(`  Candidates found:   ${total}`);
  if (DRY_RUN) {
    console.log(`  Would backfill:     ${counts.wouldBackfill}`);
  } else {
    console.log(`  Backfilled:         ${counts.backfilled}`);
  }
  console.log(`  Skipped:            ${counts.skipped}`);

  if (skipReasons.size > 0) {
    console.log("\n  Skip reasons:");
    for (const [reason, n] of [...skipReasons].sort((a, b) => b[1] - a[1])) {
      console.log(`    - ${reason}: ${n}`);
    }
  }

  const populated = counts.backfilled + counts.wouldBackfill;
  if (populated > 0) {
    console.log(`\n  Field population (across ${populated} ${DRY_RUN ? "would-be" : "written"} rows):`);
    printPopField("overallScore", fieldPop.overallScorePopulated, populated);
    printPopField(
      "semanticClarityScore",
      fieldPop.semanticClarityScorePopulated,
      populated,
    );
    printPopField(
      "crawlerAccessibilityScore",
      fieldPop.crawlerAccessibilityScorePopulated,
      populated,
    );
    printPopField(
      "trustSignalScore",
      fieldPop.trustSignalScorePopulated,
      populated,
    );
    printPopField(
      "structuredIdentityScore",
      fieldPop.structuredIdentityScorePopulated,
      populated,
    );
    printPopField(
      "recommendationReadinessScore",
      fieldPop.recommendationReadinessScorePopulated,
      populated,
    );
    printPopField(
      "industry detected (non-unknown)",
      fieldPop.industryDetected,
      populated,
    );
    printPopField(
      "operatorReviewed (review = approved)",
      fieldPop.operatorReviewed,
      populated,
    );
    const avgScores =
      Math.round((totalPopulatedScoreCount / populated) * 10) / 10;
    console.log(
      `    avg score categories parsed:   ${avgScores}/6 per row`,
    );

    console.log("\n  Always-null V1 placeholder fields (unchanged from worker path):");
    console.log("    renderabilityScore, schemaDetected, llmsTxtDetected,");
    console.log("    robotsTxtDetected, sitemapDetected, mobileRenderOk,");
    console.log("    pagesIndexable, location, promptVersion, operatorNotes");

    console.log("\n  Stamped on every backfilled row:");
    console.log('    auditEngineVersion = "legacy_v1"');
    console.log('    scoringVersion     = "legacy_v1"');
    console.log('    industryTaxonomyVersion = "v1"  (current taxonomy)');

    if (confidenceHistogram.size > 0) {
      console.log("\n  Confidence distribution (backfill caps at \"medium\"):");
      for (const [level, n] of confidenceHistogram) {
        console.log(`    - ${level}: ${n}`);
      }
    }

    if (slugHistogram.size > 0) {
      const sorted = [...slugHistogram].sort((a, b) => b[1] - a[1]);
      console.log("\n  Industry slug distribution:");
      for (const [slug, n] of sorted) {
        console.log(`    - ${slug}: ${n}`);
      }
    }
  }

  if (DRY_RUN) {
    console.log(
      "\n[backfill] DRY-RUN complete — no rows were written.\n           Re-run without --dry-run to apply.",
    );
  } else {
    console.log("\n[backfill] WRITE complete.");
  }

  await prisma.$disconnect();
}

function printPopField(label: string, n: number, total: number): void {
  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
  const nullCount = total - n;
  const padLabel = label.padEnd(34, " ");
  console.log(
    `    ${padLabel} ${String(n).padStart(4, " ")}/${String(total).padEnd(4, " ")} populated (${pct}%)${nullCount > 0 ? `, ${nullCount} null` : ""}`,
  );
}

main().catch((err) => {
  console.error("[backfill] fatal error:", err);
  process.exit(1);
});
