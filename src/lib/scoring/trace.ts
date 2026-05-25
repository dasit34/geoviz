/**
 * Trace assembler — packages stage outputs into a typed `ScoreTrace`.
 *
 * Zero logic. All ordering is fixed so the same evidence produces the
 * same trace shape every time. The renderer / calibration report
 * reads this end-to-end.
 *
 * Pure.
 */

import type {
  BucketTraceEntry,
  CapRecord,
  CategoryKey,
  CategoryScoreInternal,
  CategoryTraceEntry,
  ConfidenceScore,
  EvidenceSummary,
  PenaltyRecord,
  PublicBucketKey,
  RecommendationLiftResult,
  ScoreTrace,
  StabilityResult,
  SynergyTier,
} from "./types";
import type { Band } from "./types";

type BucketLike = Record<
  PublicBucketKey,
  { score: number; max: number; percentage: number }
>;

export function assembleTrace(args: {
  evidence_summary: EvidenceSummary;
  categories: Record<CategoryKey, CategoryScoreInternal>;
  buckets_raw: BucketLike;
  caps_applied: CapRecord[];
  penalties_applied: PenaltyRecord[];
  recommendation_lift: RecommendationLiftResult;
  synergy: { applied: number; tier: SynergyTier; reason: string | null };
  buckets_final: BucketLike;
  overall: { score: number; band: Band };
  confidence: ConfidenceScore;
  stability: StabilityResult;
}): ScoreTrace {
  const categoryTrace: CategoryTraceEntry[] = (
    ["schema", "crawler", "trust", "content", "brand", "tech"] as CategoryKey[]
  ).map((k) => {
    const c = args.categories[k];
    return {
      key: c.key,
      score: c.score,
      max: c.max,
      reason: c.reason,
      category_confidence: c.category_confidence,
    };
  });

  const bucketEntries = (b: BucketLike): BucketTraceEntry[] =>
    (
      ["understanding", "retrieval", "trust", "recommendation"] as PublicBucketKey[]
    ).map((k) => ({
      key: k,
      score: b[k].score,
      max: b[k].max,
      notes: [],
    }));

  return {
    stages: [
      { stage: "evidence", summary: args.evidence_summary },
      { stage: "categories", summary: categoryTrace },
      { stage: "buckets_raw", summary: bucketEntries(args.buckets_raw) },
      { stage: "caps_applied", summary: args.caps_applied },
      { stage: "penalties_applied", summary: args.penalties_applied },
      { stage: "recommendation_lift", summary: args.recommendation_lift },
      { stage: "synergy_bonus", summary: args.synergy },
      { stage: "buckets_final", summary: bucketEntries(args.buckets_final) },
      { stage: "overall", summary: args.overall },
      { stage: "confidence", summary: args.confidence },
      { stage: "stability", summary: args.stability },
    ],
  };
}
