/**
 * Freeze-scoring guard — runtime defense in depth.
 *
 * The observation layer never touches `deterministicScore` types-wise
 * (its modules don't import from `src/lib/scoring/`). This helper
 * adds a runtime check on top: snapshot the load-bearing scoring
 * fields BEFORE the observation block runs, then re-snapshot AFTER.
 * If anything diverged, throw the exact message the freeze contract
 * spec calls for.
 *
 * Use it like this when the worker later wires observations:
 *
 *     await withScoringFreeze(deterministic, async () => {
 *       await executeObservation({ businessName, websiteUrl });
 *     });
 *
 * NOT wired into any production code path in v1. Only the helper +
 * tests live here.
 */

import type { DeterministicScore } from "@/lib/scoring/types";

export const SCORING_FREEZE_VIOLATION_MESSAGE =
  "Observation layer cannot mutate deterministic scoring";

/**
 * The five fields the deterministic engine owns. Any divergence
 * here means scoring was mutated during an observation block —
 * the freeze contract was violated.
 */
function snapshot(score: DeterministicScore | null): string {
  if (!score) return "null";
  return JSON.stringify({
    overall_score: score.overall_score,
    category_scores: score.category_scores,
    public_bucket_scores: score.public_bucket_scores,
    confidence_score: score.confidence_score,
    confidence_level: score.confidence_level,
    band: score.band,
    weight_hash: score.weight_hash,
    category_hash: score.category_hash,
  });
}

/**
 * Run `block` with a before/after snapshot guard around `score`.
 * If the snapshot diverges (i.e. the observation layer mutated a
 * load-bearing scoring field), throw `SCORING_FREEZE_VIOLATION_MESSAGE`.
 *
 * Returns the block's result on success.
 */
export async function withScoringFreeze<T>(
  score: DeterministicScore | null,
  block: () => Promise<T>,
): Promise<T> {
  const before = snapshot(score);
  const result = await block();
  const after = snapshot(score);
  if (before !== after) {
    throw new Error(SCORING_FREEZE_VIOLATION_MESSAGE);
  }
  return result;
}
