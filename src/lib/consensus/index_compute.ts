/**
 * Compose the GeoViz Confidence Index + Verdict + Consensus Confidence
 * labels from the 6 dimensions + cross-model agreement metrics.
 *
 * Locked design rules:
 *   - The Confidence Index is a WEIGHTED AGGREGATE of the 6 dimensions
 *     (pure deterministic). Validator outputs DO NOT enter the index
 *     number. They only feed the `consensus_confidence` label, which
 *     is surfaced separately.
 *   - The Confidence Index uses its OWN bands (Invisible Risk /
 *     Limited / Competitive / Strong / Exceptional). These DO NOT
 *     replace the deterministic score's frozen bands; they're a
 *     separate label system for a separate number.
 *
 * Dimension weights (sum to 1.00):
 *   Schema Quality              0.25  ← primacy of structured data for AI
 *   Trust Signals               0.20
 *   Business Identity           0.15
 *   Service Clarity             0.15
 *   Recommendation Readiness    0.15
 *   Coverage Depth              0.10
 */

import { bandForScore } from "./dimensions";
import type {
  AgreementMetrics,
  ConfidenceBand,
  ConsensusConfidence,
  Dimensions,
  Verdict,
} from "./types";

export const DIMENSION_WEIGHTS = {
  business_identity: 0.15,
  schema_quality: 0.25,
  trust_signals: 0.2,
  service_clarity: 0.15,
  coverage_depth: 0.1,
  recommendation_readiness: 0.15,
} as const;

export function computeConfidenceIndex(dimensions: Dimensions): {
  confidence_index: number;
  confidence_band: ConfidenceBand;
} {
  const weighted =
    dimensions.business_identity.score * DIMENSION_WEIGHTS.business_identity +
    dimensions.schema_quality.score * DIMENSION_WEIGHTS.schema_quality +
    dimensions.trust_signals.score * DIMENSION_WEIGHTS.trust_signals +
    dimensions.service_clarity.score * DIMENSION_WEIGHTS.service_clarity +
    dimensions.coverage_depth.score * DIMENSION_WEIGHTS.coverage_depth +
    dimensions.recommendation_readiness.score *
      DIMENSION_WEIGHTS.recommendation_readiness;

  const idx = Math.max(0, Math.min(100, Math.round(weighted)));
  return { confidence_index: idx, confidence_band: bandForScore(idx) };
}

/** Section 01 headline label. Three-tier coarsening of the index. */
export function computeVerdict(confidence_index: number): Verdict {
  if (confidence_index >= 75) return "Strong Visibility";
  if (confidence_index >= 40) return "Moderate Visibility";
  return "Weak Visibility";
}

/** Customer-visible cross-model confidence label. "Insufficient" when
 *  fewer than 2 providers passed, regardless of stdev. */
export function computeConsensusConfidence(
  agreement: AgreementMetrics,
): ConsensusConfidence {
  if (agreement.agreement_label === "Insufficient") return "Insufficient";
  if (agreement.agreement_label === "Strong") return "High";
  if (agreement.agreement_label === "Moderate") return "Medium";
  return "Low"; // "Divergent"
}
