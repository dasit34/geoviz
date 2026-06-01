/**
 * Cross-model consensus layer — public + internal types.
 *
 * The consensus layer is SECONDARY to the deterministic GeoViz score.
 * It synthesizes a customer-facing intelligence view from:
 *   1. The deterministic score (primary source of truth) — used to
 *      compute the six product-facing dimensions.
 *   2. Validator outputs from `runAiValidationLayer` — used to
 *      compute cross-model agreement labels (NOT the index number).
 *
 * Design invariants (locked):
 *   - The Confidence Index is dimension-derived (deterministic).
 *     Validator outputs DO NOT enter the index number.
 *   - The deterministic score (with its frozen bands) remains primary.
 *     The Confidence Index has its own bands and is a separate number.
 *   - N ≥ 2 providers required before any cross-model confidence label
 *     is surfaced as anything other than "Insufficient".
 *   - Pure types. No I/O. No Date.now (caller injects `nowIso` for
 *     replay determinism).
 */

export const CONSENSUS_VERSION = "consensus@1.0.0" as const;

/** Confidence Index + per-dimension bands. NEW set, distinct from the
 *  frozen deterministic bands (Invisible / At Risk / Needs Work /
 *  Competitive / AI-Ready). */
export type ConfidenceBand =
  | "Invisible Risk" // 0-39
  | "Limited" //         40-59
  | "Competitive" //     60-74
  | "Strong" //          75-89
  | "Exceptional"; //    90-100

/** Section 01 headline label. Three-step coarsening of the Confidence Index. */
export type Verdict =
  | "Weak Visibility" //     index < 40
  | "Moderate Visibility" // 40 <= index < 75
  | "Strong Visibility"; //  index >= 75

/** Customer-visible cross-model confidence label.
 *  "Insufficient" surfaces when fewer than 2 providers passed. */
export type ConsensusConfidence = "Insufficient" | "Low" | "Medium" | "High";

/** Cross-model agreement classification.
 *  "Insufficient" surfaces when fewer than 2 providers passed. */
export type AgreementLabel = "Insufficient" | "Divergent" | "Moderate" | "Strong";

/** Frozen-category contributors that feed each dimension. Documented
 *  on every dimension so the rollup is auditable. */
export type DimensionScore = {
  score: number; // 0-100, integer
  level: ConfidenceBand;
  contributing_categories: readonly string[];
};

export type Dimensions = {
  business_identity: DimensionScore;
  schema_quality: DimensionScore;
  trust_signals: DimensionScore;
  service_clarity: DimensionScore;
  coverage_depth: DimensionScore;
  recommendation_readiness: DimensionScore;
};

export type AgreementMetrics = {
  providers_passed: number;
  providers_failed: number;
  providers_unavailable: number;
  /** Standard deviation of `business_understanding_score` across
   *  passed providers. `null` if fewer than 2 providers passed. */
  business_understanding_stdev: number | null;
  /** Mode (ties favor the higher level) across passed providers.
   *  `null` if fewer than 2 providers passed. */
  category_confidence_majority: "low" | "medium" | "high" | null;
  service_area_confidence_majority: "low" | "medium" | "high" | null;
  recommendation_confidence_majority: "low" | "medium" | "high" | null;
  agreement_label: AgreementLabel;
};

/** Customer-facing four-group consensus bullets. Optional because
 *  legacy persisted records predate this field; the renderer falls
 *  back to the legacy three-line distillation when absent. */
export type ConsensusBullets = {
  agreed: string[];
  uncertain: string[];
  missing: string[];
  barriers: string[];
};

/** The full output written to `AuditIntelligence.consensusIndex`. */
export type ConsensusIndex = {
  computed_at: string;
  consensus_version: typeof CONSENSUS_VERSION;
  verdict: Verdict;
  consensus_confidence: ConsensusConfidence;
  model_agreement: AgreementLabel;
  /** 0-100 integer. Weighted aggregate of the six dimensions. */
  confidence_index: number;
  confidence_band: ConfidenceBand;
  dimensions: Dimensions;
  agreement_metrics: AgreementMetrics;
  strong_signals: string[];
  visibility_gaps: string[];
  immediate_actions: string[];
  /** Report-v3 customer-facing bullets. Populated by
   *  `buildConsensusBullets()` after `computeConsensusIndex` returns.
   *  Optional on legacy records. */
  bullets_raw?: ConsensusBullets;
  /** Same shape as `bullets_raw` but rewritten in natural customer
   *  language by a fail-soft LLM polish step. Optional on legacy
   *  records AND when the polish step fails. */
  bullets_polished?: ConsensusBullets;
};
