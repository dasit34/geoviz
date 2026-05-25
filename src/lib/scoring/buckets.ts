/**
 * Public 4-bucket mapping from the internal 6-category rubric.
 *
 * Per the deterministic-scoring brief:
 *
 *   Understanding  = Schema (25) + Brand / Entity Clarity (10) → 35
 *   Retrieval      = AI Crawler Readiness (20) + Tech (10)     → 30
 *   Trust          = Local Trust Signals (20)                  → 20
 *   Recommendation = Content Depth + FAQ (15)                  → 15
 *                                                  ─────────────────
 *                                                  Total       = 100
 *
 * Each bucket exposes `score` (sum of category scores), `max`, and
 * `percentage` (normalized 0..100, integer). Pure function — same
 * category scores in, same buckets out.
 */

import type {
  BucketPublic,
  CategoryKey,
  CategoryScoreInternal,
  DeterministicScore,
} from "./types";

export const BUCKET_MAP: Record<
  keyof DeterministicScore["public_bucket_scores"],
  CategoryKey[]
> = {
  understanding: ["schema", "brand"],
  retrieval: ["crawler", "tech"],
  trust: ["trust"],
  recommendation: ["content"],
};

/**
 * Per-bucket point ceilings. Sum to 100. Frozen.
 *
 * Used by caps.ts + tests + the calibration report to bound bucket
 * values without re-deriving from the internal category map.
 */
export const BUCKET_MAX: Record<
  keyof DeterministicScore["public_bucket_scores"],
  number
> = {
  understanding: 35,
  retrieval: 30,
  trust: 20,
  recommendation: 15,
};

export function mapToBuckets(
  categories: Record<CategoryKey, CategoryScoreInternal>,
): DeterministicScore["public_bucket_scores"] {
  function bucket(keys: CategoryKey[]): BucketPublic {
    let score = 0;
    let max = 0;
    for (const k of keys) {
      score += categories[k].score;
      max += categories[k].max;
    }
    const percentage = max > 0 ? Math.round((score / max) * 100) : 0;
    return { score, max, percentage };
  }

  return {
    understanding: bucket(BUCKET_MAP.understanding),
    retrieval: bucket(BUCKET_MAP.retrieval),
    trust: bucket(BUCKET_MAP.trust),
    recommendation: bucket(BUCKET_MAP.recommendation),
  };
}
