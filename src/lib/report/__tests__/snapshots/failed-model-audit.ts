/**
 * Snapshot fixture — FAILED MODEL AUDIT
 *
 * All 4 providers UNAVAILABLE (API keys not configured). P3 shows the
 * "AI models were not tested" note; P2 shows Overall stat (not AI Recommendation);
 * hasProviders = false throughout.
 */
import type { BuildReportModelInput } from "@/lib/report/report-model";
import type { DeterministicScore } from "@/lib/scoring/types";

const det = {
  overall_score: 44,
  category_scores: {
    schema: { score: 5, max: 25, reason: "No LocalBusiness or Organization JSON-LD block", signals: [], issues: [], evidence_used: [], category_confidence: 0.95 },
    crawler: { score: 18, max: 20, reason: "robots.txt allows crawlers; no sitemap detected", signals: [], issues: [], evidence_used: [], category_confidence: 0.9 },
    trust: { score: 8, max: 20, reason: "Some trust markers but reviews not surfaced on homepage", signals: [], issues: [], evidence_used: [], category_confidence: 0.7 },
    content: { score: 7, max: 15, reason: "280 words; below 300-word recommendation", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    brand: { score: 4, max: 10, reason: "Business name consistent on 2 of 3 surfaces", signals: [], issues: [], evidence_used: [], category_confidence: 0.8 },
    tech: { score: 2, max: 10, reason: "Client-side rendering detected; limited server-side content", signals: [], issues: [], evidence_used: [], category_confidence: 0.85 },
  },
  top_3_findings: [
    { id: "schema.no_localbusiness", severity: "critical", category: "schema", message: "No complete LocalBusiness or Organization identity block" },
    { id: "tech.client_only_content", severity: "warning", category: "tech", message: "Client-only content — server-rendered HTML is minimal" },
    { id: "content.thin_content", severity: "warning", category: "content", message: "Homepage content is thin — under 300 words" },
  ],
  top_3_recommended_fixes: [
    { id: "fix.schema.no_localbusiness", for_finding: "schema.no_localbusiness", action: "Add a structured business profile with your name, address, phone number, website URL, and location coordinates.", impact: "high" },
    { id: "fix.tech.client_only_content", for_finding: "tech.client_only_content", action: "Move critical content (business name, services, contact info) into server-rendered HTML instead of relying on client-side hydration.", impact: "high" },
    { id: "fix.content.thin_content", for_finding: "content.thin_content", action: "Expand the primary service pages with at least 300 words each, covering what you do, where you do it, and the customer outcomes.", impact: "high" },
  ],
  public_bucket_scores: {
    understanding: { score: 30, max: 100, percentage: 30 },
    retrieval: { score: 52, max: 100, percentage: 52 },
    trust: { score: 28, max: 100, percentage: 28 },
    recommendation: { score: 18, max: 100, percentage: 18 },
  },
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: true, entity_checked: true, ingest_present: true, render_attempted: true },
  confidence_level: "moderate",
  confidence_score: 68,
  confidence_inputs: { evidence_completeness: 70, preflight_success: 100, schema_certainty: 95, entity_certainty: 60, content_extraction_quality: 65, render_coverage: 80 },
  score_stability_index: null,
  score_stability_reason: "Insufficient history",
  trace: {} as never,
  computed_at: "2026-06-10T14:30:00Z",
} as unknown as DeterministicScore;

export const FAILED_MODEL_AUDIT_INPUT: BuildReportModelInput = {
  reportId: "GEO-TEST0004",
  orderId: "test-order-0004",
  resolvedBusinessName: "Summit Roofing Solutions",
  nameAlternates: [],
  website: "https://summitroofers.com",
  generatedAt: new Date("2026-06-10T14:30:00Z"),
  reviewed: false,
  industryNormalized: "roofing",
  score: {
    overall: 44,
    status: "At Risk",
    categories: [
      { key: "schema", label: "Structured Data / Schema", short: "Recommendation Ready", score: 5, max: 25 },
      { key: "crawler", label: "AI Crawler Readiness", short: "Crawl Access", score: 18, max: 20 },
      { key: "trust", label: "Local Trust Signals", short: "Trust Signals", score: 8, max: 20 },
      { key: "content", label: "Content Depth + FAQ Quality", short: "Content Depth", score: 7, max: 15 },
      { key: "brand", label: "Brand / Entity Clarity", short: "Brand Presence", score: 4, max: 10 },
      { key: "tech", label: "Technical Accessibility", short: "Content Extraction", score: 2, max: 10 },
    ],
  },
  deterministic: det,
  // All providers unavailable — exercises hasProviders = false path
  providerOutputs: [
    { provider: "openai", status: "unavailable", error: "API key not configured" },
    { provider: "claude", status: "unavailable", error: "API key not configured" },
    { provider: "gemini", status: "unavailable", error: "API key not configured" },
    { provider: "perplexity", status: "unavailable", error: "API key not configured" },
  ],
  context: {
    percentileCopy: null,
    cohortCellValue: null,
    confidenceLabel: "Audit completeness: Moderate",
    confidenceReason: "AI model testing was not available for this audit.",
  },
};
