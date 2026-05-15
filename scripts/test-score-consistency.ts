/* eslint-disable no-console */
/**
 * scripts/test-score-consistency.ts
 *
 *   npm run test:score-consistency
 *
 * Asserts the canonical-overall fix on `parseReportScoreBreakdown`:
 *
 *   1. When the model's declared header agrees with its own sub-score
 *      sum, the parser returns that value unchanged.
 *   2. When the model's declared header DISAGREES with its sub-score
 *      sum (the cmp2ip6q regression), the parser returns the SUM
 *      (canonical), not the declared header.
 *   3. The `declaredOverall` and `rubricSum` fields are exposed for
 *      diagnostics.
 *   4. When one or more sub-scores fail to parse, the parser falls
 *      back to the declared header (defensive — never zero out a
 *      score on a partial parse).
 *   5. Specific regression: littekenplumbing.com with sub-scores
 *      14/8/12/9/8/6 and declared 51 → canonical 57.
 *   6. Band labels match the canonical (not the declared) value.
 *   7. Sum is clamped to [0, 100] (no negative or >100 outputs).
 */

import assert from "node:assert/strict";
import {
  parseReportScoreBreakdown,
  bandLabelForOverall,
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

// A complete rubric breakdown block. Plug different overall headers
// + different sub-scores into `make(...)` for each scenario.
function make(args: {
  declaredOverall: number;
  schema: number;
  crawler: number;
  trust: number;
  content: number;
  brand: number;
  tech: number;
}): string {
  return `# GEO Visibility Report

## 1. AI Visibility Score
**Overall Score: ${args.declaredOverall}/100 — Needs Work**

Breakdown:
- **Structured Data / Schema: ${args.schema}/25** — reason.
- **AI Crawler Readiness: ${args.crawler}/20** — reason.
- **Local Trust Signals: ${args.trust}/20** — reason.
- **Content Depth + FAQ Quality: ${args.content}/15** — reason.
- **Brand / Entity Clarity: ${args.brand}/10** — reason.
- **Technical Accessibility: ${args.tech}/10** — reason.
`;
}

// ── 1. Hero matches sub-score sum ─────────────────────────────────
console.log("\n[1] Hero matches sub-score sum — canonical = declared");
test("declared 57, sum 57 → canonical 57", () => {
  const md = make({ declaredOverall: 57, schema: 14, crawler: 8, trust: 12, content: 9, brand: 8, tech: 6 });
  const s = parseReportScoreBreakdown(md);
  assert.equal(s.overall, 57);
  assert.equal(s.declaredOverall, 57);
  assert.equal(s.rubricSum, 57);
});

// ── 2. Mismatch: declared < sum (the cmp2ip6q regression) ────────
console.log("\n[2] Hero < sub-score sum — canonical wins");
test("declared 51, sum 57 → canonical 57 (NOT 51)", () => {
  const md = make({ declaredOverall: 51, schema: 14, crawler: 8, trust: 12, content: 9, brand: 8, tech: 6 });
  const s = parseReportScoreBreakdown(md);
  assert.equal(s.overall, 57, "canonical should be the sub-score sum");
  assert.equal(s.declaredOverall, 51);
  assert.equal(s.rubricSum, 57);
});

// ── 3. Mismatch: declared > sum (model over-claimed) ──────────────
console.log("\n[3] Hero > sub-score sum — canonical wins");
test("declared 61, sum 57 → canonical 57 (NOT 61, no invalid bonus)", () => {
  const md = make({ declaredOverall: 61, schema: 14, crawler: 8, trust: 12, content: 9, brand: 8, tech: 6 });
  const s = parseReportScoreBreakdown(md);
  assert.equal(s.overall, 57);
  assert.equal(s.declaredOverall, 61);
  assert.equal(s.rubricSum, 57);
});

// ── 4. Defensive fallback: missing sub-score ─────────────────────
console.log("\n[4] Missing sub-score — derived from overall when 5 of 6 parse");
test("5/6 parsed + overall=51 → 6th derived → sum equals overall", () => {
  // Drop the "Technical Accessibility" line entirely so the parser
  // can't find its sub-score from the markdown. The 5-of-6 derived-
  // fill (added 2026-05-15 to kill the customer-facing "— / 100"
  // placeholder) fills tech = 51 - (14+8+12+9+8) = 0, in-range for
  // tech.max=10, so the parser injects it. Canonical sum then
  // equals overall.
  const md = `# GEO Visibility Report
## 1. AI Visibility Score
**Overall Score: 51/100 — Needs Work**
Breakdown:
- **Structured Data / Schema: 14/25** — reason.
- **AI Crawler Readiness: 8/20** — reason.
- **Local Trust Signals: 12/20** — reason.
- **Content Depth + FAQ Quality: 9/15** — reason.
- **Brand / Entity Clarity: 8/10** — reason.
`;
  const s = parseReportScoreBreakdown(md);
  // Canonical now equals declared because 5/6 parsed + 1 derived
  // sums to 51.
  assert.equal(s.overall, 51, "5/6 parsed + 1 derived → canonical sums to declared");
  assert.equal(s.rubricSum, 51, "rubricSum is populated after derived-fill");
  // The derived sub-score is the missing tech category, value 0.
  const tech = s.categories.find((c) => c.key === "tech");
  assert.equal(tech?.score, 0, "missing tech derived as 51 - sum(other 5) = 0");
});

test("2-of-6 missing → both stay null (no over-eager fill)", () => {
  // When more than one sub-score is missing, the derived-fill must
  // NOT attempt to guess — the math has too many unknowns. Both
  // missing categories stay null.
  const md = `# GEO Visibility Report
## 1. AI Visibility Score
**Overall Score: 51/100 — Needs Work**
Breakdown:
- **Structured Data / Schema: 14/25** — reason.
- **AI Crawler Readiness: 8/20** — reason.
- **Local Trust Signals: 12/20** — reason.
- **Content Depth + FAQ Quality: 9/15** — reason.
`;
  const s = parseReportScoreBreakdown(md);
  const brand = s.categories.find((c) => c.key === "brand");
  const tech = s.categories.find((c) => c.key === "tech");
  assert.equal(brand?.score, null, "brand stays null when 2+ are missing");
  assert.equal(tech?.score, null, "tech stays null when 2+ are missing");
  // With 4/6 sub-scores only, rubricSum is null (need all 6).
  assert.equal(s.rubricSum, null);
});

// ── 5. The exact cmp2ip6q regression ─────────────────────────────
console.log("\n[5] cmp2ip6q00005yqfehx9h1d2l regression — littekenplumbing.com");
test("littekenplumbing.com inputs → canonical 57, declared 51", () => {
  // Inputs taken directly from the persisted reportMarkdown.
  const md = make({ declaredOverall: 51, schema: 14, crawler: 8, trust: 12, content: 9, brand: 8, tech: 6 });
  const s = parseReportScoreBreakdown(md);
  assert.equal(s.overall, 57);
  assert.equal(s.declaredOverall, 51);
  assert.equal(s.rubricSum, 57);
  // Band check: 57 ∈ [46, 65] → "Needs Work" (same band as the
  // model's declared 51).
  assert.equal(bandLabelForOverall(s.overall), "Needs Work");
});

// ── 6. Band labels track canonical, not declared ─────────────────
console.log("\n[6] Band derivation uses canonical");
test("declared 28 (At Risk band) but sum 50 (Needs Work) → canonical band 'Needs Work'", () => {
  const md = make({ declaredOverall: 28, schema: 12, crawler: 8, trust: 10, content: 9, brand: 6, tech: 5 });
  const s = parseReportScoreBreakdown(md);
  assert.equal(s.overall, 50);
  assert.equal(bandLabelForOverall(s.overall), "Needs Work");
});

// ── 7. Clamping ─────────────────────────────────────────────────
console.log("\n[7] Sum is clamped to [0, 100]");
test("impossible declared 999 still clamps via the existing limiter", () => {
  // Even if we constructed a max-out scenario, the sum-of-subs would
  // top out at 100 (25+20+20+15+10+10 = 100). Test the clamp on the
  // declared value too.
  const md = `# GEO Visibility Report
## 1. AI Visibility Score
**Overall Score: 999/100 — AI-Ready**
Breakdown:
- **Structured Data / Schema: 25/25** — perfect.
- **AI Crawler Readiness: 20/20** — perfect.
- **Local Trust Signals: 20/20** — perfect.
- **Content Depth + FAQ Quality: 15/15** — perfect.
- **Brand / Entity Clarity: 10/10** — perfect.
- **Technical Accessibility: 10/10** — perfect.
`;
  const s = parseReportScoreBreakdown(md);
  assert.equal(s.overall, 100);
  assert.equal(s.rubricSum, 100);
  // declared was 999 → clamped to 100
  assert.equal(s.declaredOverall, 100);
});

// ── 8. Empty markdown — no crash, all nulls ──────────────────────
console.log("\n[8] Empty markdown safety");
test("empty markdown returns all-null score shape", () => {
  const s = parseReportScoreBreakdown("");
  assert.equal(s.overall, null);
  assert.equal(s.declaredOverall, null);
  assert.equal(s.rubricSum, null);
});

console.log(
  `\n[score-consistency] passed=${passed} failed=${failed} total=${passed + failed}`,
);
if (failed > 0) process.exit(1);
