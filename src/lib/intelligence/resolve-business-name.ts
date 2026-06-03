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
    .map((w) =>
      // Preserve acronyms (all-caps short tokens) as-is.
      w.length <= 4 && w === w.toUpperCase()
        ? w
        : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
    )
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

function asPreflight(v: unknown): PreflightSignals | null {
  if (!v || typeof v !== "object") return null;
  const obj = v as Record<string, unknown>;
  if (!("ok" in obj) || !("engineVersion" in obj)) return null;
  return v as PreflightSignals;
}

export function resolveBusinessName(
  input: ResolverInput,
): BusinessNameResolution {
  const preflight = asPreflight(input.intelligence?.preflightSignals);

  // Collect every candidate that's non-empty so we can surface
  // conflicts honestly.
  const schemaName = preflight?.entityConsistency?.extractedEntities?.name
    ?.schema
    ? normalize(preflight.entityConsistency.extractedEntities.name.schema)
    : null;
  const articleTitle = cleanArticleTitle(
    preflight?.readability?.articleTitle ?? null,
  );
  const homepageName = preflight?.entityConsistency?.extractedEntities?.name
    ?.homepage
    ? normalize(
        preflight.entityConsistency.extractedEntities.name.homepage,
      )
    : null;
  const footerName = preflight?.entityConsistency?.extractedEntities?.name
    ?.footer
    ? normalize(preflight.entityConsistency.extractedEntities.name.footer)
    : null;
  const orderName = input.order.businessName
    ? titleCaseLoose(input.order.businessName)
    : null;
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
