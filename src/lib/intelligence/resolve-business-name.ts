/**
 * Business-name resolver — render-time helper.
 *
 * Reads from the data the worker already persisted (preflight
 * intelligence + the order row) and picks the most authoritative
 * customer-facing name. No DB changes; no validator changes.
 *
 * Priority chain:
 *   1. preflightSignals.entityConsistency.extractedEntities.name.schema
 *      — JSON-LD Organization / LocalBusiness `name` field, the most
 *      authoritative source on the site.
 *   2. preflightSignals.readability.articleTitle, cleaned of
 *      " | Site Name" / " - Brand" separator suffixes.
 *   3. preflightSignals.entityConsistency.extractedEntities.name.homepage
 *      then `.footer` — surface-scraped fallbacks.
 *   4. The user-supplied `order.businessName`, title-cased.
 *   5. Domain-derived fallback (current behavior) — last resort.
 *
 * Conflict signal: when (1)-(3) yields a primary name that differs
 * meaningfully from `order.businessName`, the resolver returns an
 * `inconsistency` payload so the cover can surface both honestly
 * instead of silently overwriting the customer's input.
 */

import type { PreflightSignals } from "./preflight/types";

export type BusinessNameResolution = {
  /** The best-resolved customer-facing display name. */
  name: string;
  /**
   * Where the chosen name came from. Useful for telemetry and for
   * the cover's "Identity inconsistency detected" pill.
   */
  source:
    | "schema"
    | "article-title"
    | "homepage"
    | "footer"
    | "order"
    | "provider-consensus"
    | "domain";
  /**
   * Populated when the chosen name differs meaningfully from
   * `order.businessName`. Lets the cover surface both names rather
   * than silently overwriting the customer's input.
   */
  inconsistency: {
    primary: string;
    alternates: string[];
  } | null;
};

type ResolverInput = {
  intelligence?: {
    preflightSignals?: unknown;
    /**
     * Cross-model validator layer. Used as a best-effort
     * provider-consensus name source when the on-site signals are junk
     * (bot wall / SEO title) and no order name is available.
     */
    aiValidations?: unknown;
  } | null;
  order: {
    businessName: string | null;
    email: string | null;
    websiteUrl: string | null;
  };
};

/**
 * Strip common page-title suffixes ("| Site Name", "- Brand",
 * ":: Tagline"). Mozilla Readability's articleTitle frequently
 * carries them.
 */
function cleanArticleTitle(raw: string | null): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s) return null;
  // Reject SEO/marketing page titles wholesale rather than salvaging a
  // misleading fragment. "Commercial Flat Roofing Experts Serving Ohio,
  // Michigan, Indiana - Repair" would otherwise yield the trailing word
  // "Repair" — worse than falling through to the order/domain name.
  if (!isPlausibleBusinessName(s)) return null;
  // Split on common separators, take the longest non-empty segment.
  const parts = s
    .split(/[\|\-–—:·•]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length > 1) {
    // Heuristic: the brand name is usually the shortest segment,
    // sitting at the end. But the article-title segment is the
    // longest. Pick the shorter end-segment unless it's < 3 chars.
    const last = parts[parts.length - 1];
    if (last && last.length >= 3 && last.length <= 60) {
      s = last;
    } else {
      // Fall back to the first segment.
      s = parts[0] ?? s;
    }
  }
  return normalize(s);
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Promote a slug-derived name ("rg-ohio", "rg_ohio", "rgohio") to
 * title-cased ("Rg Ohio"). Only used for the user-supplied
 * order.businessName fallback — never to mask a stronger resolved
 * source.
 */
function titleCaseLoose(raw: string): string {
  return normalize(raw)
    .replace(/[-_]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 0)
    .map((w) => {
      // Preserve acronyms (all-caps short tokens) as-is.
      if (w.length <= 4 && w === w.toUpperCase()) return w;
      // Preserve intentional intercaps / camel-case brand names
      // ("LaBre", "McKay", "iPhone") — an uppercase letter after the
      // first position signals deliberate casing we must not flatten.
      if (/[A-Z]/.test(w.slice(1))) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Domain-derived fallback: strip protocol/www, take the host
 * segment, drop the TLD, title-case it.
 */
function fromDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(
      url.startsWith("http") ? url : `https://${url}`,
    );
    const host = parsed.hostname.replace(/^www\./, "");
    const segments = host.split(".");
    if (segments.length === 0) return null;
    const root = segments[0];
    if (!root) return null;
    return titleCaseLoose(root);
  } catch {
    return null;
  }
}

/**
 * Two names are "meaningfully different" when their normalized
 * lower-case forms diverge by more than whitespace/case AND neither
 * is a prefix-substring of the other (e.g. "RG Ohio" vs
 * "Independence Realty Group" diverge; "RG Ohio" vs "rg ohio" do not).
 */
function meaningfullyDifferent(a: string, b: string): boolean {
  const na = normalize(a).toLowerCase();
  const nb = normalize(b).toLowerCase();
  if (na === nb) return false;
  if (na.includes(nb) || nb.includes(na)) return false;
  return true;
}

// Full US state names — used to detect service-area SEO strings that
// masquerade as business names ("... Serving Ohio, Michigan, Indiana").
const US_STATE_NAMES = new Set<string>([
  "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
  "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
  "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana",
  "maine", "maryland", "massachusetts", "michigan", "minnesota",
  "mississippi", "missouri", "montana", "nebraska", "nevada", "ohio",
  "oklahoma", "oregon", "pennsylvania", "tennessee", "texas", "utah",
  "vermont", "virginia", "washington", "wisconsin", "wyoming",
]);

// Browser / bot-wall / loading interstitial titles. When a site is
// behind Cloudflare (or similar) the fetched <title> / readability
// title is the challenge page, NOT the business — e.g. "Just a
// moment...". These must NEVER become the report's hero name. Matched
// as a case-insensitive substring so "Just a moment…", "Just a
// moment... | Cloudflare" etc. are all caught.
const JUNK_NAME_SUBSTRINGS: readonly string[] = [
  "just a moment",
  "loading",
  "please wait",
  "attention required",
  "access denied",
  "checking your browser",
  "checking if the site connection is secure",
  "cloudflare",
  "enable javascript",
  "javascript is required",
  "are you human",
  "verify you are human",
  "verifying you are human",
  "captcha",
  "403 forbidden",
  "404 not found",
  "page not found",
  "site maintenance",
  "under construction",
  "redirecting",
  "one moment",
];

/**
 * True when a candidate is a browser/bot-wall/loading interstitial
 * rather than a real business name.
 */
function isJunkName(name: string): boolean {
  const n = normalize(name).toLowerCase();
  if (!n) return true;
  return JUNK_NAME_SUBSTRINGS.some((j) => n.includes(j));
}

/**
 * Quality gate for an on-site-derived name candidate (schema / article
 * title / homepage / footer). SEO-stuffed page titles and browser
 * interstitials frequently land in these fields — e.g. "Commercial Flat
 * Roofing Experts Serving Ohio, Michigan, Indiana - Repair" or "Just a
 * moment..." — and must NOT become the report's hero title. A real
 * business name is short, doesn't market itself, isn't a bot wall, and
 * doesn't enumerate a multi-state service area.
 *
 * High-precision rejects only (avoid dropping legitimate names like
 * "Rick's Affordable Heating" — which is why marketing adjectives such
 * as "affordable" are deliberately NOT rejected):
 *   - a browser/loading/bot-wall interstitial (JUNK_NAME_SUBSTRINGS);
 *   - more than 6 words, or longer than 55 chars;
 *   - contains "serving" / "specializing" (service-area phrasing);
 *   - names two or more US states (a service-area list, not a name).
 */
// Marketing/imperative/2nd-person lead words that begin a slogan, not a
// business name ("Your Home …", "Discover …", "Transform …").
const SLOGAN_LEAD_WORDS = new Set<string>([
  "your", "get", "discover", "transform", "elevate", "experience", "welcome",
  "unlock", "upgrade", "trust", "choose", "switch", "grow",
]);

/**
 * True when a candidate reads as a tagline/slogan rather than a business name —
 * so a homepage H1 like "Your Home Deserves The BEST!" never becomes the report
 * name. Conservative: only trips on 3+ word phrases, so short brand names
 * ("Best Buy", "Efficient Systems") are never flagged. A rejected candidate
 * just cascades to the next source (order name / schema / domain), so a rare
 * false positive is low-harm.
 */
function looksLikeSlogan(name: string): boolean {
  const n = normalize(name);
  if (!n) return false;
  const words = n.split(/\s+/);
  if (words.length < 3) return false;
  if (/[!?]\s*$/.test(n)) return true; // ends with ! / ?
  const lead = words[0].toLowerCase().replace(/[^a-z']/g, "");
  if (SLOGAN_LEAD_WORDS.has(lead)) return true;
  if (/\bdeserve/i.test(n)) return true; // "you deserve", "your home deserves"
  if (/\byou(?:r)?\b[\s\S]*\bbest\b/i.test(n)) return true;
  return false;
}

function isPlausibleBusinessName(name: string): boolean {
  const n = normalize(name);
  if (!n) return false;
  if (isJunkName(n)) return false;
  // Generic page titles ("Home", "Welcome") — the homepage <title>/<h1>
  // of a poorly-tagged site, not a business name.
  if (GENERIC_TITLES.has(n.toLowerCase())) return false;
  // Slogan/tagline H1/title text ("Your Home Deserves The BEST!") — secondary
  // evidence at best, never the hero name.
  if (looksLikeSlogan(n)) return false;
  const words = n.split(/\s+/);
  if (words.length > 6) return false;
  if (n.length > 55) return false;
  if (/\b(serving|specializing)\b/i.test(n)) return false;
  // Descriptive "<service> in/near <Place>" titles ("Full Service
  // Dentistry in Northeast Ohio") read as a tagline, not a brand. Only
  // trip on 4+ word phrases with a locative clause to avoid rejecting
  // legitimate short names.
  if (words.length >= 4 && /\b(?:in|near|across|throughout)\s+[A-Z][a-z]/.test(n)) {
    return false;
  }
  let stateHits = 0;
  for (const w of words) {
    if (US_STATE_NAMES.has(w.toLowerCase().replace(/[^a-z]/g, ""))) {
      stateHits += 1;
    }
  }
  if (stateHits >= 2) return false;
  return true;
}

// Generic homepage titles that are never a business name.
const GENERIC_TITLES = new Set<string>([
  "home",
  "homepage",
  "home page",
  "welcome",
  "index",
  "main",
  "untitled",
  "untitled document",
  "our website",
  "official site",
  "official website",
  "start",
  "landing page",
  "default",
]);

/**
 * Return the candidate only when it passes the plausibility gate;
 * otherwise null so the resolver falls through to the next source.
 */
function gated(name: string | null): string | null {
  return name && isPlausibleBusinessName(name) ? name : null;
}

function asPreflight(v: unknown): PreflightSignals | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (!("ok" in obj) || !("engineVersion" in obj)) return null;
  return v as PreflightSignals;
}

/**
 * Best-effort provider-consensus business name. When the on-site
 * signals are junk (bot wall / SEO title) the cross-model validators
 * usually still name the business in their summary prose ("LaBre Law
 * Office is a personal-injury firm…"). Extract the leading proper-noun
 * phrase before an "is/are/—/," boundary from each passed provider's
 * `raw_summary`, then return it ONLY when ≥2 providers agree on the
 * same normalized name AND it passes the plausibility gate.
 *
 * Conservative by design: this is a fallback, not an authority. It
 * never overrides a usable on-site or order name.
 */
function extractProviderConsensusName(aiValidations: unknown): string | null {
  if (!aiValidations || typeof aiValidations !== "object") return null;
  const outputs = (aiValidations as { outputs?: unknown }).outputs;
  if (!Array.isArray(outputs)) return null;

  const counts = new Map<string, { display: string; count: number }>();
  for (const raw of outputs) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as { status?: unknown; raw_summary?: unknown };
    if (o.status !== "passed") continue;
    const summary = typeof o.raw_summary === "string" ? o.raw_summary : "";
    if (!summary) continue;
    // Leading phrase up to the first " is/are/was/—/–/-/," boundary.
    const m = summary
      .trim()
      .match(/^([A-Z][A-Za-z0-9&'’.\- ]{1,54}?)\s+(?:is|are|was|were|—|–|-|,)/);
    if (!m) continue;
    const candidate = gated(normalize(m[1]));
    if (!candidate) continue;
    const key = candidate.toLowerCase();
    const prev = counts.get(key);
    if (prev) prev.count += 1;
    else counts.set(key, { display: candidate, count: 1 });
  }

  let best: { display: string; count: number } | null = null;
  for (const e of counts.values()) {
    if (!best || e.count > best.count) best = e;
  }
  return best && best.count >= 2 ? best.display : null;
}

export function resolveBusinessName(
  input: ResolverInput,
): BusinessNameResolution {
  const preflight = asPreflight(input.intelligence?.preflightSignals);

  // Collect every candidate that's non-empty so we can surface
  // conflicts honestly.
  // Every on-site candidate passes through the plausibility gate so an
  // SEO-stuffed page title can never become the hero name. A rejected
  // candidate is treated as absent and the resolver falls through.
  const schemaName = gated(
    preflight?.entityConsistency?.extractedEntities?.name?.schema
      ? normalize(preflight.entityConsistency.extractedEntities.name.schema)
      : null,
  );
  const articleTitle = gated(
    cleanArticleTitle(preflight?.readability?.articleTitle ?? null),
  );
  const homepageName = gated(
    preflight?.entityConsistency?.extractedEntities?.name?.homepage
      ? normalize(preflight.entityConsistency.extractedEntities.name.homepage)
      : null,
  );
  const footerName = gated(
    preflight?.entityConsistency?.extractedEntities?.name?.footer
      ? normalize(preflight.entityConsistency.extractedEntities.name.footer)
      : null,
  );
  // The customer's own input — trusted, but still reject a junk value
  // (a bot wall could have been captured upstream).
  const rawOrderName = input.order.businessName
    ? titleCaseLoose(input.order.businessName)
    : null;
  const orderName = rawOrderName && !isJunkName(rawOrderName) ? rawOrderName : null;
  // Best-effort cross-model consensus — only used when on-site + order
  // names are unavailable, and only when ≥2 providers agree.
  const providerConsensusName = extractProviderConsensusName(
    input.intelligence?.aiValidations,
  );
  const domainName = fromDomain(input.order.websiteUrl);

  let chosen: { name: string; source: BusinessNameResolution["source"] };

  if (schemaName) {
    chosen = { name: schemaName, source: "schema" };
  } else if (articleTitle) {
    chosen = { name: articleTitle, source: "article-title" };
  } else if (homepageName) {
    chosen = { name: homepageName, source: "homepage" };
  } else if (footerName) {
    chosen = { name: footerName, source: "footer" };
  } else if (orderName) {
    chosen = { name: orderName, source: "order" };
  } else if (providerConsensusName) {
    chosen = { name: providerConsensusName, source: "provider-consensus" };
  } else if (domainName) {
    chosen = { name: domainName, source: "domain" };
  } else {
    chosen = {
      name: input.order.email ?? "your business",
      source: "domain",
    };
  }

  // Surface a conflict only when (a) we picked a non-order source and
  // (b) the user's input is meaningfully different from the resolved
  // name. We treat the order input as the "alternate" to highlight,
  // matching the customer's spec: "Primary detected name: X.
  // Name inconsistency detected: Y."
  let inconsistency: BusinessNameResolution["inconsistency"] = null;
  if (
    chosen.source !== "order" &&
    chosen.source !== "domain" &&
    orderName &&
    meaningfullyDifferent(chosen.name, orderName)
  ) {
    inconsistency = {
      primary: chosen.name,
      alternates: [orderName],
    };
  }

  return {
    name: chosen.name,
    source: chosen.source,
    inconsistency,
  };
}
