/**
 * Snapshot fixture — MISSING SCHEMA AUDIT
 *
 * Zero JSON-LD blocks detected. Schema score is 2/25 (minimum). Exercises:
 *  - Evidence page FAIL for "JSON-LD schema blocks"
 *  - structuredIdentityTitle("No complete Organization or business identity block")
 *  - Fix action for schema.no_jsonld with plain-English copy (no JSON-LD jargon)
 *  - At Risk band with 0 of 3 providers recommending
 */
import type { BuildReportModelInput } from "@/lib/report/report-model";
import type { DeterministicScore } from "@/lib/scoring/types";

const det = {
  overall_score: 32,
  category_scores: {
    schema: { score: 2, max: 25, reason: "No JSON-LD blocks detected", signals: [], issues: [], evidence_used: [], category_confidence: 1.0 },
    crawler: { score: 15, max: 20, reason: "robots.txt present; no sitemap", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    trust: { score: 6, max: 20, reason: "Google Business Profile detected but not linked from site", signals: [], issues: [], evidence_used: [], category_confidence: 0.7 },
    content: { score: 5, max: 15, reason: "215 words on homepage; no FAQ section", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    brand: { score: 3, max: 10, reason: "Business name present on homepage but absent from footer", signals: [], issues: [], evidence_used: [], category_confidence: 0.75 },
    tech: { score: 1, max: 10, reason: "Heavy JavaScript reliance; limited server-rendered content", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
  },
  top_3_findings: [
    { id: "schema.no_jsonld", severity: "critical", category: "schema", message: "No structured data on the homepage" },
    { id: "tech.blank_shell", severity: "warning", category: "tech", message: "Heavy JavaScript reliance — AI crawlers may see a near-empty page" },
    { id: "trust.no_reviews_signal", severity: "warning", category: "trust", message: "No review signals on the homepage" },
  ],
  top_3_recommended_fixes: [
    { id: "fix.schema.no_jsonld", for_finding: "schema.no_jsonld", action: "Add a machine-readable business profile to your website (name, address, phone, services, and location). This is what AI systems read to identify and verify a local business.", impact: "high" },
    { id: "fix.tech.blank_shell", for_finding: "tech.blank_shell", action: "Render the primary content server-side so AI crawlers that don't execute JavaScript see real text, not an empty shell.", impact: "high" },
    { id: "fix.trust.no_reviews_signal", for_finding: "trust.no_reviews_signal", action: "Surface review signals (count + aggregate rating) on the homepage so AI systems can see proof of trust.", impact: "medium" },
  ],
  public_bucket_scores: {
    understanding: { score: 18, max: 100, percentage: 18 },
    retrieval: { score: 40, max: 100, percentage: 40 },
    trust: { score: 22, max: 100, percentage: 22 },
    recommendation: { score: 10, max: 100, percentage: 10 },
  },
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: false, entity_checked: true, ingest_present: true, render_attempted: false },
  confidence_level: "moderate",
  confidence_score: 65,
  confidence_inputs: { evidence_completeness: 65, preflight_success: 100, schema_certainty: 100, entity_certainty: 55, content_extraction_quality: 60, render_coverage: 50 },
  score_stability_index: null,
  score_stability_reason: "Insufficient history",
  trace: {} as never,
  computed_at: "2026-06-15T09:00:00Z",
} as unknown as DeterministicScore;

export const MISSING_SCHEMA_AUDIT_INPUT: BuildReportModelInput = {
  reportId: "GEO-TEST0005",
  orderId: "test-order-0005",
  resolvedBusinessName: "Greenfield Dental Group",
  nameAlternates: [],
  website: "https://greenfielddental.com",
  generatedAt: new Date("2026-06-15T09:00:00Z"),
  reviewed: false,
  industryNormalized: "dental",
  score: {
    overall: 32,
    status: "At Risk",
    categories: [
      { key: "schema", label: "Structured Data / Schema", short: "Recommendation Ready", score: 2, max: 25 },
      { key: "crawler", label: "AI Crawler Readiness", short: "Crawl Access", score: 15, max: 20 },
      { key: "trust", label: "Local Trust Signals", short: "Trust Signals", score: 6, max: 20 },
      { key: "content", label: "Content Depth + FAQ Quality", short: "Content Depth", score: 5, max: 15 },
      { key: "brand", label: "Brand / Entity Clarity", short: "Brand Presence", score: 3, max: 10 },
      { key: "tech", label: "Technical Accessibility", short: "Content Extraction", score: 1, max: 10 },
    ],
  },
  deterministic: det,
  providerOutputs: [
    { provider: "openai", status: "passed", business_understanding_score: 28, would_recommend: "NO", industry_identified: "dental practice", location_identified: "Greenfield, MA", services_identified: ["dental checkups", "cleanings"], missing_facts: ["website contact info", "structured data"], recommendation_confidence: "low", competitive: { business_named: false, entities: ["Aspen Dental"] }, cited_source_domains: ["healthgrades.com"] },
    { provider: "claude", status: "passed", business_understanding_score: 22, would_recommend: "NO", industry_identified: "dental office", location_identified: null, services_identified: [], missing_facts: ["machine-readable business profile"], recommendation_confidence: "low", competitive: { business_named: false, entities: ["Aspen Dental"] }, cited_source_domains: [] },
    { provider: "gemini", status: "unavailable" },
    { provider: "perplexity", status: "passed", business_understanding_score: 20, would_recommend: "NO", industry_identified: "dentist", location_identified: "Massachusetts", services_identified: ["dental care"], missing_facts: ["structured contact data", "location schema"], recommendation_confidence: "low", competitive: { business_named: false, entities: ["Gentle Dental"] }, cited_source_domains: ["yelp.com", "healthgrades.com"] },
  ],
  context: {
    percentileCopy: null,
    cohortCellValue: null,
    confidenceLabel: "Audit completeness: Moderate",
    confidenceReason: null,
  },
};
