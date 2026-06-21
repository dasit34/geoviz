/**
 * Snapshot fixture — PERFECT AUDIT
 *
 * All 4 providers returned data, schema is complete, entity is consistent,
 * 2 of 4 models recommend. Exercises the "Competitive" band, KEY FINDING
 * callout not shown (some recommendations present), no normalizer warnings.
 */
import type { BuildReportModelInput } from "@/lib/report/report-model";
import type { DeterministicScore } from "@/lib/scoring/types";

const det = {
  overall_score: 74,
  category_scores: {
    schema: { score: 18, max: 25, reason: "LocalBusiness-family entity present; sameAs links present", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
    crawler: { score: 20, max: 20, reason: "robots.txt allows AI crawlers; sitemap.xml present", signals: [], issues: [], evidence_used: [], category_confidence: 1.0 },
    trust: { score: 16, max: 20, reason: "AggregateRating present; 127 reviews", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    content: { score: 10, max: 15, reason: "450 words on homepage; service pages present", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    brand: { score: 7, max: 10, reason: "Business name consistent across schema + homepage + footer", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
    tech: { score: 3, max: 10, reason: "H1 present; server-rendered content", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
  },
  top_3_findings: [
    { id: "content.no_faq", severity: "info", category: "content", message: "No FAQ schema — AI cannot directly cite FAQ answers" },
    { id: "brand.no_sameas", severity: "info", category: "brand", message: "No sameAs links to external authorities (Google profile, directories)" },
    { id: "tech.fallback_extraction", severity: "info", category: "tech", message: "Missing semantic landmarks for content extraction" },
  ],
  top_3_recommended_fixes: [
    { id: "fix.content.no_faq", for_finding: "content.no_faq", action: "Add a FAQ section to the homepage answering the 5–8 questions customers ask before booking.", impact: "medium" },
    { id: "fix.brand.no_sameas", for_finding: "brand.no_sameas", action: "Link your website's business profile to your Google Business Profile and authoritative directory listings.", impact: "medium" },
    { id: "fix.tech.fallback_extraction", for_finding: "tech.fallback_extraction", action: "Add semantic HTML5 landmarks so readability extractors find the primary content reliably.", impact: "medium" },
  ],
  public_bucket_scores: {
    understanding: { score: 85, max: 100, percentage: 85 },
    retrieval: { score: 90, max: 100, percentage: 90 },
    trust: { score: 65, max: 100, percentage: 65 },
    recommendation: { score: 60, max: 100, percentage: 60 },
  },
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: true, entity_checked: true, ingest_present: true, render_attempted: false },
  confidence_level: "high",
  confidence_score: 88,
  confidence_inputs: { evidence_completeness: 100, preflight_success: 100, schema_certainty: 90, entity_certainty: 85, content_extraction_quality: 80, render_coverage: 50 },
  score_stability_index: null,
  score_stability_reason: "Insufficient history",
  trace: {} as never,
  computed_at: "2026-06-01T12:00:00Z",
} as unknown as DeterministicScore;

export const PERFECT_AUDIT_INPUT: BuildReportModelInput = {
  reportId: "GEO-TEST0001",
  orderId: "test-order-0001",
  resolvedBusinessName: "Carney All Seasons HVAC",
  nameAlternates: [],
  website: "https://carneyallseasons.com",
  generatedAt: new Date("2026-06-01T12:00:00Z"),
  reviewed: true,
  reviewedBy: "GeoViz Intelligence Team",
  industryNormalized: "hvac",
  score: {
    overall: 74,
    status: "Competitive",
    categories: [
      { key: "schema", label: "Structured Data / Schema", short: "Recommendation Ready", score: 18, max: 25 },
      { key: "crawler", label: "AI Crawler Readiness", short: "Crawl Access", score: 20, max: 20 },
      { key: "trust", label: "Local Trust Signals", short: "Trust Signals", score: 16, max: 20 },
      { key: "content", label: "Content Depth + FAQ Quality", short: "Content Depth", score: 10, max: 15 },
      { key: "brand", label: "Brand / Entity Clarity", short: "Brand Presence", score: 7, max: 10 },
      { key: "tech", label: "Technical Accessibility", short: "Content Extraction", score: 3, max: 10 },
    ],
  },
  deterministic: det,
  providerOutputs: [
    { provider: "openai", status: "passed", business_understanding_score: 82, would_recommend: "YES", industry_identified: "HVAC contractor", location_identified: "Toledo, OH", services_identified: ["heating", "cooling", "HVAC repair"], missing_facts: [], recommendation_reason: "Strong identity and local presence", recommendation_confidence: "high", competitive: { business_named: true, entities: [] }, cited_source_domains: ["carneyallseasons.com", "yelp.com"] },
    { provider: "claude", status: "passed", business_understanding_score: 75, would_recommend: "YES", industry_identified: "HVAC company", location_identified: "Toledo, Ohio", services_identified: ["heating", "air conditioning"], missing_facts: ["FAQ content"], recommendation_reason: "Good identity signals; minor content gaps", recommendation_confidence: "medium", competitive: { business_named: true, entities: [] }, cited_source_domains: ["carneyallseasons.com"] },
    { provider: "gemini", status: "passed", business_understanding_score: 65, would_recommend: "NO", industry_identified: "HVAC contractor", location_identified: "Toledo", services_identified: ["HVAC"], missing_facts: ["FAQ section", "reviews citation"], recommendation_reason: null, recommendation_confidence: "medium", competitive: { business_named: true, entities: ["IT Landes Company"] }, cited_source_domains: [] },
    { provider: "perplexity", status: "passed", business_understanding_score: 70, would_recommend: "NO", industry_identified: "HVAC service", location_identified: "Toledo, OH", services_identified: ["HVAC repair"], missing_facts: ["FAQ content"], recommendation_reason: null, recommendation_confidence: "medium", competitive: { business_named: true, entities: [] }, cited_source_domains: ["carneyallseasons.com", "homeadvisor.com"] },
  ],
  context: {
    percentileCopy: null,
    cohortCellValue: "HVAC — Midwest",
    confidenceLabel: "Audit completeness: High",
    confidenceReason: "All six scoring categories have strong signal coverage.",
  },
};
