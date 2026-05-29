/**
 * GeoViz V2 internal benchmark inspection layer.
 *
 * Pure read-only aggregate queries against `AuditIntelligence`.
 * NOT customer-facing. NOT exposed via any API route or UI. NOT
 * imported by report rendering, the worker, Stripe, Resend, or the
 * PDF engine. The only callers are the two internal scripts at
 * `scripts/intelligence-summary.ts` and
 * `scripts/intelligence-industry.ts`.
 *
 * Design rules:
 *   • Pure read. No `create`, `update`, `upsert`, `delete`. Every
 *     query in this file uses `aggregate` or `groupBy` only.
 *   • Null-safe averages. Prisma's `_avg` natively excludes null
 *     values; we surface the per-field row count alongside each
 *     average so callers know the sample size behind every number.
 *   • Cohort-aware. Confidence-level, scoring-version, taxonomy-
 *     version, and audit-engine-version distributions are returned
 *     alongside the averages so V2 work can immediately filter
 *     "legacy_v1" backfill rows out of a comparison without
 *     re-querying.
 *   • Stable shapes. The exported types are intentionally simple
 *     records keyed by score field name + arrays of
 *     `{ category|level|version, count }` — easy to JSON-serialize,
 *     easy to render in a CLI table without reaching for a chart
 *     library.
 *
 * What this module DOES NOT do:
 *   • Render anything. The two scripts handle pretty-printing.
 *   • Cache. Every call is a fresh query against Postgres. Good
 *     enough for internal inspection; if V2 surfaces want caching
 *     they can layer it on top of these functions.
 *   • Cross-cohort math beyond simple averages. Confidence
 *     intervals, percentile distributions, and statistical
 *     significance are V2 work and not in scope here.
 */

import { prisma } from "@/lib/db";
import { percentile } from "@/lib/utils/percentile";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/**
 * Average + sample size for a single score column. `value` is null
 * when the cohort contains zero non-null rows for the field. `count`
 * is the number of non-null rows that contributed to `value`.
 */
export type ScoreFieldStat = {
  value: number | null;
  count: number;
};

/** Score columns benchmarked by this module. All 0..100 normalized. */
export const SCORE_FIELDS = [
  "overallScore",
  "semanticClarityScore",
  "crawlerAccessibilityScore",
  "trustSignalScore",
  "structuredIdentityScore",
  "recommendationReadinessScore",
] as const;

export type ScoreField = (typeof SCORE_FIELDS)[number];

export type IndustryBenchmark = {
  industrySlug: string;
  auditCount: number;
  averages: Record<ScoreField, ScoreFieldStat>;
  confidenceDistribution: Array<{ level: string; count: number }>;
  scoringVersions: Array<{ version: string; count: number }>;
  taxonomyVersions: Array<{ version: string; count: number }>;
};

export type WeakestCategory = {
  category: ScoreField;
  averageScore: number;
  sampleCount: number;
};

export type BenchmarkSummary = {
  totalRows: number;
  industryDistribution: Array<{ slug: string; count: number }>;
  averageOverallScore: ScoreFieldStat;
  overallScoreRange: {
    min: number | null;
    max: number | null;
    count: number;
  };
  confidenceDistribution: Array<{ level: string; count: number }>;
  auditEngineVersions: Array<{ version: string; count: number }>;
  scoringVersions: Array<{ version: string; count: number }>;
  /**
   * Operator-supplied benchmark tag distribution. Counts rows where
   * the operator explicitly tagged the audit with a cohort name
   * (`AuditIntelligence.benchmarkTag` — distinct from the system-set
   * `benchmarkTags` JSON array). Excludes null. Useful for spot-
   * checking that a bulk batch landed cohort-coherent rows.
   */
  benchmarkTagDistribution: Array<{ tag: string; count: number }>;
};

// ────────────────────────────────────────────────────────────
// Helpers — null-safe Decimal → number coercion
// ────────────────────────────────────────────────────────────

/**
 * Prisma's `_avg` over integer columns returns `Decimal | null`.
 * Coerce defensively so callers always get a plain number or null,
 * never an opaque Decimal instance.
 */
function asNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v as string | number);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function asIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v as string | number);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ────────────────────────────────────────────────────────────
// 1. getIndustryBenchmark
// ────────────────────────────────────────────────────────────

/**
 * Aggregate stats for a single industry slug. Returns zero counts
 * and null averages when the cohort is empty — callers should
 * always check `auditCount > 0` before treating averages as
 * meaningful.
 */
export async function getIndustryBenchmark(
  industrySlug: string,
): Promise<IndustryBenchmark> {
  const where = { industryCategoryNormalized: industrySlug };

  const agg = await prisma.auditIntelligence.aggregate({
    where,
    _avg: {
      overallScore: true,
      semanticClarityScore: true,
      crawlerAccessibilityScore: true,
      trustSignalScore: true,
      structuredIdentityScore: true,
      recommendationReadinessScore: true,
    },
    _count: {
      _all: true,
      overallScore: true,
      semanticClarityScore: true,
      crawlerAccessibilityScore: true,
      trustSignalScore: true,
      structuredIdentityScore: true,
      recommendationReadinessScore: true,
    },
  });

  const [confidence, scoring, taxonomy] = await Promise.all([
    prisma.auditIntelligence.groupBy({
      where,
      by: ["confidenceLevel"],
      _count: { _all: true },
    }),
    prisma.auditIntelligence.groupBy({
      where,
      by: ["scoringVersion"],
      _count: { _all: true },
    }),
    prisma.auditIntelligence.groupBy({
      where,
      by: ["industryTaxonomyVersion"],
      _count: { _all: true },
    }),
  ]);

  return {
    industrySlug,
    auditCount: agg._count._all,
    averages: {
      overallScore: {
        value: asNumber(agg._avg.overallScore),
        count: agg._count.overallScore,
      },
      semanticClarityScore: {
        value: asNumber(agg._avg.semanticClarityScore),
        count: agg._count.semanticClarityScore,
      },
      crawlerAccessibilityScore: {
        value: asNumber(agg._avg.crawlerAccessibilityScore),
        count: agg._count.crawlerAccessibilityScore,
      },
      trustSignalScore: {
        value: asNumber(agg._avg.trustSignalScore),
        count: agg._count.trustSignalScore,
      },
      structuredIdentityScore: {
        value: asNumber(agg._avg.structuredIdentityScore),
        count: agg._count.structuredIdentityScore,
      },
      recommendationReadinessScore: {
        value: asNumber(agg._avg.recommendationReadinessScore),
        count: agg._count.recommendationReadinessScore,
      },
    },
    confidenceDistribution: confidence
      .map((r) => ({ level: r.confidenceLevel, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    scoringVersions: scoring
      .map((r) => ({ version: r.scoringVersion, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    taxonomyVersions: taxonomy
      .map((r) => ({
        version: r.industryTaxonomyVersion,
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count),
  };
}

// ────────────────────────────────────────────────────────────
// 2. getAllIndustryBenchmarks
// ────────────────────────────────────────────────────────────

/**
 * One benchmark per industry slug present in the data. Skips rows
 * with null `industryCategoryNormalized` (those are pre-taxonomy or
 * truly unknown — they'd dilute every cohort if folded in).
 *
 * Implemented as one `groupBy` to discover the slug list, then
 * `getIndustryBenchmark` per slug. N+1 by design — N is bounded by
 * the taxonomy size (≤19) so the cost is negligible and the code
 * stays simple.
 */
export async function getAllIndustryBenchmarks(): Promise<
  IndustryBenchmark[]
> {
  const slugRows = await prisma.auditIntelligence.groupBy({
    by: ["industryCategoryNormalized"],
    where: { industryCategoryNormalized: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
  });

  const benchmarks = await Promise.all(
    slugRows.map((r) =>
      // `industryCategoryNormalized` is non-null here due to the WHERE
      // filter above; the cast keeps the type narrow without losing
      // null-safety at the call site.
      getIndustryBenchmark(r.industryCategoryNormalized as string),
    ),
  );

  return benchmarks;
}

// ────────────────────────────────────────────────────────────
// 3. getWeakestCategoriesByIndustry
// ────────────────────────────────────────────────────────────

/**
 * Categories with the lowest average score for a given industry,
 * ascending. Useful for "what should V2 calibration target?" reads.
 * Excludes the overall score (it's a roll-up, not a category) and
 * any category with zero contributing rows.
 */
export async function getWeakestCategoriesByIndustry(
  industrySlug: string,
): Promise<WeakestCategory[]> {
  const bench = await getIndustryBenchmark(industrySlug);
  const categories: WeakestCategory[] = [];
  for (const field of SCORE_FIELDS) {
    if (field === "overallScore") continue;
    const stat = bench.averages[field];
    if (stat.value === null || stat.count === 0) continue;
    categories.push({
      category: field,
      averageScore: stat.value,
      sampleCount: stat.count,
    });
  }
  return categories.sort((a, b) => a.averageScore - b.averageScore);
}

// ────────────────────────────────────────────────────────────
// 4. getBenchmarkSummary
// ────────────────────────────────────────────────────────────

/**
 * Top-level read across the entire `AuditIntelligence` table. The
 * one query the `npm run intelligence:summary` script consumes.
 * Handles an empty table gracefully — zero counts, null averages.
 */
export async function getBenchmarkSummary(): Promise<BenchmarkSummary> {
  const [
    agg,
    industry,
    confidence,
    engineVersions,
    scoringVersions,
    benchmarkTags,
  ] = await Promise.all([
    prisma.auditIntelligence.aggregate({
      _count: { _all: true, overallScore: true },
      _avg: { overallScore: true },
      _min: { overallScore: true },
      _max: { overallScore: true },
    }),
    prisma.auditIntelligence.groupBy({
      by: ["industryCategoryNormalized"],
      _count: { _all: true },
    }),
    prisma.auditIntelligence.groupBy({
      by: ["confidenceLevel"],
      _count: { _all: true },
    }),
    prisma.auditIntelligence.groupBy({
      by: ["auditEngineVersion"],
      _count: { _all: true },
    }),
    prisma.auditIntelligence.groupBy({
      by: ["scoringVersion"],
      _count: { _all: true },
    }),
    // Operator-supplied benchmarkTag — filter null so we don't
    // pollute the count with untagged historic rows.
    prisma.auditIntelligence.groupBy({
      by: ["benchmarkTag"],
      where: { benchmarkTag: { not: null } },
      _count: { _all: true },
    }),
  ]);

  return {
    totalRows: agg._count._all,
    industryDistribution: industry
      .map((r) => ({
        slug: r.industryCategoryNormalized ?? "(null)",
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    averageOverallScore: {
      value: asNumber(agg._avg.overallScore),
      count: agg._count.overallScore,
    },
    overallScoreRange: {
      min: asIntOrNull(agg._min.overallScore),
      max: asIntOrNull(agg._max.overallScore),
      count: agg._count.overallScore,
    },
    confidenceDistribution: confidence
      .map((r) => ({ level: r.confidenceLevel, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    auditEngineVersions: engineVersions
      .map((r) => ({ version: r.auditEngineVersion, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    scoringVersions: scoringVersions
      .map((r) => ({ version: r.scoringVersion, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    benchmarkTagDistribution: benchmarkTags
      .filter((r): r is typeof r & { benchmarkTag: string } => r.benchmarkTag !== null)
      .map((r) => ({ tag: r.benchmarkTag, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
  };
}

// ────────────────────────────────────────────────────────────
// 5. getTopPerformers / getBottomPerformers
// ────────────────────────────────────────────────────────────

/**
 * A single ranked audit row used by the top/bottom performers
 * helpers. Returned shape stays small + JSON-serializable so the
 * benchmark CLI can format it on one line each.
 */
export type PerformerRanking = {
  auditOrderId: string;
  businessName: string | null;
  websiteUrl: string;
  industrySlug: string | null;
  score: number;
  metric: ScoreField;
  createdAt: Date;
};

export type PerformerRankingOptions = {
  /** Score field to rank on. Defaults to `overallScore`. */
  metric?: ScoreField;
  /** Restrict to a single normalized industry slug. */
  industry?: string;
  /** How many rows to return. Capped at 50. Default 10. */
  limit?: number;
};

const PERFORMER_LIMIT_MAX = 50;
const PERFORMER_LIMIT_DEFAULT = 10;

async function getPerformers(
  direction: "asc" | "desc",
  opts: PerformerRankingOptions,
): Promise<PerformerRanking[]> {
  const metric: ScoreField = opts.metric ?? "overallScore";
  const limit = Math.min(
    PERFORMER_LIMIT_MAX,
    Math.max(1, opts.limit ?? PERFORMER_LIMIT_DEFAULT),
  );

  // Statically select all score fields so the metric pick below is
  // type-safe. Wider read by ~50 bytes/row; acceptable for limit ≤ 50.
  const rows = await prisma.auditIntelligence.findMany({
    where: {
      [metric]: { not: null },
      ...(opts.industry
        ? { industryCategoryNormalized: opts.industry }
        : {}),
    },
    orderBy: { [metric]: direction },
    take: limit,
    select: {
      auditOrderId: true,
      businessName: true,
      websiteUrl: true,
      industryCategoryNormalized: true,
      createdAt: true,
      overallScore: true,
      semanticClarityScore: true,
      crawlerAccessibilityScore: true,
      trustSignalScore: true,
      structuredIdentityScore: true,
      recommendationReadinessScore: true,
    },
  });

  const out: PerformerRanking[] = [];
  for (const r of rows) {
    const score = asIntOrNull(r[metric]);
    if (score === null) continue;
    out.push({
      auditOrderId: r.auditOrderId,
      businessName: r.businessName,
      websiteUrl: r.websiteUrl ?? "",
      industrySlug: r.industryCategoryNormalized,
      score,
      metric,
      createdAt: r.createdAt,
    });
  }
  return out;
}

/** Highest-scoring audits by the chosen metric. */
export async function getTopPerformers(
  opts: PerformerRankingOptions = {},
): Promise<PerformerRanking[]> {
  return getPerformers("desc", opts);
}

/** Lowest-scoring audits by the chosen metric. */
export async function getBottomPerformers(
  opts: PerformerRankingOptions = {},
): Promise<PerformerRanking[]> {
  return getPerformers("asc", opts);
}

// ────────────────────────────────────────────────────────────
// 6. Percentile + distribution helpers
//
// `percentile()` is shared with src/lib/cost/baseline.ts and
// src/lib/intelligence/audit-percentile.ts via the extracted
// utility at src/lib/utils/percentile.ts.
// ────────────────────────────────────────────────────────────

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export type PercentileSummary = {
  count: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  mean: number | null;
};

/**
 * Pure-read percentile rollup over `AuditIntelligence`. Default
 * metric is `overallScore`. Optional industry filter narrows the
 * cohort. Returns null fields when the cohort has no non-null
 * rows for the metric.
 */
export async function getPercentileSummary(opts: {
  industry?: string;
  metric?: ScoreField;
} = {}): Promise<PercentileSummary> {
  const metric: ScoreField = opts.metric ?? "overallScore";
  const where: Record<string, unknown> = { [metric]: { not: null } };
  if (opts.industry) where.industryCategoryNormalized = opts.industry;
  const rows = await prisma.auditIntelligence.findMany({
    where,
    select: {
      overallScore: true,
      semanticClarityScore: true,
      crawlerAccessibilityScore: true,
      trustSignalScore: true,
      structuredIdentityScore: true,
      recommendationReadinessScore: true,
    },
  });
  const values = rows
    .map((r) => r[metric])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) {
    return { count: 0, p25: null, p50: null, p75: null, p90: null, mean: null };
  }
  return {
    count: values.length,
    p25: asNumber(percentile(values, 0.25)),
    p50: asNumber(percentile(values, 0.5)),
    p75: asNumber(percentile(values, 0.75)),
    p90: asNumber(percentile(values, 0.9)),
    mean: asNumber(meanOf(values)),
  };
}

export type ScoreBand =
  | "Invisible"
  | "At Risk"
  | "Needs Work"
  | "Competitive"
  | "AI-Ready";

export type ScoreDistributionBucket = {
  band: ScoreBand;
  count: number;
  pct: number;
};

/**
 * Distribution across the FROZEN bands from src/lib/scoring/bands.ts
 * (0–25 / 26–45 / 46–65 / 66–80 / 81–100). Uses the existing
 * thresholds — no new ranges invented.
 */
export async function getScoreDistribution(opts: {
  industry?: string;
} = {}): Promise<ScoreDistributionBucket[]> {
  const where: Record<string, unknown> = { overallScore: { not: null } };
  if (opts.industry) where.industryCategoryNormalized = opts.industry;
  const rows = await prisma.auditIntelligence.findMany({
    where,
    select: { overallScore: true },
  });
  const buckets: Record<ScoreBand, number> = {
    Invisible: 0,
    "At Risk": 0,
    "Needs Work": 0,
    Competitive: 0,
    "AI-Ready": 0,
  };
  for (const r of rows) {
    const s = r.overallScore;
    if (s === null) continue;
    if (s >= 81) buckets["AI-Ready"] += 1;
    else if (s >= 66) buckets.Competitive += 1;
    else if (s >= 46) buckets["Needs Work"] += 1;
    else if (s >= 26) buckets["At Risk"] += 1;
    else buckets.Invisible += 1;
  }
  const total = rows.length;
  const order: ScoreBand[] = [
    "Invisible",
    "At Risk",
    "Needs Work",
    "Competitive",
    "AI-Ready",
  ];
  return order.map((band) => ({
    band,
    count: buckets[band],
    pct: total === 0 ? 0 : Math.round((100 * buckets[band]) / total),
  }));
}

export type CategoryWeaknessFrequency = {
  category: ScoreField;
  industriesAffected: number;
  totalIndustriesWithData: number;
  avgScoreAcrossAffected: number;
};

/**
 * Inverts `getAllIndustryBenchmarks()` to produce a category →
 * industries-affected mapping. "Affected" = the category is the
 * weakest (lowest avg) in that industry's profile. Skips
 * `overallScore`. Returns categories sorted by industries-affected
 * desc.
 */
export async function getCategoryWeaknessFrequency(): Promise<
  CategoryWeaknessFrequency[]
> {
  const all = await getAllIndustryBenchmarks();
  const tally: Record<string, { industries: number; scores: number[] }> = {};
  let industriesWithData = 0;
  for (const bench of all) {
    // Find this industry's weakest category (excluding overallScore).
    let weakest: { cat: ScoreField; avg: number } | null = null;
    for (const cat of SCORE_FIELDS) {
      if (cat === "overallScore") continue;
      const stat = bench.averages[cat];
      if (stat.value === null) continue;
      if (!weakest || stat.value < weakest.avg) {
        weakest = { cat, avg: stat.value };
      }
    }
    if (!weakest) continue;
    industriesWithData += 1;
    const t = tally[weakest.cat] ?? { industries: 0, scores: [] };
    t.industries += 1;
    t.scores.push(weakest.avg);
    tally[weakest.cat] = t;
  }
  const rows: CategoryWeaknessFrequency[] = Object.entries(tally).map(
    ([cat, t]) => ({
      category: cat as ScoreField,
      industriesAffected: t.industries,
      totalIndustriesWithData: industriesWithData,
      avgScoreAcrossAffected:
        Math.round((meanOf(t.scores) ?? 0) * 100) / 100,
    }),
  );
  rows.sort((a, b) => b.industriesAffected - a.industriesAffected);
  return rows;
}

export type UnstableCategoryFinding = {
  category: string;
  observationCount: number;
  meanAbsDelta: number;
  stdevDelta: number;
};

/**
 * Reads `CalibrationReplay.categoryDeltas` over the time window,
 * groups deltas by category, computes per-category stdev, returns
 * the category with the highest stdev (the "most unstable").
 *
 * Requires at least `minObservations` non-null deltas per category;
 * returns null when no category meets the threshold.
 */
export async function getMostUnstableCategory(opts: {
  industry?: string;
  sinceDays?: number;
  minObservations?: number;
} = {}): Promise<UnstableCategoryFinding | null> {
  const sinceDays = opts.sinceDays ?? 14;
  const minObservations = opts.minObservations ?? 5;
  const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);

  // Optional industry filter joins through AuditOrder→AuditIntelligence.
  const where: Record<string, unknown> = {
    createdAt: { gte: since },
    categoryDeltas: { not: null },
  };
  if (opts.industry) {
    where.auditOrder = {
      intelligence: { industryCategoryNormalized: opts.industry },
    };
  }
  const rows = await prisma.calibrationReplay.findMany({
    where,
    select: { categoryDeltas: true },
  });

  // Aggregate deltas by category.
  const byCategory: Record<string, number[]> = {};
  for (const r of rows) {
    const arr = r.categoryDeltas as unknown as
      | Array<{ category: string; delta: number | null }>
      | null;
    if (!Array.isArray(arr)) continue;
    for (const cd of arr) {
      if (typeof cd.delta !== "number" || !Number.isFinite(cd.delta)) continue;
      const cat = cd.category;
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(cd.delta);
    }
  }

  let winner: UnstableCategoryFinding | null = null;
  for (const [cat, deltas] of Object.entries(byCategory)) {
    if (deltas.length < minObservations) continue;
    const s = stdev(deltas);
    const meanAbs =
      deltas.reduce((sum, v) => sum + Math.abs(v), 0) / deltas.length;
    if (!winner || s > winner.stdevDelta) {
      winner = {
        category: cat,
        observationCount: deltas.length,
        meanAbsDelta: Math.round(meanAbs * 100) / 100,
        stdevDelta: Math.round(s * 100) / 100,
      };
    }
  }
  return winner;
}
