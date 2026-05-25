/**
 * Consensus — agreement score across providers.
 *
 * One scalar 0..100 + one band label ("high" | "medium" | "low").
 * Driven purely by per-dimension variance — same input ⇒ same
 * output. NO bearing on scoring; agreement is observational
 * telemetry only.
 *
 * Formula:
 *   score = clamp(100 - mean(stdev across 4 dimensions) × 400, 0, 100)
 *   band  = score ≥ 80 ? "high"
 *         : score ≥ 50 ? "medium"
 *         :              "low"
 *
 * Calibrated against the brief's two examples (signals in 0..1):
 *   tight  [0.82, 0.79, 0.84, 0.80]: stdev ≈ 0.019 → score ≈ 92  → HIGH
 *   spread [0.82, 0.44, 0.86, 0.40]: stdev ≈ 0.220 → score ≈  12 → LOW
 */

import { computeSignalVariance, DIMENSIONS } from "./compareSignals";
import type { ProviderSignals } from "../types";

const VARIANCE_TO_SCORE_MULTIPLIER = 400;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function computeAgreement(
  signals: ProviderSignals[],
): { score: number; band: "high" | "medium" | "low" } {
  if (signals.length === 0) {
    // No signals at all → not "high agreement"; mark medium so
    // operators don't read it as a clean consensus.
    return { score: 50, band: "medium" };
  }

  const variances = computeSignalVariance(signals);
  const stdevs = DIMENSIONS.map((d) => variances[d]);
  const meanStdev = stdevs.reduce((a, b) => a + b, 0) / stdevs.length;

  const raw = 100 - meanStdev * VARIANCE_TO_SCORE_MULTIPLIER;
  const score = Math.round(clamp(raw, 0, 100));
  const band: "high" | "medium" | "low" =
    score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  return { score, band };
}
