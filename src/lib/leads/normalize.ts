/**
 * Lead normalization — the ONLY place a raw discovery-provider record
 * gets turned into the fields stored on `Lead`. No provider file
 * calls anything here; it's a strict one-way layer, provider →
 * `NormalizedBusinessRecord` → (this module) → `Lead` fields.
 *
 * Domain and category normalization reuse existing GeoViz utilities
 * rather than reinventing them, so a lead lands in the exact same
 * domain-identity and industry-taxonomy vocabulary the rest of the
 * app already uses:
 *   - `normalizeDomain()` — src/lib/business/normalize-domain.ts,
 *     already the canonical identity key for `Business.normalizedDomain`.
 *   - `normalizeIndustry()` — src/lib/intelligence/industry-taxonomy.ts,
 *     already the canonical slug for `AuditIntelligence.
 *     industryCategoryNormalized` / `QueryLibraryEntry.industryNormalized`.
 *
 * Phone/name/address normalizers below are new, independent functions
 * — not an extraction of `entityConsistency.ts`'s private `normPhone`/
 * `normName` helpers (kept that file untouched; see the lead-gen plan's
 * risk log for the tradeoff). They're written to the same philosophy
 * (digits-only phone; lowercase + whitespace-collapse for names) plus
 * the extra robustness cross-provider dedup needs (legal-suffix
 * stripping for names, unit/suite stripping for addresses).
 */

import { normalizeDomain } from "@/lib/business/normalize-domain";
import { normalizeIndustry } from "@/lib/intelligence/industry-taxonomy";

export { normalizeDomain, normalizeIndustry };

/** Digits-only phone, for exact-match dedup comparison. */
export function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

// Common legal-entity suffixes stripped for cross-provider name
// matching — two providers reporting "Rick's Plumbing LLC" and
// "Rick's Plumbing" should still match.
const LEGAL_SUFFIX_RE =
  /\b(llc|l\.l\.c\.?|inc|inc\.?|incorporated|co|co\.?|corp|corp\.?|corporation|ltd|ltd\.?|pllc|pc|p\.c\.?)\b\.?$/i;

/**
 * Lowercase + whitespace-collapse + trailing legal-suffix strip, for
 * dedup comparison only — never used for display.
 */
export function normalizeBusinessNameForDedup(
  name: string | null | undefined,
): string | null {
  if (!name) return null;
  let normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
  // Strip a trailing legal suffix, then re-trim/collapse in case that
  // left a stray comma/space ("rick's plumbing, llc" -> "rick's plumbing").
  normalized = normalized
    .replace(/,?\s*$/, "")
    .replace(LEGAL_SUFFIX_RE, "")
    .replace(/,\s*$/, "")
    .trim();
  return normalized.length > 0 ? normalized : null;
}

// Common unit/suite tokens stripped before comparison — not
// address-parsing-grade, just consistent enough for combined
// name+address dedup matching.
const UNIT_TOKEN_RE = /\b(suite|ste|unit|apt|#)\s*\S+/gi;

/**
 * Lowercase + unit/suite-strip + whitespace-collapse, for dedup
 * comparison only — never used for display.
 */
export function normalizeAddressForDedup(
  address: string | null | undefined,
): string | null {
  if (!address) return null;
  const normalized = address
    .toLowerCase()
    .replace(UNIT_TOKEN_RE, "")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > 0 ? normalized : null;
}
