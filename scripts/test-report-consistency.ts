/* eslint-disable no-console */
/**
 * scripts/test-report-consistency.ts
 *
 * Cross-section consistency guards for the customer report. A KNOWN gap must
 * never read as "Not analyzed"; a signal that wasn't checked must read as
 * "Not confirmed" (never FAIL, never a hard robots.txt fix); local wording
 * must not appear for non-local businesses; and present platform data must
 * render. Pure unit tests over `buildReportModel`.
 */
import assert from "node:assert/strict";

import { buildReportModel } from "../src/lib/report/report-model";
import type { ReportScore } from "../src/lib/parse-report";
import type { DeterministicScore } from "../src/lib/scoring/types";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${label} — ${msg}`);
    console.log(`  ✗ ${label} — ${msg}`);
  }
}

console.log("[report-consistency] running...");

const CATS = (overrides: Partial<Record<string, number>> = {}) =>
  [
    { key: "schema", label: "Recommendation Ready", short: "S", max: 25, score: overrides.schema ?? 2 },
    { key: "crawler", label: "Technical Access", short: "C", max: 20, score: overrides.crawler ?? 5 },
    { key: "trust", label: "Trust Signals", short: "T", max: 20, score: overrides.trust ?? 3 },
    { key: "content", label: "Content Depth", short: "Co", max: 15, score: overrides.content ?? 1 },
    { key: "brand", label: "Brand Presence", short: "B", max: 10, score: overrides.brand ?? 2 },
    { key: "tech", label: "AI Readability", short: "Te", max: 10, score: overrides.tech ?? 4 },
  ];

// A leathery-shaped deterministic score: gaps are KNOWN (no JSON-LD, word
// count 0), crawlability + entity NOT audited.
const DET_LEATHERY = {
  overall_score: 23,
  band: "Invisible",
  category_scores: {
    schema: { score: 2, max: 25, signals: [], issues: [], reason: "No JSON-LD blocks detected", evidence_used: [], category_confidence: 0 },
    crawler: { score: 5, max: 20, signals: [], issues: [], reason: "Crawlability not audited (evidence missing)", evidence_used: [], category_confidence: 0 },
    trust: { score: 5, max: 20, signals: [], issues: [], reason: "No trust markers", evidence_used: [], category_confidence: 0 },
    content: { score: 1, max: 15, signals: [], issues: [], reason: "Word count: 0", evidence_used: [], category_confidence: 0 },
    brand: { score: 3, max: 10, signals: [], issues: [], reason: "Identity unclear", evidence_used: [], category_confidence: 0 },
    tech: { score: 5, max: 10, signals: [], issues: [], reason: "ok", evidence_used: [], category_confidence: 0 },
  },
  evidence_summary: {
    preflight_ok: false, schema_validated: false, crawlability_audited: false,
    entity_checked: false, ingest_present: true, render_attempted: false,
  },
  top_3_findings: [
    { id: "f1", severity: "critical", category: "schema", message: "No structured data on the homepage" },
    { id: "f2", severity: "warning", category: "content", message: "Almost no readable content on the homepage" },
    { id: "f3", severity: "warning", category: "crawler", message: "Crawlability evidence missing — defaulting to low" },
  ],
  top_3_recommended_fixes: [
    { id: "fx1", for_finding: "f1", action: "Add LocalBusiness JSON-LD with name, address, telephone, url.", impact: "high" },
    { id: "fx2", for_finding: "f2", action: "Expand homepage content.", impact: "high" },
    { id: "fx3", for_finding: "f3", action: "Add a robots.txt at the root that explicitly allows the major AI user-agents (GPTBot, ClaudeBot).", impact: "medium" },
  ],
} as unknown as DeterministicScore;

// Preflight that FETCH-FAILED (modules null) — Evidence must fall back to the
// deterministic signals, not "Not analyzed".
const PREFLIGHT_FETCH_FAILED = {
  ok: false, fetchOk: false, fetchError: "ECONNREFUSED", fetchedUrl: null,
  readability: null, schema: null, crawlability: null, entityConsistency: null,
  engineVersion: "v1", runDurationMs: 10,
} as unknown;

function build(opts: {
  industry?: string | null;
  providerOutputs?: unknown;
  preflight?: unknown;
  cats?: ReturnType<typeof CATS>;
}) {
  return buildReportModel({
    reportId: "GEO-TESTCONS",
    orderId: "testcons",
    resolvedBusinessName: "Leathery",
    nameAlternates: [],
    website: "https://leathery.com",
    generatedAt: null,
    score: { overall: 23, status: "Invisible", categories: opts.cats ?? CATS() } as unknown as ReportScore,
    deterministic: DET_LEATHERY,
    providerOutputs: opts.providerOutputs ?? null,
    preflightSignals: opts.preflight ?? PREFLIGHT_FETCH_FAILED,
    industryNormalized: opts.industry ?? "ecommerce",
  });
}

const ev = (m: NonNullable<ReturnType<typeof build>>, label: string) =>
  m.evidence.find((e) => e.label === label)!;

check("known JSON-LD gap → Evidence schema row is FAIL, never 'Not analyzed'", () => {
  const m = build({})!;
  const row = ev(m, "JSON-LD schema blocks");
  assert.equal(row.status, "fail", `expected fail, got ${row.status}`);
  assert.doesNotMatch(row.descriptor, /not analyzed/i);
});

check("known thin content → readable-content + depth rows are FAIL, not 'Not analyzed'", () => {
  const m = build({})!;
  assert.equal(ev(m, "Homepage readable content").status, "fail");
  assert.equal(ev(m, "Homepage depth").status, "fail");
});

check("crawlability not audited → Robots row is NOT CONFIRMED (never FAIL/na)", () => {
  const m = build({})!;
  const row = ev(m, "Robots and crawl access");
  assert.equal(row.status, "unconfirmed", `expected unconfirmed, got ${row.status}`);
});

check("entity not checked → NAP row is NOT CONFIRMED (neutral)", () => {
  const m = build({})!;
  assert.equal(ev(m, "NAP consistency").status, "unconfirmed");
});

check("crawlability not audited → no fix prescribes editing robots.txt", () => {
  const m = build({})!;
  for (const f of m.fixes) {
    assert.doesNotMatch(
      `${f.action} ${f.title}`,
      /robots\.txt/i,
      `fix should not mention robots.txt when crawl not audited: "${f.action}"`,
    );
  }
});

check("non-local business → no 'nearby customer'/'local option' copy", () => {
  const m = build({ industry: "ecommerce" })!;
  const blob = [
    m.businessImpact,
    ...m.diagnostics.map((d) => d.whyItHurts),
    ...m.fixes.map((f) => f.businessImpact),
  ].join(" ");
  assert.doesNotMatch(blob, /nearby customer|local option|where you operate|local recommendation/i, blob.slice(0, 160));
  assert.match(m.businessImpact, /which business to choose in this category/i);
});

check("mislabeled local industry with NO location signal → still general copy", () => {
  // leathery is tagged real_estate (a local type) but no provider found a
  // location → must NOT use local wording.
  const m = build({ industry: "real_estate", providerOutputs: null })!;
  assert.doesNotMatch(m.businessImpact, /nearby customer/i);
});

check("local industry + only SENTINEL location ('Not specified') → general copy", () => {
  // leathery shape: real_estate (local slug) but every model returned a
  // sentinel location string. A sentinel is not a real signal → general copy.
  const m = build({
    industry: "real_estate",
    providerOutputs: [
      { provider: "openai", status: "passed", business_understanding_score: 5, location_identified: "Not specified on the site" },
      { provider: "claude", status: "passed", business_understanding_score: 5, location_identified: "Unknown" },
    ],
  })!;
  assert.doesNotMatch(m.businessImpact, /nearby customer/i, m.businessImpact.slice(0, 120));
  const gemini = m.providers.find((p) => p.provider === "openai")!;
  assert.equal(gemini.location, null, `sentinel location should be null, got ${gemini.location}`);
});

check("genuine local business (local industry + provider location) → local copy", () => {
  const m = build({
    industry: "roofing",
    providerOutputs: [
      { provider: "openai", status: "passed", business_understanding_score: 49, would_recommend: "PARTIAL", industry_identified: "Roofing contractor", location_identified: "Toledo, OH", missing_facts: ["NAP"] },
    ],
  })!;
  assert.match(m.businessImpact, /nearby customer asks an AI who to hire/i);
});

check("provider site fetch-failure flagged (no false site conclusions)", () => {
  const m = build({
    providerOutputs: [
      { provider: "gemini", status: "passed", business_understanding_score: 8, raw_summary: "The website failed to load, preventing any content extraction." },
    ],
  })!;
  const gemini = m.providers.find((p) => p.provider === "gemini")!;
  assert.equal(gemini.fetchFailed, true, "gemini should be flagged fetchFailed");
});

check("present platform data → grid renders (hasProviders true, no fallback)", () => {
  const m = build({
    providerOutputs: [
      { provider: "claude", status: "passed", business_understanding_score: 49, would_recommend: "PARTIAL" },
    ],
  })!;
  assert.equal(m.hasProviders, true);
});

console.log(`[report-consistency] passed=${passed} failed=${failed}`);
if (failed > 0) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
