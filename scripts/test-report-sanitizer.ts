/* eslint-disable no-console */
/**
 * scripts/test-report-sanitizer.ts
 *
 *   npm run test:report-sanitizer
 *
 * Asserts the sanitizer handles every regression we saw on the
 * 2026-05-14 dental + legal batches:
 *
 *   1. Strips chain-of-thought preamble before the report title.
 *   2. Replaces the model-supplied date with the server date.
 *   3. Replaces the literal `<GENERATED_DATE>` placeholder when the
 *      model honors the new prompt.
 *   4. Idempotent on already-clean input.
 *   5. Defensive when no report title is present.
 *   6. Defensive on empty / whitespace input.
 *   7. Generated-year matches the server date.
 *   8. `containsPreambleBeforeTitle` predicate flips false after run.
 */

import assert from "node:assert/strict";
import {
  containsPreambleBeforeTitle,
  extractGeneratedYear,
  sanitizeReportMarkdown,
} from "../src/lib/sanitize-report-markdown";

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

const SERVER_DATE = new Date("2026-05-14T19:30:00Z");
const EXPECTED_DATE_STR = "May 14, 2026";

// A realistic body excerpt — mirrors what the model emits today.
const CLEAN_BODY = `# GEO Visibility Report

**Site:** https://www.example.com/  ·  **Generated:** <GENERATED_DATE>

## 1. AI Visibility Score
**Overall Score: 42/100 — Needs Work**

Breakdown:
- Structured Data / Schema: 8/25 — No JSON-LD on the homepage.

## 6. Technical Appendix
**Scoring Math** — see calibration v2.2 anchors.`;

const PREAMBLE_REAL = `Now I have sufficient evidence from the homepage content, about page, contact page, and what can be verified about the robots.txt situation. Let me compile the findings and produce the report.

**Key findings from fetches:**
- Homepage: Business name ✅, services listed ✅

---

`;

const PREAMBLE_SEARCH = `The search results returned related but different sites. I need to directly fetch the target URL and its robots.txt.

`;

const STALE_DATE_BODY = CLEAN_BODY.replace(
  "<GENERATED_DATE>",
  "May 14, 2025",
);

// ─── 1. Strip preamble before title ──────────────────────────────
console.log("\n[1] Preamble stripping");
test("strips the 'Now I have...' preamble seen on concentra.com", () => {
  const out = sanitizeReportMarkdown(PREAMBLE_REAL + CLEAN_BODY, SERVER_DATE);
  assert.ok(
    out.startsWith("# GEO Visibility Report"),
    "report should start with title",
  );
  assert.ok(!out.includes("Now I have"), "should drop 'Now I have'");
  assert.ok(!out.includes("Let me compile"), "should drop 'Let me compile'");
  assert.ok(!out.includes("Key findings from fetches"), "should drop key-findings preamble");
});
test("strips the 'The search results returned...' preamble seen on midwestdental.com", () => {
  const out = sanitizeReportMarkdown(PREAMBLE_SEARCH + CLEAN_BODY, SERVER_DATE);
  assert.ok(out.startsWith("# GEO Visibility Report"));
  assert.ok(!out.includes("search results"));
  assert.ok(!out.includes("I need to directly fetch"));
});

// ─── 2. Date replacement ─────────────────────────────────────────
console.log("\n[2] Date replacement");
test("replaces the <GENERATED_DATE> placeholder with the server date", () => {
  const out = sanitizeReportMarkdown(CLEAN_BODY, SERVER_DATE);
  assert.ok(
    out.includes(`**Generated:** ${EXPECTED_DATE_STR}`),
    `expected "Generated: ${EXPECTED_DATE_STR}", got:\n${out.slice(0, 200)}`,
  );
  assert.ok(!out.includes("<GENERATED_DATE>"), "placeholder must be gone");
});
test("overwrites a stale model-supplied date (May 14, 2025)", () => {
  const out = sanitizeReportMarkdown(STALE_DATE_BODY, SERVER_DATE);
  assert.ok(out.includes("May 14, 2026"));
  assert.ok(!out.includes("May 14, 2025"));
});
test("overwrites a stale model-supplied date alongside preamble", () => {
  const out = sanitizeReportMarkdown(
    PREAMBLE_REAL + STALE_DATE_BODY,
    SERVER_DATE,
  );
  assert.ok(out.startsWith("# GEO Visibility Report"));
  assert.ok(out.includes("May 14, 2026"));
  assert.ok(!out.includes("May 14, 2025"));
  assert.ok(!out.includes("Now I have"));
});

// ─── 3. Idempotency ───────────────────────────────────────────────
console.log("\n[3] Idempotency");
test("running the sanitizer twice produces the same output", () => {
  const once = sanitizeReportMarkdown(PREAMBLE_REAL + STALE_DATE_BODY, SERVER_DATE);
  const twice = sanitizeReportMarkdown(once, SERVER_DATE);
  assert.equal(twice, once);
});

// ─── 4. Defensive fallbacks ──────────────────────────────────────
console.log("\n[4] Defensive fallbacks");
test("strips leading preamble lines when no report title is present", () => {
  const malformed =
    "Now I have enough evidence.\nLet me write the report.\n\n## 1. AI Visibility Score\nOverall Score: 30/100";
  const out = sanitizeReportMarkdown(malformed, SERVER_DATE);
  assert.ok(!out.startsWith("Now I have"));
  assert.ok(!out.includes("Let me write"));
  assert.ok(out.includes("## 1. AI Visibility Score"));
});
test("returns empty string on empty input", () => {
  assert.equal(sanitizeReportMarkdown("", SERVER_DATE), "");
});
test("returns empty string on whitespace-only input", () => {
  assert.equal(sanitizeReportMarkdown("   \n\n  \t  ", SERVER_DATE), "");
});

// ─── 5. Generated-year invariant ─────────────────────────────────
console.log("\n[5] Generated-year invariant");
test("extracted generated year matches server year on a sanitized report", () => {
  const out = sanitizeReportMarkdown(PREAMBLE_REAL + STALE_DATE_BODY, SERVER_DATE);
  const yr = extractGeneratedYear(out);
  assert.equal(yr, 2026);
});
test("extracted year flips from 2025 → 2026 across the sanitizer", () => {
  const beforeYr = extractGeneratedYear(STALE_DATE_BODY);
  const out = sanitizeReportMarkdown(STALE_DATE_BODY, SERVER_DATE);
  const afterYr = extractGeneratedYear(out);
  assert.equal(beforeYr, 2025);
  assert.equal(afterYr, 2026);
});

// ─── 6. Preamble-predicate sanity ─────────────────────────────────
console.log("\n[6] Preamble predicate");
test("containsPreambleBeforeTitle catches the raw input", () => {
  assert.equal(containsPreambleBeforeTitle(PREAMBLE_REAL + CLEAN_BODY), true);
  assert.equal(containsPreambleBeforeTitle(PREAMBLE_SEARCH + CLEAN_BODY), true);
});
test("containsPreambleBeforeTitle flips false after sanitize", () => {
  const out = sanitizeReportMarkdown(PREAMBLE_REAL + CLEAN_BODY, SERVER_DATE);
  assert.equal(containsPreambleBeforeTitle(out), false);
});
test("containsPreambleBeforeTitle is false on already-clean input", () => {
  assert.equal(containsPreambleBeforeTitle(CLEAN_BODY), false);
});

// ─── 7. Customer-facing first-byte rule ──────────────────────────
console.log("\n[7] First-byte rule");
test("sanitized output's first non-empty line is the report title", () => {
  const out = sanitizeReportMarkdown(PREAMBLE_REAL + CLEAN_BODY, SERVER_DATE);
  const firstLine = out.split(/\r?\n/).find((l) => l.trim().length > 0);
  assert.equal(firstLine, "# GEO Visibility Report");
});

console.log(
  `\n[report-sanitizer] passed=${passed} failed=${failed} total=${passed + failed}`,
);
if (failed > 0) process.exit(1);
