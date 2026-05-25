/**
 * Score stability index — repeated audits of the same site should
 * produce stable results. When prior history is available, compute
 * the standard deviation across the most recent five `overall_score`
 * values. Otherwise return `null` with the reason
 * `insufficient_history`.
 *
 * Bands:
 *   stdev < 5   → stable
 *   stdev < 15  → drifting
 *   stdev ≥ 15  → volatile
 *
 * Pure.
 */

import type { ScoreHistoryEntry, StabilityResult } from "./types";

const MIN_HISTORY = 3;
const WINDOW = 5;

export function computeStability(
  history?: ScoreHistoryEntry[],
): StabilityResult {
  if (!history || history.length < MIN_HISTORY) {
    return {
      score_stability_index: null,
      score_stability_reason: "insufficient_history",
    };
  }

  const recent = history.slice(0, WINDOW).map((h) => h.overall_score);
  const n = recent.length;
  const mean = recent.reduce((a, b) => a + b, 0) / n;
  const variance =
    recent.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  const rounded = Math.round(stdev * 100) / 100;

  const reason =
    stdev < 5 ? "stable" : stdev < 15 ? "drifting" : "volatile";

  return {
    score_stability_index: rounded,
    score_stability_reason: reason,
  };
}
