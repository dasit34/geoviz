/* eslint-disable no-console */
/**
 * scripts/test-report-model.ts
 *
 * Guards the canonical ReportModel assembler (src/lib/report/report-model.ts)
 * — the deterministic foundation of the fixed report framework.
 *
 *   1. Determinism: same input → byte-identical model (the property that
 *      makes every report structurally consistent).
 *   2. Structure: the model always has the fixed skeleton (6 categories
 *      in order, 4 buckets in order, up to 3 diagnostics/fixes, 4
 *      provider slots) regardless of input variation.
 *   3. Deterministic provenance: which 3 diagnostics/fixes appear, their
 *      severity, and fix metadata come from the engine + fixed maps, NOT
 *      from parsed prose.
 *   4. Narration override: a Phase-2 narration object fills slots without
 *      changing structure/order.
 */

import assert from "node:assert/strict";

import {
  buildReportModel,
  buildReportModelFromRender,
  parseNarration,
  type BuildReportModelInput,
} from "../src/lib/report/report-model";
import type { ReportScore } from "../src/lib/parse-report";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

const SCORE: ReportScore = {
  overall: 53,
  status: "Needs Work",
  categories: [
    { key: "schema", label: "Structured Data / Schema", short: "Recommendation Ready", tooltip: "", max: 25, score: 13 },
    { key: "crawler", label: "AI Crawler Readiness", short: "Technical Access", tooltip: "", max: 20, score: 20 },
    { key: "trust", label: "Local Trust Signals", short: "Trust Signals", tooltip: "", max: 20, score: 2 },
    { key: "content", label: "Content Depth + FAQ Quality", short: "Content Depth", tooltip: "", max: 15, score: 5 },
    { key: "brand", label: "Brand / Entity Clarity", short: "Brand Presence", tooltip: "", max: 10, score: 4 },
    { key: "tech", label: "Technical Accessibility", short: "AI Readability", tooltip: "", max: 10, score: 9 },
  ],
};

const DETERMINISTIC = {
  scoring_version: "scoring@1.0.0",
  weight_hash: "x",
  category_hash: "y",
  overall_score: 53,
  band: "Needs Work",
  category_scores: {
    schema: { score: 13, max: 25, signals: [], issues: [], reason: "Some structured identity present but incomplete.", evidence_used: [], category_confidence: 0.6 },
    crawler: { score: 20, max: 20, signals: [], issues: [], reason: "AI crawlers can reach the site.", evidence_used: [], category_confidence: 0.9 },
    trust: { score: 2, max: 20, signals: [], issues: [], reason: "No verifiable reviews or credentials.", evidence_used: [], category_confidence: 0.5 },
    content: { score: 5, max: 15, signals: [], issues: [], reason: "Very thin homepage content.", evidence_used: [], category_confidence: 0.5 },
    brand: { score: 4, max: 10, signals: [], issues: [], reason: "Inconsistent business name across surfaces.", evidence_used: [], category_confidence: 0.4 },
    tech: { score: 9, max: 10, signals: [], issues: [], reason: "Clean, readable structure.", evidence_used: [], category_confidence: 0.9 },
  },
  synergy_bonus_applied: 0,
  synergy_bonus_reason: null,
  synergy_bonus_tier: "none",
  public_bucket_scores: {
    understanding: { score: 30, max: 40, percentage: 75 },
    retrieval: { score: 28, max: 30, percentage: 93 },
    trust: { score: 2, max: 20, percentage: 10 },
    recommendation: { score: 4, max: 10, percentage: 40 },
  },
  recommendation_lift_applied: 0,
  recommendation_lift_reason: null,
  applied_caps: [],
  applied_penalties: [],
  top_3_findings: [
    { id: "trust.no_reviews", severity: "critical", category: "trust", message: "Trust signals are missing or unverifiable" },
    { id: "schema.incomplete", severity: "warning", category: "schema", message: "Structured identity is incomplete" },
    { id: "content.thin", severity: "warning", category: "content", message: "Homepage content is too thin to quote" },
  ],
  top_3_recommended_fixes: [
    { id: "fix.trust", for_finding: "trust.no_reviews", action: "Expose reviews and credentials in structured data", impact: "high" },
    { id: "fix.schema", for_finding: "schema.incomplete", action: "Complete the LocalBusiness identity block", impact: "high" },
    { id: "fix.content", for_finding: "content.thin", action: "Expand homepage and service pages", impact: "medium" },
  ],
  confidence_level: "moderate",
  confidence_score: 60,
  confidence_inputs: {},
  score_stability_index: null,
  score_stability_reason: "",
  evidence_summary: { preflight_ok: true, schema_validated: true, crawlability_audited: true, entity_checked: true, ingest_present: true, render_attempted: true },
  trace: { stages: [] },
  computed_at: "2026-06-04T00:00:00.000Z",
};

const PROVIDERS = [
  { provider: "openai", status: "passed", business_understanding_score: 58, recommendation_confidence: "low", industry_identified: "Dental practice", location_identified: "Northeast Ohio", services_identified: ["Implants", "Orthodontics", "General dentistry", "Whitening"], missing_facts: ["Consistent business name"], would_recommend: "PARTIAL", recommendation_reason: "Clear practice, weak trust." },
  { provider: "claude", status: "passed", business_understanding_score: 55, recommendation_confidence: "medium", industry_identified: "Family dentistry", location_identified: "Cleveland area", services_identified: ["Implants", "Ortho"], missing_facts: ["Address"], would_recommend: "PARTIAL", recommendation_reason: "Needs verification." },
  { provider: "gemini", status: "passed", business_understanding_score: 44, recommendation_confidence: "low", industry_identified: "Family Dentistry", location_identified: "Northeast Ohio", services_identified: ["Implants"], missing_facts: ["Phone"], would_recommend: "NO", recommendation_reason: "Too thin." },
  // perplexity intentionally absent → UNAVAILABLE slot
];

function makeInput(over: Partial<BuildReportModelInput> = {}): BuildReportModelInput {
  return {
    reportId: "GEO-29RW0AXY",
    orderId: "cmpzixgir0000v7ya29rw0axy",
    resolvedBusinessName: "Cleveland Smile Center",
    nameAlternates: ["Full Service Dentistry in Northeast Ohio"],
    website: "https://clevelandsmilecenter.com",
    generatedAt: new Date("2026-06-04T12:00:00Z"),
    score: SCORE,
    deterministic: DETERMINISTIC as unknown as BuildReportModelInput["deterministic"],
    providerOutputs: PROVIDERS,
    context: {
      percentileCopy: "Top 25% among dental audits (n=16).",
      cohortCellValue: "Top 25% (dental)",
      confidenceLabel: "Audit completeness: Moderate",
      confidenceReason: "Business identity weakly confirmed across surfaces.",
    },
    ...over,
  };
}

console.log("[report-model] running...");

check("determinism: same input → byte-identical model", () => {
  const a = JSON.stringify(buildReportModel(makeInput()));
  const b = JSON.stringify(buildReportModel(makeInput()));
  assert.equal(a, b);
});

check("fixed skeleton: 6 categories in canonical order", () => {
  const m = buildReportModel(makeInput())!;
  assert.equal(m.categories.length, 6);
  assert.deepEqual(
    m.categories.map((c) => c.key),
    ["schema", "crawler", "trust", "content", "brand", "tech"],
  );
});

check("fixed skeleton: 4 buckets in canonical order", () => {
  const m = buildReportModel(makeInput())!;
  assert.deepEqual(
    m.buckets.map((b) => b.key),
    ["understanding", "retrieval", "trust", "recommendation"],
  );
  // pct comes straight from the engine
  assert.equal(m.buckets[2].pct, 10); // trust
});

check("always 4 provider slots; missing provider → UNAVAILABLE", () => {
  const m = buildReportModel(makeInput())!;
  assert.equal(m.providers.length, 4);
  const perplexity = m.providers.find((p) => p.provider === "perplexity")!;
  assert.equal(perplexity.verdict, "UNAVAILABLE");
  // top services capped at 3
  const openai = m.providers.find((p) => p.provider === "openai")!;
  assert.equal(openai.topServices.length, 3);
});

check("provider per-platform score + recommendation readiness captured", () => {
  const m = buildReportModel(makeInput())!;
  const openai = m.providers.find((p) => p.provider === "openai")!;
  assert.equal(openai.understandingScore, 58);
  assert.equal(openai.recommendationReadiness, "low");
  const claude = m.providers.find((p) => p.provider === "claude")!;
  assert.equal(claude.recommendationReadiness, "medium");
  const perplexity = m.providers.find((p) => p.provider === "perplexity")!;
  assert.equal(perplexity.understandingScore, null, "unavailable provider has no score");
  assert.equal(perplexity.recommendationReadiness, null);
});

check("readiness: 5 derived factors in canonical order (NOT model scores)", () => {
  const m = buildReportModel(makeInput())!;
  assert.equal(m.readiness.length, 5, "five derived readiness factors");
  assert.deepEqual(
    m.readiness.map((r) => r.key),
    ["ai-overviews", "structured-data", "entity", "citation-trust", "search-visibility"],
  );
  // Google AI Overviews lives in readiness, NEVER as a fifth validated provider
  assert.ok(
    m.providers.every((p) => !/overview/i.test(p.provider)),
    "AI Overviews must not appear in providers[] (the 4 directly-tested models)",
  );
  assert.equal(m.providers.length, 4);
});

check("readiness: ai-overviews is derived from schema+crawler+content", () => {
  const m = buildReportModel(makeInput())!;
  const ov = m.readiness.find((r) => r.key === "ai-overviews")!;
  // schema 13/25=52, crawler 20/20=100, content 5/15=33 → avg = 62
  assert.equal(ov.score, 62);
  assert.equal(ov.label, "Google AI Overviews Readiness");
  // pure category mirrors
  assert.equal(m.readiness.find((r) => r.key === "structured-data")!.score, 52); // schema
  assert.equal(m.readiness.find((r) => r.key === "entity")!.score, 40); // brand
  assert.equal(m.readiness.find((r) => r.key === "citation-trust")!.score, 10); // trust
  // crawler 100, tech 90 → 95
  assert.equal(m.readiness.find((r) => r.key === "search-visibility")!.score, 95);
});

check("diagnostics come from the engine (which 3 + severity)", () => {
  const m = buildReportModel(makeInput())!;
  assert.equal(m.diagnostics.length, 3);
  assert.equal(m.diagnostics[0].severity, "critical");
  assert.equal(m.diagnostics[0].category, "trust");
  assert.equal(m.diagnostics[0].title, "Trust signals are missing or unverifiable");
});

check("fix metadata is deterministic (difficulty/foundationFix/unlocks)", () => {
  const m = buildReportModel(makeInput())!;
  assert.equal(m.fixes.length, 3);
  // fix.trust maps to category trust → Moderate
  assert.equal(m.fixes[0].difficulty, "Moderate");
  assert.equal(m.fixes[0].foundationFix, true);
  assert.ok(m.fixes[0].unlocks.length >= 1);
  // fix.schema → Technical
  assert.equal(m.fixes[1].difficulty, "Technical");
});

check("executive summary derives strongest/weakest deterministically", () => {
  const m = buildReportModel(makeInput())!;
  assert.match(m.executive.strongestSignal, /Crawl Access|Content Extraction/);
  assert.match(m.executive.weakestSignal, /Trust Signals/);
  assert.equal(m.executive.summaryBullets.length, 3);
});

check("Phase-2 narration overrides slots without changing structure", () => {
  const m = buildReportModel(
    makeInput({
      narration: {
        executiveHeadline: "Custom headline.",
        diagnostics: { "trust.no_reviews": { problem: "Custom problem.", whyItHurts: "Custom hurts." } },
        fixes: { "fix.trust": { businessImpact: "Custom impact." } },
        businessImpact: "Custom business impact.",
      },
    }),
  )!;
  assert.equal(m.executive.headline, "Custom headline.");
  assert.equal(m.diagnostics[0].problem, "Custom problem.");
  assert.equal(m.diagnostics[0].whyItHurts, "Custom hurts.");
  assert.equal(m.fixes[0].businessImpact, "Custom impact.");
  assert.equal(m.businessImpact, "Custom business impact.");
  // structure unchanged
  assert.equal(m.categories.length, 6);
  assert.equal(m.diagnostics.length, 3);
});

check("cohort + confidence carried from context", () => {
  const m = buildReportModel(makeInput())!;
  assert.equal(m.meta.cohort, "Top 25% (dental)");
  assert.equal(m.score.confidenceLabel, "Audit completeness: Moderate");
  assert.equal(m.score.percentileCopy, "Top 25% among dental audits (n=16).");
});

check("name alternates surfaced (resolved name is primary)", () => {
  const m = buildReportModel(makeInput())!;
  assert.equal(m.meta.businessName, "Cleveland Smile Center");
  assert.deepEqual(m.meta.nameAlternates, ["Full Service Dentistry in Northeast Ohio"]);
});

check("deterministic narration is category-specific (not one repeated line)", () => {
  const m = buildReportModel(makeInput())!;
  const hurts = m.diagnostics.map((d) => d.whyItHurts);
  assert.equal(new Set(hurts).size, hurts.length, "whyItHurts lines should differ per category");
});

// ── review label + score note (product-quality pass) ────────────────
check("meta.reviewed defaults false; reflects the input flag", () => {
  assert.equal(buildReportModel(makeInput())!.meta.reviewed, false);
  assert.equal(buildReportModel(makeInput({ reviewed: true }))!.meta.reviewed, true);
});

check("scoreNote fires for Needs Work + high access / low recommendation", () => {
  // Default fixture: crawler 20/20 + tech 9/10 (access high), schema/brand/trust
  // low, band Needs Work → the access-vs-recommendation note appears.
  const m = buildReportModel(makeInput())!;
  assert.equal(m.score.band, "Needs Work");
  assert.match(m.scoreNote ?? "", /Access and extraction raise the baseline score/);
  assert.match(m.scoreNote ?? "", /remains in Needs Work/);
});

check("model carries 5 customer questions derived from the business", () => {
  const m = buildReportModel(makeInput())!;
  assert.ok(Array.isArray(m.customerQuestions), "customerQuestions is an array");
  assert.equal(m.customerQuestions.length, 5, "five questions shown");
  assert.equal(new Set(m.customerQuestions).size, 5, "questions are unique");
  // never leaks a template placeholder
  assert.doesNotMatch(m.customerQuestions.join(" | "), /[{}]|undefined/);
});

check("scoreNote is null when recommendation signals are strong", () => {
  const strong = makeInput({
    score: {
      overall: 78,
      status: "Competitive",
      categories: [
        { key: "schema", label: "", short: "", tooltip: "", max: 25, score: 22 },
        { key: "crawler", label: "", short: "", tooltip: "", max: 20, score: 20 },
        { key: "trust", label: "", short: "", tooltip: "", max: 20, score: 16 },
        { key: "content", label: "", short: "", tooltip: "", max: 15, score: 11 },
        { key: "brand", label: "", short: "", tooltip: "", max: 10, score: 8 },
        { key: "tech", label: "", short: "", tooltip: "", max: 10, score: 9 },
      ],
    } as unknown as ReportScore,
  });
  assert.equal(buildReportModel(strong)!.scoreNote, null);
});

// ── parseNarration (Phase 2 plumbing) ───────────────────────────────
check("parseNarration extracts a valid embedded block", () => {
  const md = '# Report\n<!--GEOVIZ_NARRATION {"executiveHeadline":"Custom.","diagnostics":{"trust.no_reviews":{"problem":"P"}}} -->\nmore';
  const n = parseNarration(md);
  assert.equal(n?.executiveHeadline, "Custom.");
  assert.equal(n?.diagnostics?.["trust.no_reviews"]?.problem, "P");
});

check("parseNarration is fail-soft on missing/malformed block", () => {
  assert.equal(parseNarration("# just markdown"), null);
  assert.equal(parseNarration("<!--GEOVIZ_NARRATION {bad json} -->"), null);
  assert.equal(parseNarration(null), null);
});

check("buildReportModelFromRender consumes embedded narration", () => {
  const md = '## AI Visibility Score\n\n**53/100**\n<!--GEOVIZ_NARRATION {"businessImpact":"Embedded impact."} -->';
  const m = buildReportModelFromRender({
    orderId: "cmpzixgir0000v7ya29rw0axy",
    businessLabel: "Cleveland Smile Center",
    websiteUrl: "https://clevelandsmilecenter.com",
    reportMarkdown: md,
    reportGeneratedAt: new Date("2026-06-04T12:00:00Z"),
    deterministicScore: DETERMINISTIC,
    context: { aiValidations: { outputs: PROVIDERS } },
  });
  assert.ok(m, "model should build from render inputs");
  assert.equal(m!.businessImpact, "Embedded impact.");
  assert.equal(m!.meta.reportId, "GEO-29RW0AXY");
  // structure still locked
  assert.equal(m!.categories.length, 6);
  assert.equal(m!.buckets.length, 4);
});

if (failed > 0) {
  console.log(`[report-model] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[report-model] passed=${passed} failed=0`);
