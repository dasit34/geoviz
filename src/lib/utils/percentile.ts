/**
 * percentile — pure utility for picking a percentile value from a
 * numeric array.
 *
 * Defensive against:
 *   - empty arrays → null
 *   - out-of-range `p` (clamps to [0, 1] effective via the index math)
 *   - non-finite values (caller is expected to filter those upstream)
 *
 * Uses floor-of-index selection (no interpolation). Same idiom
 * previously inlined in `src/lib/cost/baseline.ts:43-51` and
 * `src/lib/intelligence/benchmarks.ts:475-483`; extracted here so
 * the two callers + the new per-audit percentile helper share a
 * single implementation.
 *
 * Pure. Same input → same output. Never throws.
 */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx];
}
