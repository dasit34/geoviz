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
 * Hash-scheme version stamped next to `weight_hash` / `category_hash`
 * on every new `DeterministicScore` + `ReplayBundle`. Rows WITHOUT a
 * `hash_scheme` field were stamped under scheme "v1".
 *
 *   v1 — `canonical()` passed the top-level keys as a JSON.stringify
 *        replacer array, which ALSO filters nested object keys. For
 *        CATEGORY_HASH every nested `{key,max}` / `{bucket,cats}`
 *        object serialized as `{}`, so the v1 category hash only
 *        reflected the NUMBER of categories and buckets — blind to a
 *        renamed category, a changed max, or a bucket remap.
 *        WEIGHT_HASH was unaffected (flat object).
 *   v2 — recursive canonical JSON (keys sorted at every depth).
 *
 * v1 and v2 category hashes are NOT comparable to each other; compare
 * a stamped hash only against the current structure hashed under the
 * SAME scheme (see `categoryHashMatchesCurrent`).
 */
export const HASH_SCHEME_VERSION = "v2" as const;
export type HashScheme = "v1" | typeof HASH_SCHEME_VERSION;

/**
 * Canonical JSON helper — keys sorted at every depth, array order
 * preserved, no whitespace. Guarantees the same input produces the
 * same digest regardless of authoring order.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonical(v)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const body = Object.keys(obj)
      .sort()
      .filter((k) => obj[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

/**
 * The pre-v2 canonicalizer, kept ONLY so v1-stamped hashes on
 * historical rows can still be verified against the current structure.
 * Never use for new stamps.
 */
function canonicalLegacyV1(obj: unknown): string {
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
function categoryStructure(
  categoryMax: Record<string, number>,
  bucketMap: Record<string, readonly string[]>,
) {
  const categories = Object.keys(categoryMax)
    .sort()
    .map((k) => ({ key: k, max: categoryMax[k] }));
  const buckets = Object.entries(bucketMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, cats]) => ({ bucket, cats: [...cats].sort() }));
  return { categories, buckets };
}

/**
 * Category-structure hash under a given scheme. Exported for tests and
 * for verifying historical stamps; production stamps use the
 * `CATEGORY_HASH` constant below.
 */
export function computeCategoryHash(
  categoryMax: Record<string, number>,
  bucketMap: Record<string, readonly string[]>,
  scheme: HashScheme = HASH_SCHEME_VERSION,
): string {
  const structure = categoryStructure(categoryMax, bucketMap);
  return sha256_16(
    scheme === "v1" ? canonicalLegacyV1(structure) : canonical(structure),
  );
}

export const CATEGORY_HASH: string = computeCategoryHash(CATEGORY_MAX, BUCKET_MAP);

/**
 * The current structure hashed under the legacy v1 scheme — the value
 * every pre-v2 row carries. Kept so replay can still verify those rows.
 */
export const CATEGORY_HASH_V1: string = computeCategoryHash(
  CATEGORY_MAX,
  BUCKET_MAP,
  "v1",
);

/**
 * Does a stamped category hash match the CURRENT structure? Compares
 * under the scheme the row was stamped with (absent `hash_scheme` ⇒
 * "v1"). Note a v1 match is weak evidence: v1 only proves the category
 * and bucket COUNTS are unchanged.
 */
export function categoryHashMatchesCurrent(
  stampedHash: string,
  stampedScheme: string | null | undefined,
): boolean {
  const expected =
    (stampedScheme ?? "v1") === "v1" ? CATEGORY_HASH_V1 : CATEGORY_HASH;
  return stampedHash === expected;
}
