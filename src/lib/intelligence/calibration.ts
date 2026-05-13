/**
 * GeoViz V2 calibration intelligence — pure helpers.
 *
 * This module owns the operator-judgment taxonomy: the allowlist of
 * valid values for `operatorVerdict`, `operatorConfidence`, and
 * `benchmarkTag`, the display labels the operator UI renders, and the
 * pure aggregate functions the calibration dashboard consumes to
 * surface "most over-scored industries" / "benchmark count" / etc.
 *
 * Not machine learning. Not self-modifying. The audit engine never
 * reads these values. Scoring stays exactly as it is today; this
 * surface only captures what operators think about a score.
 *
 * Architecture rules (mirrors CLAUDE.md):
 *   • Independent from report rendering, queue processing, PDF
 *     generation. Imported only by the calibration API route + the
 *     calibration dashboard component.
 *   • Pure functions. No DB, no SDK, no React. Safe to import from
 *     both server components and client components.
 *   • Versioned implicitly by the taxonomy strings stored on the row.
 *     If/when the taxonomy evolves, bump the value strings + handle
 *     legacy values explicitly here.
 */

// ────────────────────────────────────────────────────────────
// Operator verdict
// ────────────────────────────────────────────────────────────

export type OperatorVerdict =
  | "accurate"
  | "slightly_high"
  | "too_high"
  | "slightly_low"
  | "too_low";

export const OPERATOR_VERDICT_OPTIONS: ReadonlyArray<{
  value: OperatorVerdict;
  label: string;
}> = [
  { value: "accurate", label: "Accurate" },
  { value: "slightly_high", label: "Slightly High" },
  { value: "too_high", label: "Too High" },
  { value: "slightly_low", label: "Slightly Low" },
  { value: "too_low", label: "Too Low" },
];

export function isOperatorVerdict(s: unknown): s is OperatorVerdict {
  return OPERATOR_VERDICT_OPTIONS.some((o) => o.value === s);
}

export function operatorVerdictLabel(v: string | null | undefined): string {
  return OPERATOR_VERDICT_OPTIONS.find((o) => o.value === v)?.label ?? "—";
}

/**
 * Verdicts that indicate the rubric over-scored a target (verdict
 * suggests the audit was too kind). Used by the summary aggregator
 * to compute "most commonly over-scored industries."
 */
const OVER_SCORE_VERDICTS: ReadonlySet<OperatorVerdict> = new Set([
  "slightly_high",
  "too_high",
]);

const UNDER_SCORE_VERDICTS: ReadonlySet<OperatorVerdict> = new Set([
  "slightly_low",
  "too_low",
]);

// ────────────────────────────────────────────────────────────
// Operator confidence (in the score)
// ────────────────────────────────────────────────────────────

export type OperatorConfidence = "high" | "medium" | "low";

export const OPERATOR_CONFIDENCE_OPTIONS: ReadonlyArray<{
  value: OperatorConfidence;
  label: string;
}> = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function isOperatorConfidence(s: unknown): s is OperatorConfidence {
  return OPERATOR_CONFIDENCE_OPTIONS.some((o) => o.value === s);
}

export function operatorConfidenceLabel(
  v: string | null | undefined,
): string {
  return (
    OPERATOR_CONFIDENCE_OPTIONS.find((o) => o.value === v)?.label ?? "—"
  );
}

// ────────────────────────────────────────────────────────────
// Benchmark tag
// ────────────────────────────────────────────────────────────

export type BenchmarkTag =
  | "excellent_example"
  | "average_example"
  | "weak_example"
  | "edge_case";

export const BENCHMARK_TAG_OPTIONS: ReadonlyArray<{
  value: BenchmarkTag;
  label: string;
}> = [
  { value: "excellent_example", label: "Excellent Example" },
  { value: "average_example", label: "Average Example" },
  { value: "weak_example", label: "Weak Example" },
  { value: "edge_case", label: "Edge Case" },
];

export function isBenchmarkTag(s: unknown): s is BenchmarkTag {
  return BENCHMARK_TAG_OPTIONS.some((o) => o.value === s);
}

export function benchmarkTagLabel(v: string | null | undefined): string {
  return BENCHMARK_TAG_OPTIONS.find((o) => o.value === v)?.label ?? "—";
}

// ────────────────────────────────────────────────────────────
// Summary aggregator
// ────────────────────────────────────────────────────────────

/**
 * Shape of one tagged row consumed by `summarizeCalibration()`. Pure
 * interface — doesn't depend on Prisma types so the dashboard can
 * pass either the API response shape or a hand-built mock to
 * exercise the aggregator.
 */
export type CalibrationInput = {
  operatorVerdict: string | null;
  operatorConfidence: string | null;
  benchmarkTag: string | null;
  /** Normalized industry slug from the taxonomy module. May be null. */
  industryCategoryNormalized: string | null;
};

export type CalibrationSummary = {
  /** Rows with ANY calibration field set (i.e. operator has touched it). */
  taggedCount: number;
  /** Rows where operatorVerdict indicates the audit over-scored. */
  overScoredCount: number;
  /** Rows where operatorVerdict indicates the audit under-scored. */
  underScoredCount: number;
  /** Average operator confidence as 0..2 (low=0, medium=1, high=2). */
  avgConfidenceLevel: number | null;
  /** Distribution of confidence values across tagged rows. */
  confidenceDistribution: Array<{ level: OperatorConfidence; count: number }>;
  /** Industries ranked by over-score frequency (descending). */
  overScoredByIndustry: Array<{ industry: string; count: number }>;
  underScoredByIndustry: Array<{ industry: string; count: number }>;
  /** Benchmark-tag histogram for curating the future benchmark dataset. */
  benchmarkTagCounts: Array<{ tag: BenchmarkTag; label: string; count: number }>;
};

const CONFIDENCE_NUMERIC: Record<OperatorConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export function summarizeCalibration(
  rows: CalibrationInput[],
): CalibrationSummary {
  const tagged = rows.filter(
    (r) =>
      r.operatorVerdict !== null ||
      r.operatorConfidence !== null ||
      r.benchmarkTag !== null,
  );

  const overScored = tagged.filter(
    (r) =>
      r.operatorVerdict !== null &&
      OVER_SCORE_VERDICTS.has(r.operatorVerdict as OperatorVerdict),
  );
  const underScored = tagged.filter(
    (r) =>
      r.operatorVerdict !== null &&
      UNDER_SCORE_VERDICTS.has(r.operatorVerdict as OperatorVerdict),
  );

  // Confidence histogram + average (over rows that have a valid
  // confidence value).
  const confidenceCounts = new Map<OperatorConfidence, number>();
  let confSum = 0;
  let confN = 0;
  for (const r of tagged) {
    if (r.operatorConfidence && isOperatorConfidence(r.operatorConfidence)) {
      const c = r.operatorConfidence;
      confidenceCounts.set(c, (confidenceCounts.get(c) ?? 0) + 1);
      confSum += CONFIDENCE_NUMERIC[c];
      confN += 1;
    }
  }
  const avgConfidenceLevel = confN === 0 ? null : confSum / confN;
  const confidenceDistribution = OPERATOR_CONFIDENCE_OPTIONS.map((o) => ({
    level: o.value,
    count: confidenceCounts.get(o.value) ?? 0,
  })).filter((row) => row.count > 0);

  // Over/under-scored industry histograms — only count rows that
  // have BOTH a verdict in the over/under set AND a normalized
  // industry slug. "unknown" is excluded from the slug list because
  // it would dilute the signal; operator should see only tagged
  // industries.
  const overByIndustry = new Map<string, number>();
  for (const r of overScored) {
    const slug = r.industryCategoryNormalized;
    if (!slug || slug === "unknown") continue;
    overByIndustry.set(slug, (overByIndustry.get(slug) ?? 0) + 1);
  }
  const underByIndustry = new Map<string, number>();
  for (const r of underScored) {
    const slug = r.industryCategoryNormalized;
    if (!slug || slug === "unknown") continue;
    underByIndustry.set(slug, (underByIndustry.get(slug) ?? 0) + 1);
  }

  const overScoredByIndustry = [...overByIndustry.entries()]
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count);
  const underScoredByIndustry = [...underByIndustry.entries()]
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count);

  // Benchmark tag histogram across tagged rows.
  const tagCounts = new Map<BenchmarkTag, number>();
  for (const r of tagged) {
    if (r.benchmarkTag && isBenchmarkTag(r.benchmarkTag)) {
      tagCounts.set(r.benchmarkTag, (tagCounts.get(r.benchmarkTag) ?? 0) + 1);
    }
  }
  const benchmarkTagCounts = BENCHMARK_TAG_OPTIONS.map((o) => ({
    tag: o.value,
    label: o.label,
    count: tagCounts.get(o.value) ?? 0,
  })).filter((row) => row.count > 0);

  return {
    taggedCount: tagged.length,
    overScoredCount: overScored.length,
    underScoredCount: underScored.length,
    avgConfidenceLevel,
    confidenceDistribution,
    overScoredByIndustry,
    underScoredByIndustry,
    benchmarkTagCounts,
  };
}

/**
 * Display helper — turns the 0..2 numeric average into a label
 * (e.g., "Medium (1.3)") for the summary block.
 */
export function formatAvgConfidence(avg: number | null): string {
  if (avg === null || !Number.isFinite(avg)) return "—";
  const rounded = Math.round(avg);
  const label =
    rounded <= 0 ? "Low" : rounded === 1 ? "Medium" : "High";
  return `${label} (${avg.toFixed(2)})`;
}
