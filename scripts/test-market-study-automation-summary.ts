/**
 * Tests computeSummaryStats() — the daily automation email's
 * deterministic aggregation math. Pure fixture data, no DB, no
 * Resend call. Run:
 *   npx tsx scripts/test-market-study-automation-summary.ts
 */
import {
  computeSummaryStats,
  type SummaryEntry,
} from "@/lib/market-studies/automation/summaryEmail";
import type { DeterministicScore } from "@/lib/scoring/types";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

function findings(ids: string[]): DeterministicScore {
  return {
    top_3_findings: ids.map((id) => ({ id, label: id, severity: "medium" })),
  } as unknown as DeterministicScore;
}

function completed(
  businessName: string,
  overallScore: number,
  findingIds: string[] = [],
  costUsd = 0.15,
): SummaryEntry {
  return {
    businessName,
    skipReason: null,
    auditOrder: {
      reportStatus: "generated",
      failureReason: null,
      estimatedCostUsd: costUsd,
      intelligence: { overallScore, deterministicScore: findings(findingIds) },
    },
  };
}

function failed(businessName: string, failureReason: string): SummaryEntry {
  return {
    businessName,
    skipReason: null,
    auditOrder: { reportStatus: "failed", failureReason, estimatedCostUsd: null, intelligence: null },
  };
}

function skipped(businessName: string, reason: string): SummaryEntry {
  return { businessName, skipReason: reason, auditOrder: null };
}

// Avg/median/highest/lowest over a mixed batch.
{
  const entries = [
    completed("Alpha Roofing", 80, ["schema.no_jsonld"]),
    completed("Beta HVAC", 40, ["schema.no_jsonld", "crawler.no_sitemap"]),
    completed("Gamma Dental", 60),
    failed("Delta Plumbing", "generation_failed"),
    skipped("Epsilon Co", "No website on file"),
  ];
  const summary = computeSummaryStats(entries);
  assert(summary.counts.total === 5, "counts.total covers every entry");
  assert(summary.counts.completed === 3, "counts.completed matches generated entries");
  assert(summary.counts.failed === 1, "counts.failed matches failed entries");
  assert(summary.counts.skipped === 1, "counts.skipped matches skip-reasoned entries");
  assert(summary.stats.avg === 60, `avg score is 60, got ${summary.stats.avg}`);
  assert(summary.stats.median === 60, `median score is 60, got ${summary.stats.median}`);
  assert(summary.highest?.businessName === "Alpha Roofing", "highest scoring business identified correctly");
  assert(summary.lowest?.businessName === "Beta HVAC", "lowest scoring business identified correctly");
  assert(
    summary.topFindings.some((f) => f.id === "schema.no_jsonld" && f.count === 2),
    "most-common-issue frequency counted across completed audits",
  );
  assert(
    summary.failureCounts.some(([reason, count]) => reason === "generation_failed" && count === 1),
    "provider/model failure reasons are grouped and counted",
  );
  assert(Math.abs(summary.auditCostUsd - 0.45) < 1e-9, `audit cost sums completed entries only, got ${summary.auditCostUsd}`);
}

// Empty batch — must not throw, must report nulls/zeros, not crash on division by zero.
{
  const summary = computeSummaryStats([]);
  assert(summary.counts.total === 0, "empty batch has zero total");
  assert(summary.stats.avg === null && summary.stats.median === null, "empty batch has null avg/median, not NaN");
  assert(summary.highest === null && summary.lowest === null, "empty batch has no highest/lowest");
  assert(summary.topFindings.length === 0, "empty batch has no findings");
  assert(summary.auditCostUsd === 0, "empty batch has zero cost");
}

// All-failed batch — no completed scores, but failure counts still work.
{
  const entries = [failed("A", "timeout"), failed("B", "timeout"), failed("C", "generation_failed")];
  const summary = computeSummaryStats(entries);
  assert(summary.stats.avg === null, "all-failed batch has no score average");
  assert(
    summary.failureCounts.find(([reason]) => reason === "timeout")?.[1] === 2,
    "failure counts aggregate correctly across a fully-failed batch",
  );
}

// A single completed entry is both the highest and the lowest.
{
  const summary = computeSummaryStats([completed("Solo Co", 72)]);
  assert(summary.highest?.overallScore === 72 && summary.lowest?.overallScore === 72, "single-entry batch: highest === lowest");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
