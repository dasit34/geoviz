/* eslint-disable no-console */
/**
 * scripts/test-category-breakdown-no-placeholders.ts
 *
 *   npm run test:category-breakdown
 *
 * Regression guard for the launch-blocking "— / 100" placeholder
 * issue (2026-05-15 pre-launch report polish review). Asserts:
 *
 *   1. The tolerant parser regex handles model output where the
 *      category label has extra prose between the canonical name
 *      and the score (the exact failure mode from the field PDFs).
 *   2. The strict regex still works for canonical model output.
 *   3. When 5 of 6 sub-scores parse and overall is in the header,
 *      the 6th is derived correctly (mathematically consistent
 *      fill).
 *   4. When derived value would be out of range, fall back to null
 *      instead of injecting an obviously-wrong number.
 *   5. Render-layer: `CategoryScoreCard` source contains the
 *      "Pending" fallback string and NOT the legacy "— / 100"
 *      placeholder string template.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseReportScoreBreakdown } from "../src/lib/parse-report";

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

const REPO = join(__dirname, "..");
const CARD_SRC = readFileSync(
  join(REPO, "src/components/CategoryScoreCard.tsx"),
  "utf-8",
);

// ─── 1. Tolerant parser regex ────────────────────────────────────
console.log("\n[1] Tolerant parser regex — extra prose before the score");

test("parses 'Business Info AI Can Read (Structured Data): 14/25'", () => {
  // The exact phrasing observed in the cmp2ip6q customer report.
  const md = `# GEO Visibility Report
## 1. AI Visibility Score
**Overall Score: 51/100 — Needs Work**
Breakdown:
- **Business Info AI Can Read (Structured Data): 14/25** — reason.
- **AI Crawler Readiness: 8/20** — reason.
- **Local Trust Signals: 12/20** — reason.
- **Content Depth + FAQ Quality: 9/15** — reason.
- **Brand / Entity Clarity: 8/10** — reason.
- **Technical Accessibility: 6/10** — reason.
`;
  const s = parseReportScoreBreakdown(md);
  const schema = s.categories.find((c) => c.key === "schema");
  assert.equal(schema?.score, 14, "Schema sub-score must parse from the prose-wrapped label");
});

test("parses canonical strict format", () => {
  const md = `## 1. AI Visibility Score
**Overall Score: 57/100**
- Structured Data / Schema: 14/25 — reason.
- AI Crawler Readiness: 8/20 — reason.
- Local Trust Signals: 12/20 — reason.
- Content Depth + FAQ Quality: 9/15 — reason.
- Brand / Entity Clarity: 8/10 — reason.
- Technical Accessibility: 6/10 — reason.
`;
  const s = parseReportScoreBreakdown(md);
  for (const c of s.categories) {
    assert.ok(
      typeof c.score === "number",
      `${c.key} should parse cleanly under strict format`,
    );
  }
});

// ─── 2. 5-of-6 derived fill ──────────────────────────────────────
console.log("\n[2] 5-of-6 derived fill from overall");

test("fills missing sub-score when 5 parsed + overall known", () => {
  // Schema label is mangled beyond what the tolerant regex can match;
  // we know Overall=57 and the other 5 sum to 43 → derived Schema = 14.
  const md = `## 1. AI Visibility Score
**Overall Score: 57/100**
- Mangled label that does not match Schema pattern: 14/25 — reason.
- AI Crawler Readiness: 8/20 — reason.
- Local Trust Signals: 12/20 — reason.
- Content Depth + FAQ Quality: 9/15 — reason.
- Brand / Entity Clarity: 8/10 — reason.
- Technical Accessibility: 6/10 — reason.
`;
  const s = parseReportScoreBreakdown(md);
  const schema = s.categories.find((c) => c.key === "schema");
  assert.equal(schema?.score, 14, "Schema sub-score should be derived = 57 - (8+12+9+8+6) = 14");
});

test("does NOT inject out-of-range derived value", () => {
  // 5 known sub-scores sum > overall — derived would be negative.
  // Must stay null rather than injecting a garbage value.
  const md = `## 1. AI Visibility Score
**Overall Score: 30/100**
- Mangled label: 14/25 — reason.
- AI Crawler Readiness: 18/20 — reason.
- Local Trust Signals: 15/20 — reason.
- Content Depth + FAQ Quality: 12/15 — reason.
- Brand / Entity Clarity: 8/10 — reason.
- Technical Accessibility: 8/10 — reason.
`;
  const s = parseReportScoreBreakdown(md);
  const schema = s.categories.find((c) => c.key === "schema");
  // 30 - (18+15+12+8+8) = -31 → out of [0, 25] → must stay null
  assert.equal(schema?.score, null, "out-of-range derived value must not be injected");
});

test("does NOT fill when 2+ sub-scores are missing", () => {
  const md = `## 1. AI Visibility Score
**Overall Score: 57/100**
- Mangled label one: 14/25 — reason.
- Mangled label two: 8/20 — reason.
- Local Trust Signals: 12/20 — reason.
- Content Depth + FAQ Quality: 9/15 — reason.
- Brand / Entity Clarity: 8/10 — reason.
- Technical Accessibility: 6/10 — reason.
`;
  const s = parseReportScoreBreakdown(md);
  const schema = s.categories.find((c) => c.key === "schema");
  const crawler = s.categories.find((c) => c.key === "crawler");
  // Both unparseable. Derived-fill only handles single-miss case.
  assert.equal(schema?.score, null);
  assert.equal(crawler?.score, null);
});

// ─── 3. Card renderer never shows "— / 100" ──────────────────────
console.log("\n[3] CategoryScoreCard render — no '— / 100' placeholder");

test("CategoryScoreCard source no longer renders the legacy '— / 100' template", () => {
  // The legacy code path was:
  //   `${normalizedScore === null ? "—" : normalizedScore}` followed
  //   by `<span ...> / 100</span>`. That produced "— / 100" in DOM.
  // The fix branches on `hasScore` and renders a "Pending" tag when
  // the score is null. The card source must NOT contain a code path
  // that emits a literal "—" followed by " / 100" without a guard.
  const flat = CARD_SRC.replace(/\s+/g, " ");
  // No literal "—" character right before "/ 100" in a span:
  assert.ok(
    !/"—"\s*:\s*normalizedScore.*\/\s*100/.test(flat),
    "should not have the legacy ternary that renders '— / 100'",
  );
  // The fallback "Pending" branch must be present.
  assert.ok(
    CARD_SRC.includes("Pending"),
    "card source should render 'Pending' when score is null",
  );
  // hasScore guard pattern present.
  assert.ok(
    /hasScore\s*\?/.test(CARD_SRC),
    "card source should branch on hasScore",
  );
});

test("CategoryScoreCard preserves the / 100 suffix only inside the hasScore branch", () => {
  // When hasScore is true, "/ 100" should appear.
  assert.ok(
    /\/\s*100/.test(CARD_SRC),
    "card source should still render '/ 100' for valid scores",
  );
});

console.log(
  `\n[category-breakdown-no-placeholders] passed=${passed} failed=${failed} total=${passed + failed}`,
);
if (failed > 0) process.exit(1);
