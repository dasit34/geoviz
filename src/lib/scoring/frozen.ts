/**
 * GeoViz deterministic scoring — freeze contract.
 *
 * Stamps every audit with a hash of the load-bearing rubric structures
 * so a future analyst can detect silent drift. The hashes are
 * SHA-256 over canonical JSON of `CATEGORY_MAX` (weights) and the
 * category structure (keys + per-key max + public bucket mapping).
 *
 * Pure — computed once at module load. No I/O, no randomness, no
 * timestamps. Same source code ⇒ same hash on every cold start.
 *
 * Detect drift with:
 *
 *   SELECT DISTINCT "deterministicScore"->>'weight_hash'
 *   FROM "AuditIntelligence";
 *
 * A row count > 1 means the rubric was edited; CLAUDE.md's
 * scoring freeze was violated.
 */

import { createHash } from "node:crypto";

import { BUCKET_MAP } from "./buckets";
import { CATEGORY_MAX } from "./types";
import { SCORING_VERSION } from "./version";

/**
 * The pure semver number — distinct from `SCORING_VERSION`
 * ("scoring@1.0.0") which carries the engine prefix for the
 * persistence string. Both are exported so future code can pick
 * whichever fits the call site.
 */
export const SCORING_VERSION_NUMBER = "1.0.0";

/** Re-export the prefixed form for backward compat. */
export { SCORING_VERSION };

/**
 * Canonical JSON helper — keys sorted, no whitespace. Guarantees the
 * same input produces the same digest regardless of authoring order.
 */
function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as Record<string, unknown>).sort());
}

function sha256_16(canonicalJson: string): string {
  return createHash("sha256").update(canonicalJson).digest("hex").slice(0, 16);
}

/**
 * SHA-256 (first 16 hex chars) of the six-category weight dictionary.
 * Flips if any weight in `CATEGORY_MAX` changes.
 */
export const WEIGHT_HASH: string = sha256_16(canonical(CATEGORY_MAX));

/**
 * SHA-256 (first 16 hex chars) of the category structure: ordered
 * keys + per-key max + public bucket mapping. Flips if a category
 * is added/removed/renamed OR if the bucket-to-category mapping
 * changes (e.g. moving `brand` from Understanding to Trust).
 */
export const CATEGORY_HASH: string = (() => {
  const ordered = (Object.keys(CATEGORY_MAX) as Array<keyof typeof CATEGORY_MAX>)
    .sort()
    .map((k) => ({ key: k, max: CATEGORY_MAX[k] }));
  const buckets = Object.entries(BUCKET_MAP)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, cats]) => ({ bucket, cats: [...cats].sort() }));
  return sha256_16(canonical({ categories: ordered, buckets }));
})();
