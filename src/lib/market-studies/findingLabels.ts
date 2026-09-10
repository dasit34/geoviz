/**
 * Short, factual customer-facing labels for the deterministic finding
 * ids (`DeterministicScore.top_3_findings[].id`). Used by the market-
 * study case-study summary ("63% of businesses had no machine-readable
 * business profile").
 *
 * Mirrors the id set in `src/lib/scoring/fixes-table.ts` (`ISSUE_TO_FIX`)
 * plus `tech.no_h1`. Phrasing is deliberately measured — it describes
 * what was observed, never a promised outcome (see CLAUDE.md tone
 * rules). Pure data.
 */
export const FINDING_LABEL: Record<string, string> = {
  // Schema / structured data
  "schema.no_jsonld": "no machine-readable business profile on the homepage",
  "schema.no_localbusiness": "no structured local-business identity block",
  "schema.missing_required_fields":
    "an incomplete structured business profile (missing required fields)",
  "schema.malformed_fields": "formatting errors in the structured business data",
  "schema.no_faqpage": "no structured FAQ data",
  // AI crawler readiness
  "crawler.robots_blocks_all": "a robots.txt that blocks automated readers",
  "crawler.no_robots_txt": "no robots.txt file",
  "crawler.no_sitemap": "no XML sitemap",
  "crawler.homepage_noindex": "a homepage set to be skipped by search and AI",
  "crawler.no_canonical": "no canonical URL declared",
  // Local trust signals
  "trust.nap_inconsistent":
    "an inconsistent business name, address, or phone across the site",
  "trust.no_reviews_signal": "no verifiable third-party review signal",
  "trust.low_surface_agreement":
    "low agreement between the homepage, footer, and schema",
  // Content depth + FAQ
  "content.thin_content": "thin homepage content",
  "content.no_faq": "no FAQ content answering customer questions",
  "content.low_readability": "low readable-text density",
  // Brand / entity clarity
  "brand.unresolved_entity": "an ambiguous business identity",
  "brand.no_sameas": "no links to established external profiles",
  // Technical accessibility
  "tech.no_h1": "no clear main heading on the homepage",
  "tech.blank_shell": "a page that renders mostly blank without JavaScript",
  "tech.client_only_content":
    "primary content that only appears after JavaScript runs",
  "tech.fallback_extraction":
    "homepage text that could not be cleanly extracted",
};

/**
 * Best-effort label for any finding id — falls back to a readable
 * phrase derived from the id itself so an unmapped/new id never
 * renders raw.
 */
export function findingLabel(id: string): string {
  if (FINDING_LABEL[id]) return FINDING_LABEL[id];
  const derived = id
    .split(".")
    .slice(1)
    .join(" ")
    .replace(/_/g, " ")
    .trim();
  return derived || id;
}
