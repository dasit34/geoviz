/**
 * GeoViz industry taxonomy (V2 benchmarking foundation).
 *
 * Pure module — no DB, no rendering, no network. Imported by the
 * intelligence persistence path (`src/lib/audit-intelligence.ts`)
 * and only by it. NOT customer-facing. NOT exposed in any UI.
 *
 * Why a taxonomy at all:
 *   V2 work (benchmark cohorts, industry comparisons, calibration
 *   targets) needs a stable, low-cardinality category for each
 *   audit row. We can't expect customers, operators, or AI-emitted
 *   markdown to use the same spelling — "roofer", "Roofing
 *   Company", "Commercial Roofing Services" all need to collapse
 *   to the slug `roofing`.
 *
 * Versioning policy:
 *   `TAXONOMY_VERSION` is written to every intelligence row in the
 *   `industryTaxonomyVersion` column. Any change that alters the
 *   slug set or the mapping rules MUST bump the version. Historic
 *   rows then stay readable under their original interpretation
 *   even as the taxonomy evolves — V2 queries can filter by
 *   `industryTaxonomyVersion = 'v1'` to compare apples to apples.
 *
 * Confidence policy:
 *   The normalizer returns the slug only when a clear keyword match
 *   exists. Ambiguous or empty inputs return `"unknown"`. We never
 *   guess — the cost of mislabeling an audit is a polluted
 *   benchmark cohort, which is worse than `unknown` everywhere.
 *
 * --------------------------------------------------------------
 * INLINE EXAMPLES (informal doctest — there's no test runner)
 * --------------------------------------------------------------
 *
 *   normalizeIndustry("roofer")               → { raw: "roofer", normalized: "roofing", version: "v1" }
 *   normalizeIndustry("Roofing Company")      → { raw: "Roofing Company", normalized: "roofing", version: "v1" }
 *   normalizeIndustry("HVAC contractor")      → { raw: "HVAC contractor", normalized: "hvac", version: "v1" }
 *   normalizeIndustry("heating and cooling")  → { raw: "heating and cooling", normalized: "hvac", version: "v1" }
 *   normalizeIndustry("plumber")              → { raw: "plumber", normalized: "plumbing", version: "v1" }
 *   normalizeIndustry("law firm")             → { raw: "law firm", normalized: "legal", version: "v1" }
 *   normalizeIndustry("attorney at law")      → { raw: "attorney at law", normalized: "legal", version: "v1" }
 *   normalizeIndustry("dentist")              → { raw: "dentist", normalized: "dental", version: "v1" }
 *   normalizeIndustry("dental office")        → { raw: "dental office", normalized: "dental", version: "v1" }
 *   normalizeIndustry("hair salon")           → { raw: "hair salon", normalized: "salon", version: "v1" }
 *   normalizeIndustry("barber shop")          → { raw: "barber shop", normalized: "salon", version: "v1" }
 *   normalizeIndustry("day spa")              → { raw: "day spa", normalized: "salon", version: "v1" }
 *   normalizeIndustry("realtor")              → { raw: "realtor", normalized: "real_estate", version: "v1" }
 *   normalizeIndustry("auto repair shop")     → { raw: "auto repair shop", normalized: "automotive", version: "v1" }
 *   normalizeIndustry("non-profit org")       → { raw: "non-profit org", normalized: "nonprofit", version: "v1" }
 *   normalizeIndustry("shopify store")        → { raw: "shopify store", normalized: "ecommerce", version: "v1" }
 *   normalizeIndustry("accountant")           → { raw: "accountant", normalized: "professional_services", version: "v1" }
 *   normalizeIndustry(null)                   → { raw: null,  normalized: "unknown",  version: "v1" }
 *   normalizeIndustry("")                     → { raw: null,  normalized: "unknown",  version: "v1" }
 *   normalizeIndustry("widgets and stuff")    → { raw: "widgets and stuff", normalized: "unknown", version: "v1" }
 */

export const TAXONOMY_VERSION = "v1";

export type IndustrySlug =
  | "contractor"
  | "roofing"
  | "hvac"
  | "plumbing"
  | "electrical"
  | "landscaping"
  | "legal"
  | "dental"
  | "medical"
  | "restaurant"
  | "salon"
  | "real_estate"
  | "automotive"
  | "nonprofit"
  | "ecommerce"
  | "professional_services"
  | "local_services"
  | "home_services"
  | "unknown";

export type IndustryNormalization = {
  /** The unnormalized input we received, trimmed. Null when empty. */
  raw: string | null;
  /** The canonical taxonomy slug. Always set; defaults to "unknown". */
  normalized: IndustrySlug;
  /** Frozen taxonomy version used to produce `normalized`. */
  version: string;
};

/**
 * Priority-ordered list of (regex, slug) pairs. ORDER MATTERS: the
 * first pattern that matches wins, so more-specific patterns must
 * appear before broader ones (e.g. `roofing` before `contractor`,
 * `dental` before `medical`).
 *
 * Patterns are run against a lowercased + de-punctuated copy of the
 * input. Word boundaries (`\b`) are used so "roof" doesn't
 * accidentally match "roofer" twice or "waterproof".
 */
const RULES: ReadonlyArray<{ pattern: RegExp; slug: IndustrySlug }> = [
  // --- vertical-specific trades (most specific first) ---
  { pattern: /\b(roof(?:er|ers|ing)?)\b/, slug: "roofing" },
  { pattern: /\bhvac\b|\bheating\s+(?:and|&)\s+(?:cooling|air)\b|\bair\s+conditioning\b|\bfurnace\b/, slug: "hvac" },
  { pattern: /\b(plumb(?:er|ers|ing))\b/, slug: "plumbing" },
  { pattern: /\b(electric(?:ian|ians|al))\b/, slug: "electrical" },
  { pattern: /\b(landscap(?:er|ers|ing)|lawn\s+care|hardscap(?:e|ing))\b/, slug: "landscaping" },

  // --- professional verticals ---
  { pattern: /\b(law\s+firm|lawyer|lawyers|attorney|attorneys|legal\s+services?|law\s+office)\b/, slug: "legal" },
  { pattern: /\b(dentist|dental(?:\s+(?:office|practice|clinic))?|orthodontist|orthodontics|periodontist|endodontist)\b/, slug: "dental" },
  { pattern: /\b(doctor|physician|clinic|urgent\s+care|family\s+(?:medicine|practice)|med(?:ical)?\s+(?:spa|practice|office|center)|chiropract(?:or|ic)|dermatolog(?:y|ist))\b/, slug: "medical" },
  { pattern: /\b(restaurant|cafe|caf[eé]|bistro|diner|eatery|pizzeria|food\s+truck|catering)\b/, slug: "restaurant" },
  { pattern: /\b(salon|barber(?:\s+shop)?|stylist|hair\s+(?:salon|studio)|nail\s+salon|day\s+spa|\bspa\b|esthetician|med\s*spa)\b/, slug: "salon" },
  { pattern: /\b(real(?:tor|tors|\s+estate)|realty|broker(?:age)?|home\s+sales|mls)\b/, slug: "real_estate" },
  { pattern: /\b(auto(?:motive)?(?:\s+(?:repair|shop|body))?|mechanic|tire\s+shop|oil\s+change|transmission\s+shop|collision\s+(?:center|repair))\b/, slug: "automotive" },
  { pattern: /\b(non[-\s]?profit|nonprofit|501\(?c\)?\(?3\)?|charity|foundation)\b/, slug: "nonprofit" },
  { pattern: /\b(ecommerce|e-commerce|online\s+store|shopify|woocommerce|shop(?:ify)?\s+store|dtc\s+brand|d2c\s+brand)\b/, slug: "ecommerce" },
  { pattern: /\b(accountant|cpa|bookkeep(?:er|ing)|tax\s+(?:prep|services?|professional)|financial\s+advisor|insurance\s+(?:agent|agency|broker)|consultant|consulting\s+(?:firm|services?))\b/, slug: "professional_services" },

  // --- broad fallback buckets ---
  { pattern: /\b(home\s+services?|home\s+improvement|remodel(?:er|ing)|handyman|painter|painting|flooring|tile|drywall|insulation|gutter|window\s+(?:installer|installation)|garage\s+door|fence(?:\s+(?:builder|company))?|pest\s+control|appliance\s+repair)\b/, slug: "home_services" },
  { pattern: /\b(contractor|general\s+contractor|construction(?:\s+company)?|builder|build(?:ing)?\s+(?:firm|company))\b/, slug: "contractor" },
  { pattern: /\b(local\s+services?|services?\s+area|community\s+services?)\b/, slug: "local_services" },
];

/**
 * Normalize a raw industry value into a stable taxonomy slug.
 *
 * Inputs accepted: anything stringy, including null/undefined,
 * mixed-case, punctuated, or compound ("HVAC + Plumbing Services").
 *
 * Behavior:
 *   - Trims, lowercases, and strips most punctuation before
 *     pattern matching (preserves spaces, hyphens, ampersands).
 *   - Returns the FIRST matching rule's slug (priority-ordered).
 *   - Compound inputs match on the most-specific keyword present.
 *   - Empty / whitespace-only inputs → `{ raw: null, normalized: "unknown" }`.
 *   - No match → `{ raw, normalized: "unknown" }`.
 */
export function normalizeIndustry(
  rawInput: string | null | undefined,
): IndustryNormalization {
  const trimmed = typeof rawInput === "string" ? rawInput.trim() : "";
  if (!trimmed) {
    return { raw: null, normalized: "unknown", version: TAXONOMY_VERSION };
  }

  const haystack = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-&]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  for (const { pattern, slug } of RULES) {
    if (pattern.test(haystack)) {
      return {
        raw: trimmed,
        normalized: slug,
        version: TAXONOMY_VERSION,
      };
    }
  }

  return {
    raw: trimmed,
    normalized: "unknown",
    version: TAXONOMY_VERSION,
  };
}

/**
 * Best-effort heuristic to extract a raw industry hint from
 * (businessName, reportMarkdown). Used as a fallback when the
 * caller doesn't already have an explicit industry value.
 *
 * Strategy:
 *   1. If `businessName` matches a taxonomy keyword, use it as the
 *      raw hint — short, high-signal.
 *   2. Otherwise scan the first ~4 KB of the markdown (the audit
 *      typically describes the business early on) for the same
 *      keywords. Return the first hit's matched substring.
 *   3. No match → null. Caller will store raw=null,
 *      normalized="unknown".
 *
 * This is intentionally narrow. It will MISS plenty of legitimate
 * industries and that's fine — better than mislabeling.
 */
export function inferIndustryFromAuditInputs(
  businessName: string | null | undefined,
  reportMarkdown: string | null | undefined,
): string | null {
  const name = (businessName ?? "").trim();
  if (name) {
    const fromName = firstRuleHit(name);
    if (fromName) return fromName;
  }
  const md = (reportMarkdown ?? "").slice(0, 4000);
  if (!md) return null;
  return firstRuleHit(md);
}

function firstRuleHit(input: string): string | null {
  const haystack = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-&]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const { pattern } of RULES) {
    const m = pattern.exec(haystack);
    if (m && m[0]) return m[0];
  }
  return null;
}
