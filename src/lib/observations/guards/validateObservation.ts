/**
 * Observation gate — validates an ObservationSummary against the
 * policy that decides whether it can be surfaced as decision input.
 *
 * Pure. Same summary in ⇒ same health out. Returns the explicit
 * `ObservationHealth` verdict with the four-way status and a
 * plain-English explanation operators can grep.
 *
 * Priority order (most-restrictive first):
 *
 *   1. providers_run.length < MIN_PROVIDERS  → SINGLE_PROVIDER
 *   2. agreement_score      < AGREEMENT_MIN  → DISAGREE
 *   3. max(signal_variance) > VARIANCE_SUPPRESS → SUPPRESSED
 *   4. else                                 → OK
 *
 * Priority matters: a 1-provider run that ALSO has high variance
 * lands at SINGLE_PROVIDER (the root cause), not SUPPRESSED.
 */

import type {
  ObservationHealth,
  ObservationSummary,
  SignalDimension,
} from "../types";

export const AGREEMENT_MIN = 60;
export const VARIANCE_SUPPRESS = 0.20;
export const MIN_PROVIDERS = 2;

const DIMENSIONS: SignalDimension[] = [
  "retrieval",
  "trust",
  "citation",
  "recommendation",
];

function maxVariance(
  variance: Record<SignalDimension, number>,
): { max: number; dimension: SignalDimension | null } {
  let max = 0;
  let dim: SignalDimension | null = null;
  for (const d of DIMENSIONS) {
    if (variance[d] > max) {
      max = variance[d];
      dim = d;
    }
  }
  return { max, dimension: dim };
}

export function validateObservation(
  summary: ObservationSummary,
): ObservationHealth {
  const { max, dimension } = maxVariance(summary.signal_variance);

  // Priority 1 — single provider.
  if (summary.providers_run.length < MIN_PROVIDERS) {
    return {
      status: "SINGLE_PROVIDER",
      agreement_band: summary.agreement_band,
      variance: max,
      usable: false,
      explanation: `SINGLE_PROVIDER — only ${summary.providers_run.length} provider responded (min ${MIN_PROVIDERS} required)`,
    };
  }

  // Priority 2 — disagreement.
  if (summary.agreement_score < AGREEMENT_MIN) {
    return {
      status: "DISAGREE",
      agreement_band: summary.agreement_band,
      variance: max,
      usable: false,
      explanation: `DISAGREE — agreement_score ${summary.agreement_score} below threshold ${AGREEMENT_MIN}`,
    };
  }

  // Priority 3 — suppressed by variance.
  if (max > VARIANCE_SUPPRESS) {
    return {
      status: "SUPPRESSED",
      agreement_band: summary.agreement_band,
      variance: max,
      usable: false,
      explanation: `SUPPRESSED — ${dimension ?? "signal"} variance ${max.toFixed(2)} exceeds threshold ${VARIANCE_SUPPRESS}`,
    };
  }

  // Priority 4 — OK.
  return {
    status: "OK",
    agreement_band: summary.agreement_band,
    variance: max,
    usable: true,
    explanation: `OK — ${summary.providers_run.length} providers agree (${summary.agreement_score}/100), variance within policy`,
  };
}
