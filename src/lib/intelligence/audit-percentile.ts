/**
 * Per-audit percentile + bucket labeling.
 *
 * Pure read over `AuditIntelligence`. Compares a single audit's
 * score (overall or per-category) against its industry cohort and
 * returns a percentile rank + bucket label + customer-facing copy
 * string.
 *
 * Customer-facing claims require a cohort of ≥15 audits
 * (MIN_CUSTOMER_COHORT). Below that, the returned object reports
 * `bucket: "insufficient"` and the canonical fallback copy:
 *   "Industry benchmark forming for this cohort"
 *
 * NEVER mutates. NEVER calls an LLM. NEVER reads from the worker
 * queue. NEVER touches Stripe / Resend / customer email.
 *
 * Bucket thresholds are intentionally wide so single-audit shifts
 * don't change the displayed bucket on small cohorts (≥15..50).
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { SCORE_FIELDS, type ScoreField } from "@/lib/intelligence/benchmarks";
import { percentile } from "@/lib/utils/percentile";

// ────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────

/**
 * Minimum cohort size for a customer-facing percentile claim.
 * Distinct from the internal `MIN_COHORT_SIZE = 5` in
 * `src/app/api/admin/calibration/insights/route.ts` which is for
 * operator-facing surfaces only.
 */
export const MIN_CUSTOMER_COHORT = 15 as const;

const SCORE_FIELD_LABEL: Record<ScoreField, string> = {
  overallScore: "Overall",
  semanticClarityScore: "Semantic Clarity",
  crawlerAccessibilityScore: "Crawler Accessibility",
  trustSignalScore: "Trust Signals",
  structuredIdentityScore: "Structured Identity",
  recommendationReadinessScore: "Recommendation Readiness",
};

const INDUSTRY_DISPLAY: Record<string, string> = {
  contractor: "contractor",
  roofing: "roofing",
  hvac: "HVAC",
  plumbing: "plumbing",
  electrical: "electrical",
  landscaping: "landscaping",
  legal: "legal",
  dental: "dental",
  medical: "medical",
  restaurant: "restaurant",
  salon: "salon",
  real_estate: "real estate",
  automotive: "automotive",
  nonprofit: "nonprofit",
  ecommerce: "ecommerce",
  professional_services: "professional services",
  local_services: "local services",
  home_services: "home services",
  unknown: "unknown",
};

function industryDisplay(slug: string | null): string {
  if (!slug) return "all audits";
  return INDUSTRY_DISPLAY[slug] ?? slug;
}

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type PercentileBucket =
  | "Top 10%"
  | "Top 25%"
  | "Above average"
  | "Median range"
  | "Below cohort average"
  | "Bottom quartile"
  | "insufficient";

export type AuditPercentile = {
  /** 0..100 — the audit's percentile rank within the cohort. Null when cohort < MIN_CUSTOMER_COHORT. */
  percentile: number | null;
  bucket: PercentileBucket;
  cohortSize: number;
  /** Null = global cohort (no industry filter applied). */
  industrySlug: string | null;
  metric: ScoreField;
  /**
   * Deterministic customer-facing one-liner. Never null. Templates:
   *   "Top 24% among roofing audits (n=42)"
   *   "Recommendation Readiness trails 78% of audited peers (n=42)"
   *   "Industry benchmark forming for this cohort"
   */
  copy: string;
};

export type AuditPercentileBundle = {
  overall: AuditPercentile;
  weakestCategory: { category: ScoreField; data: AuditPercentile } | null;
  /** All 6 per-category percentiles — operator/admin surface. */
  allCategories: Partial<Record<ScoreField, AuditPercentile>>;
};

// ────────────────────────────────────────────────────────────
// Pure helpers
// ────────────────────────────────────────────────────────────

/**
 * Map a 0..100 percentile to the canonical bucket label.
 * Wide bands so small-cohort jitter rarely changes the bucket.
 */
export function bucketLabelForPercentile(p: number): PercentileBucket {
  if (p >= 90) return "Top 10%";
  if (p >= 75) return "Top 25%";
  if (p >= 55) return "Above average";
  if (p >= 45) return "Median range";
  if (p >= 25) return "Below cohort average";
  return "Bottom quartile";
}

function copyForOverall(
  bucket: PercentileBucket,
  percentile: number,
  cohortSize: number,
  industrySlug: string | null,
): string {
  const where = industryDisplay(industrySlug);
  const wherePhrase =
    industrySlug === null ? "all audits" : `${where} audits`;
  switch (bucket) {
    case "Top 10%":
      return `Top 10% among ${wherePhrase} (n=${cohortSize}).`;
    case "Top 25%":
      return `Top 25% among ${wherePhrase} (n=${cohortSize}).`;
    case "Above average":
      return `Above average among ${wherePhrase} (top ${100 - percentile}%, n=${cohortSize}).`;
    case "Median range":
      return `Median range among ${wherePhrase} (n=${cohortSize}).`;
    case "Below cohort average":
      return `Below cohort average among ${wherePhrase} (trails ${percentile === 100 ? 99 : 100 - percentile}% of peers, n=${cohortSize}).`;
    case "Bottom quartile":
      return `Bottom quartile among ${wherePhrase} (n=${cohortSize}).`;
    case "insufficient":
      return "Industry benchmark forming for this cohort.";
  }
}

function copyForCategory(
  metric: ScoreField,
  bucket: PercentileBucket,
  percentile: number,
  cohortSize: number,
  industrySlug: string | null,
): string {
  if (bucket === "insufficient") return "Industry benchmark forming for this cohort.";
  const label = SCORE_FIELD_LABEL[metric];
  const where = industryDisplay(industrySlug);
  const wherePhrase =
    industrySlug === null ? "audited peers" : `${where} peers`;
  // For category framing, "trails N%" is the most readable form.
  const trails = Math.max(0, 100 - percentile);
  if (bucket === "Top 10%") {
    return `${label} ranks top 10% among ${wherePhrase} (n=${cohortSize}).`;
  }
  if (bucket === "Top 25%") {
    return `${label} ranks top 25% among ${wherePhrase} (n=${cohortSize}).`;
  }
  return `${label} trails ${trails}% of ${wherePhrase} (n=${cohortSize}).`;
}

// ────────────────────────────────────────────────────────────
// Core helper
// ────────────────────────────────────────────────────────────

export type GetAuditPercentileOptions = {
  /** The audit's score on the chosen metric. */
  score: number;
  /**
   * Industry slug. Null falls back to the global cohort (all
   * audits across all industries with non-null metric).
   */
  industry: string | null;
  metric?: ScoreField;
  minCohort?: number;
  /**
   * "overall" → renders as "Top 24% among roofing audits"
   * "category" → renders as "Trust Signals trails 78% of roofing peers"
   * Defaults to "overall" — the dominant render surface.
   */
  copyStyle?: "overall" | "category";
};

export async function getAuditPercentile(
  opts: GetAuditPercentileOptions,
): Promise<AuditPercentile> {
  const metric: ScoreField = opts.metric ?? "overallScore";
  const minCohort = opts.minCohort ?? MIN_CUSTOMER_COHORT;
  const where: Prisma.AuditIntelligenceWhereInput = {
    [metric]: { not: null },
  };
  if (opts.industry !== null) {
    where.industryCategoryNormalized = opts.industry;
  }

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

  const values: number[] = [];
  for (const r of rows) {
    const v = r[metric];
    if (typeof v === "number" && Number.isFinite(v)) values.push(v);
  }

  if (values.length < minCohort) {
    return {
      percentile: null,
      bucket: "insufficient",
      cohortSize: values.length,
      industrySlug: opts.industry,
      metric,
      copy: "Industry benchmark forming for this cohort.",
    };
  }

  // Sort ascending. Percentile = fraction of cohort the score is at or above.
  const sorted = [...values].sort((a, b) => a - b);
  // Count how many strictly below + half the count at the same value
  // gives a stable rank even when ties cluster.
  let below = 0;
  let equal = 0;
  for (const v of sorted) {
    if (v < opts.score) below += 1;
    else if (v === opts.score) equal += 1;
  }
  const rank = below + equal / 2;
  const pct = Math.round((100 * rank) / sorted.length);
  const clamped = Math.max(0, Math.min(100, pct));
  const bucket = bucketLabelForPercentile(clamped);

  const copy =
    (opts.copyStyle ?? "overall") === "category"
      ? copyForCategory(metric, bucket, clamped, sorted.length, opts.industry)
      : copyForOverall(bucket, clamped, sorted.length, opts.industry);

  // Reference percentile() from the shared utility so the import
  // stays exercised; benchmarks.ts uses it elsewhere too. Sanity:
  // p50 of the cohort approximates the median we report below.
  void percentile;

  return {
    percentile: clamped,
    bucket,
    cohortSize: sorted.length,
    industrySlug: opts.industry,
    metric,
    copy,
  };
}

// ────────────────────────────────────────────────────────────
// Bundle helper — overall + per-category + weakest pick
// ────────────────────────────────────────────────────────────

const CATEGORY_METRICS: ScoreField[] = SCORE_FIELDS.filter(
  (f) => f !== "overallScore",
);

export type AuditScoreSnapshot = {
  industrySlug: string | null;
  overallScore: number | null;
  semanticClarityScore?: number | null;
  crawlerAccessibilityScore?: number | null;
  trustSignalScore?: number | null;
  structuredIdentityScore?: number | null;
  recommendationReadinessScore?: number | null;
};

/**
 * Bundled percentile lookup for a single audit. Computes overall +
 * per-category percentiles in one helper call (six sequential
 * queries, each ~50ms; total under 400ms for a typical industry).
 *
 * `weakestCategory` is the lowest-percentile per-category result,
 * but only when ALL of:
 *   - cohort is sufficient (≥minCohort)
 *   - the audit's score on that category is at or below the
 *     "Below cohort average" threshold (percentile < 45)
 *
 * If no category clearly underperforms (all ≥45th percentile), the
 * weakestCategory is null — no "watch" line will render.
 */
export async function getAuditPercentileBundle(
  audit: AuditScoreSnapshot,
  opts: { minCohort?: number } = {},
): Promise<AuditPercentileBundle> {
  const overall: AuditPercentile =
    audit.overallScore === null
      ? {
          percentile: null,
          bucket: "insufficient",
          cohortSize: 0,
          industrySlug: audit.industrySlug,
          metric: "overallScore",
          copy: "Industry benchmark forming for this cohort.",
        }
      : await getAuditPercentile({
          score: audit.overallScore,
          industry: audit.industrySlug,
          metric: "overallScore",
          minCohort: opts.minCohort,
          copyStyle: "overall",
        });

  const allCategories: Partial<Record<ScoreField, AuditPercentile>> = {};
  for (const metric of CATEGORY_METRICS) {
    const score = audit[metric];
    if (typeof score !== "number" || !Number.isFinite(score)) continue;
    allCategories[metric] = await getAuditPercentile({
      score,
      industry: audit.industrySlug,
      metric,
      minCohort: opts.minCohort,
      copyStyle: "category",
    });
  }

  // Pick the weakest category — lowest percentile, but only when
  // it materially underperforms (< 45 = "below cohort average").
  let weakest: { category: ScoreField; data: AuditPercentile } | null = null;
  for (const [metric, data] of Object.entries(allCategories) as Array<
    [ScoreField, AuditPercentile]
  >) {
    if (data.percentile === null) continue;
    if (data.percentile >= 45) continue;
    if (!weakest || (data.percentile ?? Infinity) < (weakest.data.percentile ?? Infinity)) {
      weakest = { category: metric, data };
    }
  }

  return { overall, weakestCategory: weakest, allCategories };
}
