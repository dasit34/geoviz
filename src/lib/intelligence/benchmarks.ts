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
