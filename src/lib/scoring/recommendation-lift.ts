/**
 * Recommendation lift — a small additive bonus to the Recommendation
 * bucket when Trust + Brand evidence is already strong.
 *
 * AI recommendation depends on the business being **complete**,
 * **trusted**, AND **differentiated**. The Content category captures
 * differentiation; this lift captures the contribution of trust +
 * entity completeness when those signals are already in place.
 *
 * Caps at +2, gated on Trust ≥ 70% AND Brand ≥ 70% of their category
 * maxes. Never raises the bucket above its 15-point ceiling.
 *
 * Pure.
 */

import type {
  CategoryKey,
  CategoryScoreInternal,
  PublicBucketKey,
  RecommendationLiftResult,
} from "./types";

const TRUST_THRESHOLD = 0.7; // 14/20
const BRAND_THRESHOLD = 0.7; // 7/10
const MAX_LIFT = 2;

export function applyRecommendationLift(args: {
  buckets: Record<PublicBucketKey, { score: number; max: number; percentage: number }>;
  categories: Record<CategoryKey, CategoryScoreInternal>;
}): {
  buckets: Record<PublicBucketKey, { score: number; max: number; percentage: number }>;
  result: RecommendationLiftResult;
} {
  const buckets = { ...args.buckets };
  const trustRatio =
    args.categories.trust.score / args.categories.trust.max;
  const brandRatio =
    args.categories.brand.score / args.categories.brand.max;

  if (trustRatio < TRUST_THRESHOLD || brandRatio < BRAND_THRESHOLD) {
    return {
      buckets,
      result: { applied: 0, reason: null },
    };
  }

  const rec = buckets.recommendation;
  // Lift proportional to how strong both feeders are: at the threshold,
  // contributes 1; at 100% of both, contributes 2.
  const liftRaw =
    1 + (Math.min(trustRatio, brandRatio) - TRUST_THRESHOLD) * (MAX_LIFT - 1) / (1 - TRUST_THRESHOLD);
  const liftRequested = Math.round(Math.min(MAX_LIFT, Math.max(0, liftRaw)));

  // Hard cap: never exceed the bucket max.
  const room = rec.max - rec.score;
  const applied = Math.min(liftRequested, Math.max(0, room));
  if (applied === 0) {
    return {
      buckets,
      result: { applied: 0, reason: null },
    };
  }

  const adjusted = rec.score + applied;
  buckets.recommendation = {
    ...rec,
    score: adjusted,
    percentage: rec.max > 0 ? Math.round((adjusted / rec.max) * 100) : 0,
  };

  return {
    buckets,
    result: {
      applied,
      reason: `Trust + Brand both strong (trust ${Math.round(trustRatio * 100)}%, brand ${Math.round(brandRatio * 100)}%) — adding ${applied} to Recommendation`,
    },
  };
}
