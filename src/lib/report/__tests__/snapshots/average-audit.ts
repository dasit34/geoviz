/**
 * Snapshot fixture — AVERAGE AUDIT
 *
 * Score 52, Needs Work. 3 of 4 models tested, 0 of 4 recommend. Entity
 * consistency issues. Exercises the KEY FINDING callout and WHY AI DIDN'T
 * RECOMMEND YOU callout.
 */
import type { BuildReportModelInput } from "@/lib/report/report-model";
import type { DeterministicScore } from "@/lib/scoring/types";

const det = {
  overall_score: 52,
  category_scores: {
    schema: { score: 10, max: 25, reason: "LocalBusiness entity present; identity fields incomplete", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    crawler: { score: 20, max: 20, reason: "robots.txt present; site accessible", signals: [], issues: [], evidence_used: [], category_confidence: 1.0 },
    trust: { score: 3, max: 20, reason: "Insufficient verifiable third-party trust markers", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
    content: { score: 6, max: 15, reason: "190 words; below 300-word recommendation", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    brand: { score: 4, max: 10, reason: "Business name varies between surfaces", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    tech: { score: 9, max: 10, reason: "Content extracted successfully; H1 present", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
  },
  top_3_findings: [
    { id: "trust.nap_inconsistent", severity: "critical", category: "trust", message: "Name / phone / address conflict across surfaces — AI can't resolve one business" },
    { id: "schema.missing_required_fields", severity: "warning", category: "schema", message: "Business profile missing required fields: location coordinates, business hours" },
    { id: "content.thin_content", severity: "warning", category: "content", message: "Homepage content is thin — under 300 words" },
  ],
  top_3_recommended_fixes: [
    { id: "fix.trust.nap_inconsistent", for_finding: "trust.nap_inconsistent", action: "Reconcile business name, phone, and address across your homepage, footer, and structured data so they match exactly.", impact: "high" },
    { id: "fix.schema.missing_required_fields", for_finding: "schema.missing_required_fields", action: "Add the missing business details to your site's machine-readable business profile.", impact: "high" },
    { id: "fix.content.thin_content", for_finding: "content.thin_content", action: "Expand the primary service pages with at least 300 words each, covering what you do, where you do it, and the customer outcomes.", impact: "high" },
  ],
  public_bucket_scores: {
    understanding: { score: 48, max: 100, percentage: 48 },
    retrieval: { score: 72, max: 100, percentage: 72 },
    trust: { score: 20, max: 100, percentage: 20 },
    recommendation: { score: 30, max: 100, percentage: 30 },
  },
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: true, entity_checked: true, ingest_present: true, render_attempted: false },
  confidence_level: "moderate",
  confidence_score: 72,
  confidence_inputs: { evidence_completeness: 80, preflight_success: 100, schema_certainty: 70, entity_certainty: 75, content_extraction_quality: 80, render_coverage: 50 },
  score_stability_index: null,
  score_stability_reason: "Insufficient history",
  trace: {} as never,
  computed_at: "2026-06-21T10:00:00Z",
} as unknown as DeterministicScore;

export const AVERAGE_AUDIT_INPUT: BuildReportModelInput = {
  reportId: "GEO-TEST0002",
  orderId: "test-order-0002",
  resolvedBusinessName: "abc carpet & home",
  nameAlternates: ["Abc Home"],
  website: "https://abchome.com",
  generatedAt: new Date("2026-06-21T10:00:00Z"),
  reviewed: false,
  industryNormalized: null,
  score: {
    overall: 52,
    status: "Needs Work",
    categories: [
      { key: "schema", label: "Structured Data / Schema", short: "Recommendation Ready", score: 10, max: 25 },
      { key: "crawler", label: "AI Crawler Readiness", short: "Crawl Access", score: 20, max: 20 },
      { key: "trust", label: "Local Trust Signals", short: "Trust Signals", score: 3, max: 20 },
      { key: "content", label: "Content Depth + FAQ Quality", short: "Content Depth", score: 6, max: 15 },
      { key: "brand", label: "Brand / Entity Clarity", short: "Brand Presence", score: 4, max: 10 },
      { key: "tech", label: "Technical Accessibility", short: "Content Extraction", score: 9, max: 10 },
    ],
  },
  deterministic: det,
  providerOutputs: [
    { provider: "openai", status: "unavailable" },
    { provider: "claude", status: "passed", business_understanding_score: 49, would_recommend: "NO", industry_identified: "home furnishings retailer", location_identified: null, services_identified: [], missing_facts: ["Clarification on whether the business is 'abc home' or 'abc carpet & home'"], recommendation_confidence: "medium", competitive: { business_named: true, entities: [] }, cited_source_domains: [] },
    { provider: "gemini", status: "passed", business_understanding_score: 17, would_recommend: "NO", industry_identified: "carpet and home retailer", location_identified: null, services_identified: [], missing_facts: ["Consistent business name across all surfaces"], recommendation_confidence: "low", competitive: { business_named: true, entities: [] }, cited_source_domains: [] },
    { provider: "perplexity", status: "passed", business_understanding_score: 17, would_recommend: "NO", industry_identified: "home goods retailer", location_identified: null, services_identified: [], missing_facts: ["Consistent business name across all surfaces"], recommendation_confidence: "low", competitive: { business_named: true, entities: [] }, cited_source_domains: ["facebook.com", "abchome.com", "yelp.com", "tripadvisor.com"] },
  ],
  context: {
    percentileCopy: null,
    cohortCellValue: null,
    confidenceLabel: "Audit completeness: Moderate",
    confidenceReason: "Coverage across all six scoring categories.",
  },
};
