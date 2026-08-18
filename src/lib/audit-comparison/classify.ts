/**
 * Deterministic classification rules for the audit-comparison engine.
 * Pure functions, no I/O, no LLM. Every numeric score/dimension/
 * diagnostic delta in this feature goes through `classifyScoreDelta`
 * so the threshold lives in exactly one place and is easy to tune.
 *
 * Threshold rationale: the underlying scores are deterministic
 * integers (not LLM-sampled), so there's no floating-point jitter in
 * the mathematical sense — but a 1-point delta can still be noise
 * from minor evidence-extraction differences between two crawls of
 * the same site (e.g. one extra/missing word count). A small band
 * absorbs that without hiding genuine multi-point movement.
 */
import type {
  BooleanDelta,
  ComparisonClassification,
  ScoreDelta,
} from "./types";

/** Deltas within this band (inclusive) are UNCHANGED, not noise-as-signal. */
export const SCORE_DELTA_THRESHOLD = 2;

export function classifyScoreDelta(
  previous: number | null,
  current: number | null,
): ScoreDelta {
  if (previous === null || current === null) {
    return { previous, current, delta: null, classification: "NOT_COMPARABLE" };
  }
  const delta = current - previous;
  let classification: ComparisonClassification;
  if (Math.abs(delta) <= SCORE_DELTA_THRESHOLD) classification = "UNCHANGED";
  else if (delta > 0) classification = "IMPROVED";
  else classification = "DECLINED";
  return { previous, current, delta, classification };
}

/**
 * For booleans (mentioned/recommended yes-no), "improved" = gained a
 * true, "declined" = lost a true. No threshold — booleans have no
 * noise band.
 */
export function classifyBooleanDelta(
  previous: boolean | null,
  current: boolean | null,
): BooleanDelta {
  if (previous === null || current === null) {
    return { previous, current, classification: "NOT_COMPARABLE" };
  }
  let classification: ComparisonClassification;
  if (previous === current) classification = "UNCHANGED";
  else if (current === true) classification = "IMPROVED";
  else classification = "DECLINED";
  return { previous, current, classification };
}
