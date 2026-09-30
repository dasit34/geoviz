/**
 * Calibration Engine — automatic manual-review-queue flagging.
 *
 * Pure function over already-stored/already-computed data. This is
 * the first AUTOMATIC flagging in the calibration cockpit — additive
 * alongside (never replacing) the existing manual `operatorVerdict`
 * tagging in `src/lib/intelligence/calibration.ts`. Computed once at
 * `AuditSnapshot` write time (see `scripts/calibration-batch-runner.ts`)
 * so the result stays reproducible even if an operator retags the
 * underlying `AuditIntelligence` row later.
 *
 * No LLM, no invented heuristics — every trigger thresholds a value
 * this codebase already computes elsewhere (deterministic confidence,
 * consensus agreement label, corpus mean/stddev, retry history).
 */

import type { AgreementLabel, ConfidenceBand } from "@/lib/consensus/types";
import type { ConfidenceLevel } from "@/lib/scoring/types";

/** Std-dev threshold for the score-outlier trigger. Most likely
 *  constant to need tuning once the first real batch runs — ship
 *  conservative, adjust with data, don't guess further. */
export const OUTLIER_STD_DEV_THRESHOLD = 2.5;

const LOW_CONFIDENCE_BANDS: ReadonlySet<ConfidenceBand> = new Set([
  "Invisible Risk",
  "Limited",
]);

const DISAGREEMENT_LABELS: ReadonlySet<AgreementLabel> = new Set([
  "Divergent",
  "Insufficient",
]);

/**
 * Known-contradictory finding/fix id pairs. Ships empty — this
 * category needs a real batch of data before any pattern is
 * knowable. Do not invent heuristics here speculatively.
 */
const CONTRADICTORY_ID_PAIRS: ReadonlyArray<readonly [string, string]> = [];

export type ReviewFlagInput = {
  /** `deterministicScore.confidence_level` at snapshot time. */
  confidenceLevel: ConfidenceLevel | null;
  /** `consensusIndex.confidence_band` at snapshot time. */
  confidenceBand: ConfidenceBand | null;
  /** `consensusIndex.model_agreement` at snapshot time. */
  modelAgreement: AgreementLabel | null;
  /** Most recent `ObservationHistory.observationStatus` for this audit, if any. */
  observationStatus: string | null;
  overallScore: number | null;
  /** Corpus mean/stddev at snapshot time — pass in, do not recompute here. */
  corpusMean: number | null;
  corpusStdDev: number | null;
  /** Count of this business's (websiteUrl-matched) recent orders with retryCount > 0. */
  recentFailureCount: number;
  /** True when any top finding's `evidence_used` array is empty. */
  hasEmptyEvidence: boolean;
  /** True when `consensusIndex` is present but `aiValidations` is null (validator dropout). */
  validatorDropout: boolean;
  /** Stable ids from `top_3_findings` + `top_3_recommended_fixes`. */
  recommendationIds: readonly string[];
};

export type ReviewFlagResult = {
  needsReview: boolean;
  reasons: string[];
};

export function computeNeedsReview(input: ReviewFlagInput): ReviewFlagResult {
  const reasons = new Set<string>();

  if (input.confidenceLevel === "low") reasons.add("low_confidence_score");
  if (input.confidenceBand && LOW_CONFIDENCE_BANDS.has(input.confidenceBand)) {
    reasons.add("low_confidence_band");
  }
  if (input.modelAgreement && DISAGREEMENT_LABELS.has(input.modelAgreement)) {
    reasons.add("model_disagreement");
  }
  if (input.observationStatus === "DISAGREE") {
    reasons.add("observation_disagreement");
  }
  if (
    input.overallScore !== null &&
    input.corpusMean !== null &&
    input.corpusStdDev !== null &&
    input.corpusStdDev > 0
  ) {
    const z = Math.abs(input.overallScore - input.corpusMean) / input.corpusStdDev;
    if (z > OUTLIER_STD_DEV_THRESHOLD) reasons.add("score_outlier");
  }
  if (input.recentFailureCount > 0) reasons.add("repeated_failures");
  if (input.hasEmptyEvidence) reasons.add("missing_evidence");
  if (input.validatorDropout) reasons.add("missing_evidence");
  if (hasContradictoryCombo(input.recommendationIds)) {
    reasons.add("unexpected_recommendation_combo");
  }

  return { needsReview: reasons.size > 0, reasons: [...reasons] };
}

function hasContradictoryCombo(ids: readonly string[]): boolean {
  if (CONTRADICTORY_ID_PAIRS.length === 0) return false;
  const set = new Set(ids);
  return CONTRADICTORY_ID_PAIRS.some(([a, b]) => set.has(a) && set.has(b));
}
