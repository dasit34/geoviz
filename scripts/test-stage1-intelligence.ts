/* eslint-disable no-console */
/**
 * scripts/test-stage1-intelligence.ts
 *
 * V2 Stage 1 smoke test. The repo doesn't have a unit-test framework
 * installed (intentional — adding vitest is out of scope for Stage 1)
 * so this script runs the same assertions a vitest suite would, using
 * Node assertions. Exits non-zero on any failure so it can wire into
 * CI later.
 *
 *   npm run test:stage1-intelligence
 *
 * Asserts:
 *   1. existing audits still generate (the intelligence path is
 *      additive — no module throws on representative markdown)
 *   2. missing intelligence fields do not break old rows (null
 *      handling on every module + the orchestrator)
 *   3. intelligence ingestion failure does not fail the audit (each
 *      module is wrapped; whole orchestrator is wrapped at the call
 *      site in audit-intelligence.ts)
 *   4. nullable fields persist correctly (ingest returns the right
 *      shape — every field present, nulls allowed)
 *   5. scoreProvenance structure is valid (typed shape matches the
 *      schema persisted as Json)
 */

import assert from "node:assert/strict";
import { runIntelligenceIngest } from "../src/lib/intelligence/intelligenceIngest";
import { detectCms } from "../src/lib/intelligence/detectCms";
import { detectFramework } from "../src/lib/intelligence/detectFramework";
import { computeReadability } from "../src/lib/intelligence/readability";
import { extractEntities } from "../src/lib/intelligence/entities";
import { buildScoreProvenance } from "../src/lib/intelligence/scoreProvenance";
import {
  parseReportScoreBreakdown,
} from "../src/lib/parse-report";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n      ${message}`);
  }
}

// Representative audit markdown — short enough to read at a glance,
// long enough to trigger every module's signal detection.
const SAMPLE_MARKDOWN = `# AI Visibility Audit — Acme Roofing

## 1. AI Visibility Score
Overall Score: 41/100 — At Risk

Schema/Structured Data: 4/25
AI Crawler Readiness: 12/20
Local Trust Signals: 9/20
Content Depth + FAQ Quality: 6/15
Brand/Entity Clarity: 6/10
Technical Accessibility: 4/10

**Why this band:** ✅ Strong service area mentions ✅ Reviews present
✅ Consistent NAP across pages ❌ No FAQ schema ❌ Missing LocalBusiness
schema ❌ JavaScript-rendered content limits AI readability

## 2. What's Holding You Back

### 1. No structured data
The site has no detectable JSON-LD or microdata. AI tools rely on
LocalBusiness markup to confidently surface businesses.

### 2. Missing FAQ section
Customers asking ChatGPT for roofer recommendations need FAQ content
to verify expertise. None detected.

### 3. JS-heavy site
The site is rendered client-side via Next.js, which limits what
AI crawlers can read on first fetch.

## 3. What to Fix First

### 1. Add LocalBusiness schema
Implement JSON-LD with business name, address, phone, and service area.

### 2. Add an FAQ section
Cover common roofing repair questions to support AI Q&A scenarios.

### 3. Ensure server-side rendering
Move critical content to SSR or static generation.

## Service Areas
Austin, TX and surrounding counties. Roof repair, roof installation,
and emergency leak service available 24/7.

## Reviews
Average rating: 4.8 stars across Google reviews.
`;

const EMPTY_MARKDOWN = "";
const SHORT_MARKDOWN = "## 1. AI Visibility Score\nOverall: 41/100";

// ───────────────────────────────────────────────────────────────
// 1. Module skeletons return safe defaults on empty/short input
// ───────────────────────────────────────────────────────────────
console.log("\n[1] Module safety — empty + short input handling");

test("detectCms returns empty result on empty markdown", () => {
  const r = detectCms({ reportMarkdown: EMPTY_MARKDOWN, websiteUrl: "https://example.com" });
  assert.equal(r.detected, null);
  assert.equal(r.confidence, "none");
  assert.deepEqual(r.signals, []);
});

test("detectFramework returns empty result on empty markdown", () => {
  const r = detectFramework({ reportMarkdown: EMPTY_MARKDOWN, websiteUrl: "https://example.com" });
  assert.equal(r.detected, null);
  assert.equal(r.confidence, "none");
});

test("computeReadability returns null score on too-short markdown", () => {
  const r = computeReadability({ reportMarkdown: SHORT_MARKDOWN });
  assert.equal(r.score, null);
  assert.equal(r.contentDensity, null);
});

test("extractEntities returns [] on empty markdown", () => {
  const r = extractEntities({ reportMarkdown: EMPTY_MARKDOWN, businessName: null });
  assert.deepEqual(r.entities, []);
});

test("buildScoreProvenance returns {} on empty markdown", () => {
  const score = parseReportScoreBreakdown("");
  const r = buildScoreProvenance({ reportMarkdown: "", score });
  assert.deepEqual(r, {});
});

// ───────────────────────────────────────────────────────────────
// 2. Real markdown produces populated, well-typed results
// ───────────────────────────────────────────────────────────────
console.log("\n[2] Real markdown — populated results");

test("detectFramework finds Next.js in sample markdown", () => {
  const r = detectFramework({ reportMarkdown: SAMPLE_MARKDOWN, websiteUrl: "https://acme-roofing.com" });
  assert.equal(r.detected, "nextjs");
  assert.equal(r.confidence, "high");
  assert.ok(r.signals.length > 0);
});

test("computeReadability emits a 0..100 score for sample markdown", () => {
  const r = computeReadability({ reportMarkdown: SAMPLE_MARKDOWN });
  assert.ok(r.score !== null);
  assert.ok(r.score! >= 0 && r.score! <= 100);
  assert.ok(r.contentDensity !== null);
  assert.equal(r.signals.hasServicesSection, true);
  assert.equal(r.signals.hasLocationMention, true);
  assert.equal(r.signals.hasReviewsSection, true);
});

test("extractEntities pulls at least one entity from sample markdown", () => {
  const r = extractEntities({
    reportMarkdown: SAMPLE_MARKDOWN,
    businessName: "Acme Roofing",
  });
  assert.ok(r.entities.length >= 1);
  assert.equal(r.counts.other >= 1, true);
});

test("buildScoreProvenance populates dimensions from a parsed score", () => {
  const score = parseReportScoreBreakdown(SAMPLE_MARKDOWN);
  const r = buildScoreProvenance({ reportMarkdown: SAMPLE_MARKDOWN, score });
  // Sample markdown has all 6 rubric categories present.
  assert.ok(r.schema !== undefined);
  assert.ok(r.crawlability !== undefined);
  assert.ok(r.trust !== undefined);
  assert.ok(r.content !== undefined);
  // Each dimension has the typed shape.
  if (r.schema) {
    assert.equal(typeof r.schema.scoreMax, "number");
    assert.ok(Array.isArray(r.schema.reasons));
    assert.ok(Array.isArray(r.schema.signals));
  }
});

// ───────────────────────────────────────────────────────────────
// 3. Orchestrator return shape is stable + null-safe
// ───────────────────────────────────────────────────────────────
console.log("\n[3] Orchestrator — return shape is stable");

const EXPECTED_KEYS = [
  "cmsDetected",
  "frameworkDetected",
  "schemaTypes",
  "aiReadabilityScore",
  "contentDensity",
  "renderRequired",
  "renderAttempted",
  "renderSuccessful",
  "renderEngineVersion",
  "benchmarkTags",
  "extractedEntities",
  "scoreProvenance",
];

test("runIntelligenceIngest returns all expected keys on empty markdown", () => {
  const score = parseReportScoreBreakdown("");
  const r = runIntelligenceIngest({
    reportMarkdown: "",
    businessName: null,
    websiteUrl: "https://example.com",
    score,
    orderId: "test_empty",
  });
  for (const k of EXPECTED_KEYS) {
    assert.ok(k in r, `missing key: ${k}`);
  }
  // Every value should be null on empty input (no signals to emit).
  assert.equal(r.cmsDetected, null);
  assert.equal(r.frameworkDetected, null);
  assert.equal(r.aiReadabilityScore, null);
  assert.equal(r.contentDensity, null);
  assert.equal(r.renderRequired, null);
  assert.equal(r.scoreProvenance, null);
});

test("runIntelligenceIngest returns all expected keys on sample markdown", () => {
  const score = parseReportScoreBreakdown(SAMPLE_MARKDOWN);
  const r = runIntelligenceIngest({
    reportMarkdown: SAMPLE_MARKDOWN,
    businessName: "Acme Roofing",
    websiteUrl: "https://acme-roofing.com",
    score,
    orderId: "test_sample",
  });
  for (const k of EXPECTED_KEYS) {
    assert.ok(k in r, `missing key: ${k}`);
  }
  // The render* render fields stay null until Stage 6.
  assert.equal(r.renderAttempted, null);
  assert.equal(r.renderSuccessful, null);
  assert.equal(r.renderEngineVersion, null);
  // But renderRequired heuristic CAN flip on for js-heavy sites.
  assert.equal(typeof r.renderRequired === "boolean" || r.renderRequired === null, true);
  // benchmarkTags is system-set, distinct from operator-set benchmarkTag.
  if (r.benchmarkTags) {
    assert.ok(Array.isArray(r.benchmarkTags));
    assert.ok(r.benchmarkTags.length > 0);
  }
});

test("runIntelligenceIngest never throws on malformed input", () => {
  // Throws inside a child module would be a real bug; the orchestrator's
  // try/catch should hide them. Force a stress case.
  const score = parseReportScoreBreakdown("");
  let threw = false;
  try {
    const malformedMd = "   ".repeat(1000);
    runIntelligenceIngest({
      reportMarkdown: malformedMd,
      businessName: null,
      websiteUrl: "javascript:void(0)",
      score,
      orderId: "test_malformed",
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "orchestrator must never throw");
});

// ───────────────────────────────────────────────────────────────
// 4. scoreProvenance Json shape is round-trippable
// ───────────────────────────────────────────────────────────────
console.log("\n[4] scoreProvenance — round-trip through JSON.stringify");

test("scoreProvenance survives JSON serialization", () => {
  const score = parseReportScoreBreakdown(SAMPLE_MARKDOWN);
  const r = buildScoreProvenance({ reportMarkdown: SAMPLE_MARKDOWN, score });
  const json = JSON.stringify(r);
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed, r);
});

// ───────────────────────────────────────────────────────────────
// 5. Audit-engine zero-behavior guarantee — surface inspection
// ───────────────────────────────────────────────────────────────
console.log("\n[5] Zero-behavior guarantees");

test("The intelligence layer does not touch parse-report output", () => {
  // The runIntelligenceIngest function receives `score` as input but
  // never mutates it. After running, the score object must be
  // identical.
  const score = parseReportScoreBreakdown(SAMPLE_MARKDOWN);
  const before = JSON.stringify(score);
  runIntelligenceIngest({
    reportMarkdown: SAMPLE_MARKDOWN,
    businessName: "Acme Roofing",
    websiteUrl: "https://acme-roofing.com",
    score,
    orderId: "test_mutation",
  });
  const after = JSON.stringify(score);
  assert.equal(before, after, "score object was mutated");
});

// ───────────────────────────────────────────────────────────────
// Summary
// ───────────────────────────────────────────────────────────────
console.log(
  `\n[stage1-intelligence] passed=${passed} failed=${failed} total=${passed + failed}`,
);
if (failed > 0) {
  process.exit(1);
}
