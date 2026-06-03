/**
 * Shared consensus recommendation-confidence label.
 *
 * Single source of truth for the LOW / MODERATE / HIGH presentation
 * label derived from the persisted `consensusIndex` data. Previously
 * this exact cascade was duplicated in two render components —
 * `ConsensusSummary` (the five-part agreement section) and
 * `ConsensusActionAnchor` (the Foundation Fix nudge) — kept in sync
 * only by a hand-written "re-derives the same label" comment. That is
 * a divergence risk: a future edit to one copy silently desyncs the
 * conditional render of the other. Both now import this helper.
 *
 * Frozen-surface note: this is a PRESENTATION label only. It does not
 * touch any deterministic scoring weight, band threshold, ladder
 * anchor, or the canonical GeoViz score. The cascade folds in
 * recommendation-confidence majority across passed providers plus the
 * deterministic Trust Signals and Recommendation Readiness scores so
 * that four providers AGREEING a business has weak signal cannot be
 * mislabeled HIGH.
 *
 * Pure — no I/O, no Date, no random.
 */

export type ConsensusConfidenceLabel = "LOW" | "MODERATE" | "HIGH";

export type RecommendationMajority = "low" | "medium" | "high" | null;

/**
 * Coerce a raw majority string to the closed set, or null.
 */
export function asRecommendationMajority(
  value: string | null | undefined,
): RecommendationMajority {
  if (value === "low" || value === "medium" || value === "high") return value;
  return null;
}

/**
 * Coerce a possibly-undefined numeric score to a non-negative number.
 * Mirrors the defensive readers the call sites used inline.
 */
export function asNonNegativeScore(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

export function deriveConsensusConfidenceLabel(
  passedCount: number,
  agreementLabel: string | undefined,
  recommendationMajority: RecommendationMajority,
  trustSignalsScore: number,
  recommendationReadinessScore: number,
): ConsensusConfidenceLabel {
  // Rule 1 — providers agree the business has weak recommendation
  // signal: always LOW, regardless of how tightly they cluster.
  // Agreement on a negative is not a positive signal.
  if (recommendationMajority === "low") return "LOW";

  // Rule 2 — deterministic floor: critically weak Trust Signals or
  // Recommendation Readiness blocks any HIGH/MODERATE outcome.
  if (trustSignalsScore < 35 || recommendationReadinessScore < 30) {
    return "LOW";
  }

  // Rule 3 — HIGH requires every supporting signal.
  if (
    passedCount >= 3 &&
    agreementLabel === "Strong" &&
    recommendationMajority === "high" &&
    trustSignalsScore >= 70 &&
    recommendationReadinessScore >= 70
  ) {
    return "HIGH";
  }

  // Rule 4 — MODERATE on softer combinations.
  if (
    passedCount >= 2 &&
    (agreementLabel === "Strong" || agreementLabel === "Moderate") &&
    (recommendationMajority === "high" ||
      recommendationMajority === "medium") &&
    (trustSignalsScore >= 35 || recommendationReadinessScore >= 30)
  ) {
    return "MODERATE";
  }

  return "LOW";
}
