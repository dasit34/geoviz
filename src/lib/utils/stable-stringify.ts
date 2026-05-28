/**
 * stableStringify — recursively sort all object keys before
 * serializing. Two objects with identical content but different
 * key-insertion order produce the same string.
 *
 * Use for byte-equal comparisons (replay tests, snapshot diffs,
 * cache keys) where structural equality matters but key order is
 * non-deterministic across construction paths.
 *
 * Arrays preserve their order — only object keys are sorted.
 * Non-object values (string / number / boolean / null) pass through.
 * `undefined` values get the same treatment JSON.stringify gives
 * them: object properties with `undefined` values are dropped;
 * array slots with `undefined` become `null`.
 *
 * This is the recursive variant of the top-level pattern already
 * used in `src/lib/scoring/frozen.ts:42-44`'s `canonical()` helper.
 * Pure — same input → same output. Never throws.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const source = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    sorted[key] = sortKeys(source[key]);
  }
  return sorted;
}
