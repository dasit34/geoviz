/**
 * Observation gate — typed barrier preventing the observation layer
 * from mutating the deterministic scoring output.
 *
 * Snapshots the load-bearing scoring fields BEFORE an observation
 * operation runs, then re-snapshots AFTER. If any forbidden field
 * changed, throws `ObservationMutationError(mutatedFields)` — a
 * typed exception callers can `instanceof` to handle this case
 * specifically.
 *
 * Stricter than `withScoringFreeze` (which throws a generic Error):
 *   - Throws a typed error class.
 *   - Reports WHICH specific fields were mutated (mutated_fields).
 *   - Lists ALL mutated fields, not just the first one detected.
 *
 * `withScoringFreeze` stays as the generic guard; use this when the
 * caller is specifically observation-related so error handlers can
 * distinguish observation-induced mutations from other failures.
 */

import type { DeterministicScore } from "@/lib/scoring/types";

type ForbiddenField =
  | "overall_score"
  | "band"
  | "category_scores"
  | "public_bucket_scores"
  | "confidence_score"
  | "confidence_level"
  | "top_3_recommended_fixes";

const FORBIDDEN_FIELDS: ForbiddenField[] = [
  "overall_score",
  "band",
  "category_scores",
  "public_bucket_scores",
  "confidence_score",
  "confidence_level",
  "top_3_recommended_fixes",
];

export class ObservationMutationError extends Error {
  readonly name = "ObservationMutationError";
  readonly mutated_fields: string[];

  constructor(mutated: string[]) {
    super(
      `Observation layer cannot mutate deterministic scoring — mutated fields: ${mutated.join(", ")}`,
    );
    this.mutated_fields = mutated;
    // Preserve V8 prototype for `instanceof` to work across the
    // tsx / require boundary used by the test runner.
    Object.setPrototypeOf(this, ObservationMutationError.prototype);
  }
}

function snapshotField(
  score: DeterministicScore | null,
  field: ForbiddenField,
): string {
  if (!score) return "null";
  return JSON.stringify((score as unknown as Record<string, unknown>)[field]);
}

/**
 * Run `op` with a typed before/after snapshot guard. If `op` (or
 * anything it calls) mutates any forbidden scoring field on `score`,
 * throws `ObservationMutationError` with the list of mutated fields.
 *
 * Returns the op's result on success.
 */
export async function runObservationGuarded<T>(
  score: DeterministicScore | null,
  op: () => Promise<T>,
): Promise<T> {
  const before: Record<ForbiddenField, string> = {} as Record<
    ForbiddenField,
    string
  >;
  for (const f of FORBIDDEN_FIELDS) before[f] = snapshotField(score, f);

  const result = await op();

  const mutated: string[] = [];
  for (const f of FORBIDDEN_FIELDS) {
    if (snapshotField(score, f) !== before[f]) mutated.push(f);
  }
  if (mutated.length > 0) {
    throw new ObservationMutationError(mutated);
  }
  return result;
}

export { FORBIDDEN_FIELDS };
