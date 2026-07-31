/**
 * Snapshot fixture — RECOMMENDATION-READINESS CONTRADICTION REGRESSION
 *
 * Reproduces the exact shape of the cover-vs-diagnostics contradiction bug:
 * a business with genuinely weak identity/trust/content signals (schema,
 * trust, content, brand all low) but a fully crawlable, technically clean
 * site. Before the fix, the cover's "Recommendation" bucket read from
 * `public_bucket_scores.recommendation` (Content-only) while Diagnostics
 * read the Schema category mislabeled "Recommendation Ready" — two
 * unrelated numbers under the same word. After the fix, both read the same
 * canonical `recommendationReadiness` composite
 * (`computeDimensions().recommendation_readiness` — brand 0.25 + schema
 * 0.30 + trust 0.25 + content 0.20).
 *
 * With brand=0/10, schema=2/25, trust=2/20, content=2/15, the composite is
 * brandPct*.25 + schemaPct*.30 + trustPct*.25 + contentPct*.20
 *   = 0*.25 + 8*.30 + 10*.25 + 13.33*.20 = 7.567 → rounds to 8.
 * (`overall` is set directly to 50, matching this repo's existing hand-built
 * fixture convention — see `missing-reviews-audit.ts`, where `overall` is
 * also set independently of the raw category-point sum.)
 *
 * Exercises:
 *  - Cover bucket, Page 6 headline, and Diagnostics categories must never
 *    disagree, and the cover must never show a bucket-derived percentage
 *    unrelated to the readiness composite (the "80%" bug shape).
 *  - 0 of 4 models recommended, 2 of 4 mentioned — rendered as counts, never
 *    converted to a percentage, never equal to the readiness score.
 *  - Issue evidence mapping: the `trust.no_reviews_signal` finding must show
 *    ITS OWN message, not the category's shared NAP-inconsistency reason.
 */
import type { BuildReportModelInput } from "@/lib/report/report-model";
import type { DeterministicScore } from "@/lib/scoring/types";

const det = {
  overall_score: 50,
  category_scores: {
    schema: { score: 2, max: 25, reason: "No JSON-LD entity block detected on the homepage", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    crawler: { score: 20, max: 20, reason: "Fully accessible; sitemap present; no crawl blocks", signals: [], issues: [], evidence_used: [], category_confidence: 1.0 },
    // Shared category-level `reason` is deliberately the NAP-inconsistency
    // text — this is the exact shape that leaked into the WRONG finding's
    // "problem" field before the fix (Issue #3 evidence-mapping bug).
    trust: { score: 2, max: 20, reason: "Name / phone / address inconsistent between surfaces", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
    content: { score: 2, max: 15, reason: "Service pages thin; no FAQ content detected", signals: [], issues: [], evidence_used: [], category_confidence: 0.75 },
    brand: { score: 0, max: 10, reason: "No consistent business identity found across surfaces", signals: [], issues: [], evidence_used: [], category_confidence: 0.7 },
    tech: { score: 10, max: 10, reason: "Server-rendered; clean structure; no hydration issues", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
  },
  top_3_findings: [
    { id: "trust.nap_inconsistent", severity: "critical", category: "trust", message: "Name / phone / address conflict across surfaces — AI can't resolve one business" },
    { id: "trust.no_reviews_signal", severity: "info", category: "trust", message: "No review or rating signal AI can read" },
    { id: "schema.no_localbusiness", severity: "warning", category: "schema", message: "No structured business entity detected in the page source" },
  ],
  top_3_recommended_fixes: [
    { id: "fix.trust.nap_inconsistent", for_finding: "trust.nap_inconsistent", action: "Align the business name, phone, and address across the homepage, footer, and structured data.", impact: "high" },
    { id: "fix.trust.no_reviews_signal", for_finding: "trust.no_reviews_signal", action: "Surface a readable review count and aggregate rating on the homepage.", impact: "medium" },
    { id: "fix.schema.no_localbusiness", for_finding: "schema.no_localbusiness", action: "Add JSON-LD structured data describing the business as Organization or LocalBusiness.", impact: "high" },
  ],
  public_bucket_scores: {
    understanding: { score: 2, max: 35, percentage: 6 },
    retrieval: { score: 30, max: 30, percentage: 100 },
    trust: { score: 2, max: 20, percentage: 10 },
    // Content-only bucket — intentionally HIGH-looking relative to the real
    // readiness composite (2/15 ≈ 13%, not the ~80% the pre-fix cover would
    // have shown from a different, stronger-content variant of this bug).
    // Kept realistic to this fixture's own category scores rather than
    // reproducing the production report's exact numbers.
    recommendation: { score: 2, max: 15, percentage: 13 },
  },
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: true, entity_checked: true, ingest_present: true, render_attempted: false },
  confidence_level: "high",
  confidence_score: 80,
  confidence_inputs: { evidence_completeness: 90, preflight_success: 100, schema_certainty: 80, entity_certainty: 75, content_extraction_quality: 80, render_coverage: 50 },
  score_stability_index: null,
  score_stability_reason: "Insufficient history",
  trace: {} as never,
  computed_at: "2026-07-15T09:00:00Z",
} as unknown as DeterministicScore;

export const RECOMMENDATION_READINESS_CONTRADICTION_INPUT: BuildReportModelInput = {
  reportId: "GEO-TEST0007",
  orderId: "test-order-0007",
  resolvedBusinessName: "Norwood Exterior Solutions",
  nameAlternates: [],
  website: "https://norwoodexteriorsolutions.com",
  generatedAt: new Date("2026-07-15T09:00:00Z"),
  reviewed: false,
  industryNormalized: "contractor",
  score: {
    overall: 50,
    status: "Needs Work",
    categories: [
      { key: "schema", label: "Structured Data / Schema", short: "Structured Data / Schema", score: 2, max: 25 },
      { key: "crawler", label: "AI Crawler Readiness", short: "Crawl Access", score: 20, max: 20 },
      { key: "trust", label: "Local Trust Signals", short: "Trust Signals", score: 2, max: 20 },
      { key: "content", label: "Content Depth + FAQ Quality", short: "Content Depth", score: 2, max: 15 },
      { key: "brand", label: "Brand / Entity Clarity", short: "Brand Presence", score: 0, max: 10 },
      { key: "tech", label: "Technical Accessibility", short: "Content Extraction", score: 10, max: 10 },
    ],
  },
  deterministic: det,
  providerOutputs: [
    { provider: "openai", status: "passed", business_understanding_score: 40, would_recommend: "NO", industry_identified: "home exterior contractor", location_identified: "Norwood", services_identified: ["siding", "roofing"], missing_facts: ["customer reviews", "aggregate rating"], recommendation_confidence: "low", competitive: { business_named: true, entities: ["Angi", "HomeAdvisor"] }, cited_source_domains: [] },
    { provider: "claude", status: "passed", business_understanding_score: 35, would_recommend: "NO", industry_identified: "exterior remodeling contractor", location_identified: null, services_identified: ["siding"], missing_facts: ["review count and rating", "consistent business identity"], recommendation_confidence: "low", competitive: { business_named: true, entities: [] }, cited_source_domains: [] },
    { provider: "gemini", status: "passed", business_understanding_score: 30, would_recommend: "NO", industry_identified: "contractor", location_identified: "Norwood area", services_identified: ["siding", "roofing"], missing_facts: ["customer reviews", "business verification signal"], recommendation_confidence: "low", competitive: { business_named: false, entities: ["Thumbtack"] }, cited_source_domains: ["yelp.com"] },
    { provider: "perplexity", status: "passed", business_understanding_score: 28, would_recommend: "NO", industry_identified: "home exterior contractor", location_identified: null, services_identified: [], missing_facts: ["review signals", "structured business data"], recommendation_confidence: "low", competitive: { business_named: false, entities: [] }, cited_source_domains: ["yelp.com"] },
  ],
  context: {
    percentileCopy: null,
    cohortCellValue: null,
    confidenceLabel: "Audit completeness: High",
    confidenceReason: "All six scoring categories had strong signal coverage. Identity, trust, and content signals were measurably weak.",
  },
};
