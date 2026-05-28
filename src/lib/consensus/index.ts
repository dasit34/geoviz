/**
 * Cross-model consensus layer — public entry point.
 *
 * Synthesizes a customer-facing intelligence view from the deterministic
 * GeoViz score + validator outputs. The deterministic score remains the
 * primary customer-facing number with its frozen bands; the
 * ConsensusIndex returned here is the SECONDARY layer.
 *
 * Pure function. Same inputs → same output (with `nowIso` injected for
 * `computed_at` replay determinism). Never throws on well-formed input.
 *
 * @see ./types.ts for the output contract
 * @see ./dimensions.ts for the dimension roll-up math
 * @see ./agreement.ts for the cross-model agreement math
 * @see ./index_compute.ts for the Confidence Index + label math
 * @see ./findings.ts for strong signals / visibility gaps / actions
 */

import type { DeterministicScore } from "@/lib/scoring/types";
import type { ValidationLayerResult } from "@/lib/validators/types";

import { computeAgreement } from "./agreement";
import { computeDimensions } from "./dimensions";
import { deriveFindings } from "./findings";
import {
  computeConfidenceIndex,
  computeConsensusConfidence,
  computeVerdict,
} from "./index_compute";
import { CONSENSUS_VERSION, type ConsensusIndex } from "./types";

export { CONSENSUS_VERSION } from "./types";
export type {
  AgreementLabel,
  AgreementMetrics,
  ConfidenceBand,
  ConsensusConfidence,
  ConsensusIndex,
  DimensionScore,
  Dimensions,
  Verdict,
} from "./types";

export function computeConsensusIndex(input: {
  deterministicScore: DeterministicScore;
  validatorResult: ValidationLayerResult | null;
  /** ISO-8601 timestamp for `computed_at`. Inject to keep replays byte-equal. */
  nowIso?: string;
}): ConsensusIndex {
  const dimensions = computeDimensions(input.deterministicScore);
  const agreement = computeAgreement(input.validatorResult);
  const { confidence_index, confidence_band } = computeConfidenceIndex(dimensions);
  const verdict = computeVerdict(confidence_index);
  const consensus_confidence = computeConsensusConfidence(agreement);
  const findings = deriveFindings({
    deterministicScore: input.deterministicScore,
    dimensions,
    validatorOutputs: input.validatorResult?.outputs ?? [],
  });

  return {
    computed_at: input.nowIso ?? new Date().toISOString(),
    consensus_version: CONSENSUS_VERSION,
    verdict,
    consensus_confidence,
    model_agreement: agreement.agreement_label,
    confidence_index,
    confidence_band,
    dimensions,
    agreement_metrics: agreement,
    strong_signals: findings.strong_signals,
    visibility_gaps: findings.visibility_gaps,
    immediate_actions: findings.immediate_actions,
  };
}
