/**
 * Calibration Engine — RecommendationFrequency + IndustryBenchmarks
 * rollup computation.
 *
 * Reuses `countFindingFrequency()` (extracted from
 * `src/lib/scoring/calibration-summary.ts`'s `scoreCalibrationSummary`)
 * instead of re-walking `top_3_findings` a second way, and mirrors the
 * `byIndustry` grouping already proven in
 * `scripts/scoring-calibration-report.ts`'s "Average score by
 * industry" section. Pure functions — no I/O.
 */

import { countFindingFrequency } from "@/lib/scoring/calibration-summary";
import type { CategoryKey, ConfidenceLevel, DeterministicScore } from "@/lib/scoring/types";

/** Matches src/lib/intelligence/calibration.ts's low/medium/high
 *  numeric convention, keyed by the scoring engine's own
 *  ConfidenceLevel ("low" | "moderate" | "high"). */
const CONFIDENCE_NUMERIC: Record<ConfidenceLevel, number> = {
  low: 0,
  moderate: 1,
  high: 2,
};

export type ScoredRow = {
  score: DeterministicScore;
  industry: string | null;
};

export type RecommendationFrequencyRow = {
  recommendationId: string;
  /** null = all-industries rollup. */
  industry: string | null;
  timesGenerated: number;
  avgScore: number | null;
  avgConfidence: number | null;
};

export type IndustryBenchmarkRow = {
  industry: string;
  auditCount: number;
  avgScore: number | null;
  medianScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
  topWeakCategories: Array<{ category: CategoryKey; avgScore: number }>;
  topRecommendedFixes: Array<{ id: string; count: number }>;
};

function avgOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function rowsForRecommendation(
  rows: ReadonlyArray<ScoredRow>,
  id: string,
): ScoredRow[] {
  return rows.filter((r) => r.score.top_3_findings.some((f) => f.id === id));
}

function frequencyRowsFor(
  rows: ReadonlyArray<ScoredRow>,
  industry: string | null,
): RecommendationFrequencyRow[] {
  const freq = countFindingFrequency(rows, { limit: 1000 });
  return freq.map(({ id, count }) => {
    const matching = rowsForRecommendation(rows, id);
    return {
      recommendationId: id,
      industry,
      timesGenerated: count,
      avgScore: avgOf(matching.map((r) => r.score.overall_score)),
      avgConfidence: avgOf(
        matching.map((r) => CONFIDENCE_NUMERIC[r.score.confidence_level]),
      ),
    };
  });
}

/** All-industries rollup (industry: null) plus one rollup per
 *  distinct detected industry. */
export function computeRecommendationFrequency(
  rows: ReadonlyArray<ScoredRow>,
): RecommendationFrequencyRow[] {
  const out: RecommendationFrequencyRow[] = frequencyRowsFor(rows, null);

  const industries = new Set(
    rows.map((r) => r.industry).filter((i): i is string => Boolean(i)),
  );
  for (const industry of industries) {
    const industryRows = rows.filter((r) => r.industry === industry);
    out.push(...frequencyRowsFor(industryRows, industry));
  }

  return out;
}

/** Mirrors the "Average score by industry" grouping already used in
 *  `scripts/scoring-calibration-report.ts`, extended with best/worst/
 *  weak-category/top-fix rollups. */
export function computeIndustryBenchmarks(
  rows: ReadonlyArray<ScoredRow>,
): IndustryBenchmarkRow[] {
  const industries = new Set(
    rows.map((r) => r.industry).filter((i): i is string => Boolean(i)),
  );
  const out: IndustryBenchmarkRow[] = [];

  for (const industry of industries) {
    const industryRows = rows.filter((r) => r.industry === industry);
    const scores = industryRows.map((r) => r.score.overall_score);

    const categoryRatios: Partial<Record<CategoryKey, number[]>> = {};
    for (const r of industryRows) {
      for (const [key, cat] of Object.entries(r.score.category_scores) as Array<
        [CategoryKey, DeterministicScore["category_scores"][CategoryKey]]
      >) {
        if (cat.max <= 0) continue;
        (categoryRatios[key] ??= []).push(cat.score / cat.max);
      }
    }
    const topWeakCategories = (
      Object.entries(categoryRatios) as Array<[CategoryKey, number[]]>
    )
      .map(([category, ratios]) => ({
        category,
        avgScore: avgOf(ratios) ?? 0,
      }))
      .sort((a, b) => a.avgScore - b.avgScore)
      .slice(0, 3);

    out.push({
      industry,
      auditCount: industryRows.length,
      avgScore: avgOf(scores),
      medianScore: medianOf(scores),
      bestScore: scores.length ? Math.max(...scores) : null,
      worstScore: scores.length ? Math.min(...scores) : null,
      topWeakCategories,
      topRecommendedFixes: countFindingFrequency(industryRows, { limit: 5 }),
    });
  }

  return out;
}
