/**
 * Snapshot fixture — MISSING REVIEWS / TRUST AUDIT
 *
 * Trust score is 2/20 (floor). No Google Business Profile, no review schema,
 * no social signals on site. Schema and crawl are adequate, but zero verifiable
 * third-party proof of legitimacy causes all 4 models to withhold recommendation.
 * Exercises:
 *  - Severe trust diagnostic with no review fallback
 *  - "Why AI held back" reason: lack of verifiable legitimacy signals
 *  - 0 of 4 recommend despite 4 of 4 providers responding
 *  - No aggregateRating fix (no existing rating to correct — must be added fresh)
 */
import type { BuildReportModelInput } from "@/lib/report/report-model";
import type { DeterministicScore } from "@/lib/scoring/types";

const det = {
  overall_score: 38,
  category_scores: {
    schema: { score: 14, max: 25, reason: "LocalBusiness entity present; no AggregateRating", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
    crawler: { score: 18, max: 20, reason: "Fully accessible; sitemap present", signals: [], issues: [], evidence_used: [], category_confidence: 1.0 },
    trust: { score: 2, max: 20, reason: "No review count, no Google Business Profile link, no third-party citations on homepage", signals: [], issues: [], evidence_used: [], category_confidence: 0.95 },
    content: { score: 9, max: 15, reason: "Service pages present; FAQ missing", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    brand: { score: 4, max: 10, reason: "Business name consistent on-site but no external directory presence", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    tech: { score: 7, max: 10, reason: "Server-rendered content; H1 and H2 landmarks present", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
  },
  top_3_findings: [
    { id: "trust.no_reviews_signal", severity: "critical", category: "trust", message: "No review signals on the homepage — AI cannot verify legitimacy" },
    { id: "trust.no_gbp_link", severity: "critical", category: "trust", message: "No Google Business Profile link detected" },
    { id: "schema.no_aggregate_rating", severity: "warning", category: "schema", message: "No customer rating in the business profile — AI cannot cite your star rating" },
  ],
  top_3_recommended_fixes: [
    { id: "fix.trust.no_reviews_signal", for_finding: "trust.no_reviews_signal", action: "Surface your review count and star rating on the homepage so AI systems can see third-party proof of legitimacy.", impact: "high" },
    { id: "fix.trust.no_gbp_link", for_finding: "trust.no_gbp_link", action: "Link your website's business profile to your Google Business Profile so AI systems can cross-reference your identity.", impact: "high" },
    { id: "fix.schema.no_aggregate_rating", for_finding: "schema.no_aggregate_rating", action: "Add your customer rating and review count to your site's machine-readable business profile so AI systems can cite it.", impact: "medium" },
  ],
  public_bucket_scores: {
    understanding: { score: 52, max: 100, percentage: 52 },
    retrieval: { score: 68, max: 100, percentage: 68 },
    trust: { score: 12, max: 100, percentage: 12 },
    recommendation: { score: 15, max: 100, percentage: 15 },
  },
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: true, entity_checked: true, ingest_present: true, render_attempted: false },
  confidence_level: "high",
  confidence_score: 82,
  confidence_inputs: { evidence_completeness: 90, preflight_success: 100, schema_certainty: 85, entity_certainty: 80, content_extraction_quality: 85, render_coverage: 50 },
  score_stability_index: null,
  score_stability_reason: "Insufficient history",
  trace: {} as never,
  computed_at: "2026-06-18T11:00:00Z",
} as unknown as DeterministicScore;

export const MISSING_REVIEWS_AUDIT_INPUT: BuildReportModelInput = {
  reportId: "GEO-TEST0006",
  orderId: "test-order-0006",
  resolvedBusinessName: "Lakewood Pressure Washing",
  nameAlternates: [],
  website: "https://lakewoodpressurewash.com",
  generatedAt: new Date("2026-06-18T11:00:00Z"),
  reviewed: false,
  industryNormalized: "pressure washing",
  score: {
    overall: 38,
    status: "At Risk",
    categories: [
      { key: "schema", label: "Structured Data / Schema", short: "Recommendation Ready", score: 14, max: 25 },
      { key: "crawler", label: "AI Crawler Readiness", short: "Crawl Access", score: 18, max: 20 },
      { key: "trust", label: "Local Trust Signals", short: "Trust Signals", score: 2, max: 20 },
      { key: "content", label: "Content Depth + FAQ Quality", short: "Content Depth", score: 9, max: 15 },
      { key: "brand", label: "Brand / Entity Clarity", short: "Brand Presence", score: 4, max: 10 },
      { key: "tech", label: "Technical Accessibility", short: "Content Extraction", score: 7, max: 10 },
    ],
  },
  deterministic: det,
  providerOutputs: [
    { provider: "openai", status: "passed", business_understanding_score: 45, would_recommend: "NO", industry_identified: "pressure washing service", location_identified: "Lakewood", services_identified: ["pressure washing", "exterior cleaning"], missing_facts: ["customer reviews", "Google Business Profile", "proof of legitimacy"], recommendation_confidence: "low", competitive: { business_named: false, entities: ["Angi", "HomeAdvisor"] }, cited_source_domains: [] },
    { provider: "claude", status: "passed", business_understanding_score: 42, would_recommend: "NO", industry_identified: "exterior cleaning company", location_identified: null, services_identified: ["pressure washing"], missing_facts: ["review count and rating", "external verification"], recommendation_confidence: "low", competitive: { business_named: false, entities: [] }, cited_source_domains: [] },
    { provider: "gemini", status: "passed", business_understanding_score: 38, would_recommend: "NO", industry_identified: "pressure washing contractor", location_identified: "Lakewood area", services_identified: ["pressure washing", "driveway cleaning"], missing_facts: ["customer reviews", "business verification signal"], recommendation_confidence: "low", competitive: { business_named: false, entities: ["Thumbtack"] }, cited_source_domains: ["yelp.com"] },
    { provider: "perplexity", status: "passed", business_understanding_score: 40, would_recommend: "NO", industry_identified: "pressure washing service", location_identified: null, services_identified: ["exterior cleaning"], missing_facts: ["review signals", "Google Business listing"], recommendation_confidence: "low", competitive: { business_named: false, entities: [] }, cited_source_domains: ["yelp.com"] },
  ],
  context: {
    percentileCopy: null,
    cohortCellValue: null,
    confidenceLabel: "Audit completeness: High",
    confidenceReason: "All six scoring categories had strong signal coverage. Trust signals were measurably absent.",
  },
};
