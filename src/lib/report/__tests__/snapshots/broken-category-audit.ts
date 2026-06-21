/**
 * Snapshot fixture — BROKEN CATEGORY AUDIT
 *
 * Exercises the normalizer's sanitization of raw schema field names leaked
 * from an older deterministicScore payload (generated before FIELD_LABELS
 * humanization was added). diagnostic title and fix action contain stale
 * technical language the normalizer must clean.
 *
 * Also exercises the question-fallback path: the detected businessType
 * produces a conjunction-starting noun ("and decor retailer") which the
 * normalizer replaces with safe generic questions.
 */
import type { BuildReportModelInput } from "@/lib/report/report-model";
import type { DeterministicScore } from "@/lib/scoring/types";

const det = {
  overall_score: 52,
  category_scores: {
    schema: { score: 10, max: 25, reason: "LocalBusiness entity present", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    crawler: { score: 20, max: 20, reason: "Accessible", signals: [], issues: [], evidence_used: [], category_confidence: 1.0 },
    trust: { score: 3, max: 20, reason: "Insufficient trust", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
    content: { score: 6, max: 15, reason: "Thin content", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    brand: { score: 4, max: 10, reason: "NAP inconsistency detected", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    tech: { score: 9, max: 10, reason: "Clean extraction", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
  },
  top_3_findings: [
    // RAW FIELD NAMES — what an older scoring engine wrote before humanization
    { id: "schema.missing_required_fields", severity: "warning", category: "schema", message: "Required entity fields missing: geo, openingHours" },
    // NAP jargon — normalizer cleans this to "name, address, and phone consistency"
    { id: "trust.nap_inconsistent", severity: "critical", category: "trust", message: "NAP inconsistency: name and address conflict across surfaces" },
    { id: "content.thin_content", severity: "warning", category: "content", message: "Homepage content is thin — under 300 words" },
  ],
  top_3_recommended_fixes: [
    // Old stale action text with JSON-LD jargon (pre-fixes-table update) —
    // buildReportModel now prefers ISSUE_TO_FIX[for_finding] over this stored text
    { id: "fix.schema.missing_required_fields", for_finding: "schema.missing_required_fields", action: "Fill in the missing required entity fields (name, address, telephone, url) in the existing JSON-LD block.", impact: "high" },
    { id: "fix.trust.nap_inconsistent", for_finding: "trust.nap_inconsistent", action: "Reconcile business name, phone, and address across your homepage, footer, and structured data so they match exactly.", impact: "high" },
    { id: "fix.content.thin_content", for_finding: "content.thin_content", action: "Expand the primary service pages with at least 300 words each.", impact: "high" },
  ],
  public_bucket_scores: {
    understanding: { score: 48, max: 100, percentage: 48 },
    retrieval: { score: 72, max: 100, percentage: 72 },
    trust: { score: 20, max: 100, percentage: 20 },
    recommendation: { score: 30, max: 100, percentage: 30 },
  },
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: true, entity_checked: true, ingest_present: true, render_attempted: false },
  confidence_level: "moderate",
  confidence_score: 70,
  confidence_inputs: { evidence_completeness: 75, preflight_success: 100, schema_certainty: 65, entity_certainty: 70, content_extraction_quality: 80, render_coverage: 50 },
  score_stability_index: null,
  score_stability_reason: "Insufficient history",
  trace: {} as never,
  computed_at: "2026-05-15T08:00:00Z",
} as unknown as DeterministicScore;

export const BROKEN_CATEGORY_AUDIT_INPUT: BuildReportModelInput = {
  reportId: "GEO-TEST0003",
  orderId: "test-order-0003",
  resolvedBusinessName: "abc carpet & home",
  nameAlternates: ["Abc Home"],
  website: "https://abchome.com",
  generatedAt: new Date("2026-05-15T08:00:00Z"),
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
    // businessType that triggers broken question noun ("luxury home goods and decor retailer")
    { provider: "claude", status: "passed", business_understanding_score: 49, would_recommend: "NO", industry_identified: "luxury home goods and decor retailer", location_identified: null, services_identified: [], missing_facts: ["consistent business name"], recommendation_confidence: "medium", competitive: { business_named: true, entities: [] }, cited_source_domains: [] },
    { provider: "gemini", status: "passed", business_understanding_score: 17, would_recommend: "NO", industry_identified: "carpet and home retailer", location_identified: null, services_identified: [], missing_facts: ["consistent business name"], recommendation_confidence: "low", competitive: { business_named: true, entities: [] }, cited_source_domains: [] },
    { provider: "perplexity", status: "passed", business_understanding_score: 17, would_recommend: "NO", industry_identified: "home goods retailer", location_identified: null, services_identified: [], missing_facts: ["consistent business name"], recommendation_confidence: "low", competitive: { business_named: true, entities: [] }, cited_source_domains: [] },
  ],
  context: {
    percentileCopy: null,
    cohortCellValue: null,
    confidenceLabel: "Audit completeness: Moderate",
    confidenceReason: null,
  },
};
