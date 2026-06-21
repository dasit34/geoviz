/**
 * Canonical issue-id → fix lookup table.
 *
 * Every Issue raised by a category scorer has a stable id like
 * `schema.no_localbusiness`. This table maps each id to a single
 * customer-facing fix label + estimated impact.
 *
 * Same issue id → same fix entry, always. The LLM may expand the
 * `action` into a paragraph but it never invents new fix labels
 * (the table is the authoritative list).
 *
 * Pure data — no logic.
 */

import type { Fix } from "./types";

type FixTemplate = {
  action: string;
  impact: Fix["impact"];
};

export const ISSUE_TO_FIX: Record<string, FixTemplate> = {
  // ── Schema (Structured Data) ───────────────────────────────────
  "schema.no_jsonld": {
    action: "Add a machine-readable business profile to your website (name, address, phone, services, and location). This is what AI systems read to identify and verify a local business.",
    impact: "high",
  },
  "schema.no_localbusiness": {
    action: "Add a structured business profile with your name, address, phone number, website URL, and location coordinates. AI systems require this to confirm your identity and recommend you for local searches.",
    impact: "high",
  },
  "schema.missing_required_fields": {
    action: "Add the missing business details to your site's machine-readable business profile. AI systems check these fields before recommending a local business — without them, they skip to a competitor they can verify.",
    impact: "high",
  },
  "schema.malformed_fields": {
    action: "Fix the formatting errors in your site's business profile data so AI systems can read your address, phone number, and location without ambiguity.",
    impact: "medium",
  },
  "schema.no_faqpage": {
    action: "Add a FAQ section to your site that answers the most common customer questions in your service area. Structure it so AI systems can quote your answers directly.",
    impact: "medium",
  },

  // ── Crawler / AI access ────────────────────────────────────────
  "crawler.robots_blocks_all": {
    action: "Update robots.txt so AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended) are not blocked from the homepage and primary service pages.",
    impact: "high",
  },
  "crawler.no_robots_txt": {
    action: "Add a robots.txt at the root that explicitly allows the major AI user-agents while preserving existing search-engine rules.",
    impact: "medium",
  },
  "crawler.no_sitemap": {
    action: "Publish a sitemap.xml at the root and reference it from robots.txt so AI systems can find every public page.",
    impact: "medium",
  },
  "crawler.homepage_noindex": {
    action: "Remove the `noindex` directive from the homepage so AI crawlers and search engines can index it.",
    impact: "high",
  },
  "crawler.no_canonical": {
    action: "Add a `<link rel=\"canonical\">` to every page so AI systems treat the right URL as the source of truth.",
    impact: "medium",
  },

  // ── Trust ──────────────────────────────────────────────────────
  "trust.nap_inconsistent": {
    action: "Reconcile business name, phone, and address across your homepage, footer, and structured data so they match exactly.",
    impact: "high",
  },
  "trust.no_reviews_signal": {
    action: "Surface review signals (count + aggregate rating) on the homepage so AI systems can see proof of trust.",
    impact: "medium",
  },
  "trust.low_surface_agreement": {
    action: "Audit homepage, footer, and schema for the same business identity; remove stray legacy addresses or phone numbers.",
    impact: "medium",
  },

  // ── Content ────────────────────────────────────────────────────
  "content.thin_content": {
    action: "Expand the primary service pages with at least 300 words each, covering what you do, where you do it, and the customer outcomes.",
    impact: "high",
  },
  "content.no_faq": {
    action: "Add a FAQ section to the homepage answering the 5–8 questions customers ask before booking.",
    impact: "medium",
  },
  "content.low_readability": {
    action: "Restructure the homepage into clear sections with semantic headings (H1 → H2 → H3) so AI systems can quote the right block.",
    impact: "medium",
  },

  // ── Brand / Entity ─────────────────────────────────────────────
  "brand.unresolved_entity": {
    action: "Make your business name appear consistently in the page title, main heading, header, footer, and your site's business profile data so AI systems resolve a single trusted entity.",
    impact: "high",
  },
  "brand.no_sameas": {
    action: "Link your website's business profile to your Google Business Profile and authoritative directory listings so AI systems can confirm you are the same business across the web.",
    impact: "medium",
  },

  // ── Technical accessibility ────────────────────────────────────
  "tech.no_h1": {
    action: "Add a single H1 to the homepage that names the business and what it does.",
    impact: "medium",
  },
  "tech.blank_shell": {
    action: "Render the primary content server-side so AI crawlers that don't execute JavaScript see real text, not an empty shell.",
    impact: "high",
  },
  "tech.client_only_content": {
    action: "Move critical content (business name, services, contact info) into server-rendered HTML instead of relying on client-side hydration.",
    impact: "high",
  },
  "tech.fallback_extraction": {
    action: "Add semantic HTML5 landmarks (`<main>`, `<article>`, `<section>`) so readability extractors find the primary content reliably.",
    impact: "medium",
  },
};
