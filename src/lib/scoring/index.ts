/**
 * GeoViz deterministic scoring engine — main orchestrator.
 *
 * Pure pipeline (only impurity: the ISO timestamp for `computed_at`):
 *
 *   1. gatherEvidence(preflight + ingest + render) → Evidence
 *   2. scoreCategory × 6 (schema, crawler, trust, content, brand, tech)
 *   3. mapToBuckets(categories)                                       → buckets_raw
 *   4. applyRecommendationLift(buckets, categories)                   → +0..+2 to Rec
 *   5. applyPenalties(buckets, evidence)                              → bucket penalties
 *   6. applyBucketAndCategoryCaps(buckets, categories, evidence)      → bucket ceilings
 *   7. applySynergyBonus(categories, evidence)                        → +0..+5 to Schema (folded back into buckets)
 *   8. computeOverall(buckets)                                        → sum, clamped 0..100
 *   9. applyOverallCaps(overall, categories, evidence)                → overall ceilings
 *  10. deriveTopFindings(categories) + deriveTopFixes
 *  11. computeConfidence(evidence)                                    → 0..100 + level + inputs
 *  12. computeStability(input.history?)                               → null when < 3 prior audits
 *  13. assembleTrace(stages)                                          → ScoreTrace audit trail
 *  14. return DeterministicScore
 *
 * Same evidence ⇒ same output. The pipeline is deterministic by
 * construction — every stage is a pure function over its arguments.
 */

import type { IntelligenceIngestResult } from "@/lib/intelligence/intelligenceIngest";
import type { PreflightSignals } from "@/lib/intelligence/preflight/types";
import type { RenderIntelligenceResult } from "@/lib/intelligence/render/renderProvider";

import { bandFor } from "./bands";
import { BUCKET_MAX, mapToBuckets } from "./buckets";
import { applyBucketAndCategoryCaps, applyOverallCaps } from "./caps";
import { scoreBrand } from "./categories/brand";
import { scoreContent } from "./categories/content";
import { scoreCrawler } from "./categories/crawler";
import { scoreSchema } from "./categories/schema";
import { scoreTech } from "./categories/tech";
import { scoreTrust } from "./categories/trust";
import { computeConfidence } from "./confidence";
import { gatherEvidence } from "./evidence";
import { deriveTopFindings, deriveTopFixes } from "./findings";
import { applyPenalties } from "./penalties";
import { applyRecommendationLift } from "./recommendation-lift";
import { computeStability } from "./stability";
import { CATEGORY_HASH, WEIGHT_HASH } from "./frozen";
import { applySynergyBonus } from "./synergy";
import { assembleTrace } from "./trace";
import type {
  BucketPublic,
  CategoryKey,
  CategoryPublic,
  CategoryScoreInternal,
  DeterministicScore,
  PublicBucketKey,
  ScoreHistoryEntry,
} from "./types";
import { SCORING_VERSION } from "./version";

export type ScoreAuditInput = {
  preflightSignals: PreflightSignals | null;
  intelligenceIngest: IntelligenceIngestResult | null;
  renderResult: RenderIntelligenceResult | null;
  /**
   * Optional prior-audit history for the same `websiteUrl`. When ≥ 3
   * entries are provided, the engine computes `score_stability_index`.
   */
  history?: ScoreHistoryEntry[];
  /**
   * Optional override for `computed_at` — tests pass a fixed string so
   * snapshot equality holds across replays. In production the default
   * (new Date().toISOString()) is used.
   */
  nowIso?: string;
};

type BucketRecord = Record<PublicBucketKey, BucketPublic>;

export function scoreAudit(input: ScoreAuditInput): DeterministicScore {
  // 1. Normalize raw inputs into pure Evidence.
  const evidence = gatherEvidence({
    preflightSignals: input.preflightSignals,
    intelligenceIngest: input.intelligenceIngest,
    renderResult: input.renderResult,
  });

  // 2. Score each of the 6 categories.
  const initialCategories: Record<CategoryKey, CategoryScoreInternal> = {
    schema: scoreSchema(evidence),
    crawler: scoreCrawler(evidence),
    trust: scoreTrust(evidence),
    content: scoreContent(evidence),
    brand: scoreBrand(evidence),
    tech: scoreTech(evidence),
  };

  // 3. Raw bucket mapping (pre-caps/penalties).
  const bucketsRaw = mapToBuckets(initialCategories);

  // 4. Recommendation lift — small contribution from trust + brand.
  const { buckets: bucketsAfterLift, result: recLift } =
    applyRecommendationLift({
      buckets: bucketsRaw,
      categories: initialCategories,
    });

  // 5. Penalties (bucket-level subtractions).
  const { buckets: bucketsAfterPenalties, applied: penaltiesApplied } =
    applyPenalties({
      buckets: bucketsAfterLift,
      evidence,
    });

  // 6. Caps (bucket-level absolute ceilings).
  const { buckets: bucketsAfterCaps, applied: capsBucketApplied } =
    applyBucketAndCategoryCaps({
      buckets: bucketsAfterPenalties,
      categories: initialCategories,
      evidence,
    });

  // 7. Synergy bonus — folded into Schema, then re-aggregated into
  //    the Understanding bucket so the trace stays coherent.
  const synergy = applySynergyBonus(initialCategories, evidence);
  const categoriesPostSynergy = synergy.categories;

  // Re-map Understanding so the synergy bonus appears in its bucket.
  // (Other buckets are unaffected — synergy only adds to schema.)
  const understandingScoreFinal = clampToBucketMax(
    categoriesPostSynergy.schema.score + categoriesPostSynergy.brand.score,
    BUCKET_MAX.understanding,
  );
  // Re-apply any Understanding cap that was already binding (idempotent).
  const understandingCapped = bucketsAfterCaps.understanding;
  const understandingFinalScore = Math.min(
    understandingScoreFinal,
    understandingCapped.max,
  );
  const bucketsFinal: BucketRecord = {
    ...bucketsAfterCaps,
    understanding: {
      ...understandingCapped,
      score: understandingFinalScore,
      percentage: pct(understandingFinalScore, understandingCapped.max),
    },
  };

  // 8. Overall = sum of buckets, clamped 0..100.
  const overallRaw = sumBuckets(bucketsFinal);
  let overall = clamp(overallRaw, 0, 100);

  // 9. Overall caps.
  const { overall: overallCapped, applied: capsOverallApplied } =
    applyOverallCaps({
      overall,
      categories: categoriesPostSynergy,
      evidence,
    });
  overall = overallCapped;

  const capsApplied = [...capsBucketApplied, ...capsOverallApplied];

  // 10. Findings + fixes.
  const top_3_findings = deriveTopFindings(categoriesPostSynergy);
  const top_3_recommended_fixes = deriveTopFixes(top_3_findings);

  // 11. Confidence.
  const confidence = computeConfidence(evidence);

  // 12. Stability.
  const stability = computeStability(input.history);

  // 13. Trace.
  const evidence_summary = {
    preflight_ok: evidence.meta.preflight_ok,
    schema_validated: evidence.meta.schema_validated,
    crawlability_audited: evidence.meta.crawlability_audited,
    entity_checked: evidence.meta.entity_checked,
    ingest_present: evidence.meta.ingest_present,
    render_attempted: evidence.meta.render_attempted,
  };
  const trace = assembleTrace({
    evidence_summary,
    categories: categoriesPostSynergy,
    buckets_raw: bucketsRaw,
    caps_applied: capsApplied,
    penalties_applied: penaltiesApplied,
    recommendation_lift: recLift,
    synergy: {
      applied: synergy.applied,
      tier: synergy.tier,
      reason: synergy.reason,
    },
    buckets_final: bucketsFinal,
    overall: { score: overall, band: bandFor(overall) },
    confidence,
    stability,
  });

  // 14. Public per-category view.
  const category_scores: Record<CategoryKey, CategoryPublic> = {
    schema: toPublic(categoriesPostSynergy.schema),
    crawler: toPublic(categoriesPostSynergy.crawler),
    trust: toPublic(categoriesPostSynergy.trust),
    content: toPublic(categoriesPostSynergy.content),
    brand: toPublic(categoriesPostSynergy.brand),
    tech: toPublic(categoriesPostSynergy.tech),
  };

  return {
    scoring_version: SCORING_VERSION,
    weight_hash: WEIGHT_HASH,
    category_hash: CATEGORY_HASH,
    overall_score: overall,
    band: bandFor(overall),
    category_scores,
    synergy_bonus_applied: synergy.applied,
    synergy_bonus_reason: synergy.reason,
    synergy_bonus_tier: synergy.tier,
    public_bucket_scores: bucketsFinal,
    recommendation_lift_applied: recLift.applied,
    recommendation_lift_reason: recLift.reason,
    applied_caps: capsApplied,
    applied_penalties: penaltiesApplied,
    top_3_findings,
    top_3_recommended_fixes,
    confidence_level: confidence.level,
    confidence_score: confidence.score,
    confidence_inputs: confidence.inputs,
    score_stability_index: stability.score_stability_index,
    score_stability_reason: stability.score_stability_reason,
    evidence_summary,
    trace,
    computed_at: input.nowIso ?? new Date().toISOString(),
  };
}

function toPublic(internal: CategoryScoreInternal): CategoryPublic {
  return {
    score: internal.score,
    max: internal.max,
    signals: internal.signals,
    issues: internal.issues,
    reason: internal.reason,
    evidence_used: internal.evidence_used,
    category_confidence: internal.category_confidence,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function clampToBucketMax(n: number, max: number): number {
  return clamp(n, 0, max);
}

function pct(score: number, max: number): number {
  return max > 0 ? Math.round((score / max) * 100) : 0;
}

function sumBuckets(b: BucketRecord): number {
  return (
    b.understanding.score +
    b.retrieval.score +
    b.trust.score +
    b.recommendation.score
  );
}

// Re-exports — convenient one-stop import for callers.
export { SCORING_VERSION } from "./version";
export type {
  DeterministicScore,
  CategoryKey,
  PublicBucketKey,
  Band,
  Finding,
  Fix,
  ConfidenceLevel,
  ConfidenceScore,
  ScoreHistoryEntry,
  ScoreTrace,
} from "./types";
export { bandFor } from "./bands";
export { gatherEvidence } from "./evidence";
export { BUCKET_MAX } from "./buckets";
