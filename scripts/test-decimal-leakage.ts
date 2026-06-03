/* eslint-disable no-console */
/**
 * scripts/test-decimal-leakage.ts
 *
 * Customer-trust guard: a score must NEVER render with a decimal.
 * "Your AI Visibility Score is 43.5/100" reads as a bug to a paying
 * customer. The deterministic engine keeps full precision in the DB
 * for replay/calibration but `getCanonicalScore` rounds at the display
 * boundary; the legacy markdown parser only ever sums integer rubric
 * cells. This pins both paths so a future refactor can't leak a float
 * to the hero, PDF, email, or admin table.
 *
 * Covers:
 *   1. Deterministic path: fractional category + overall scores round
 *      to integers (overall AND every category).
 *   2. Legacy markdown path: a decimal in the declared header does not
 *      survive — the integer rubric sum wins, and category cells stay
 *      integers.
 *   3. Range sanity: emitted overall is clamped to 0..100.
 */

import assert from "node:assert/strict";

import { parseReportScoreBreakdown } from "../src/lib/parse-report";
import { getCanonicalScore } from "../src/lib/scoring/getCanonicalScore";

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

function isInt(n: number | null): boolean {
  return typeof n === "number" && Number.isInteger(n);
}

console.log("[decimal-leakage] running...");

// ── 1. Deterministic path with fractional precision in the DB row ───
const FRACTIONAL_DETERMINISTIC = {
  scoring_version: "scoring@1.0.0",
  overall_score: 43.6,
  band: "At Risk",
  category_scores: {
    schema: { score: 4.4, max: 25 },
    crawler: { score: 17.9, max: 20 },
    trust: { score: 1.5, max: 20 },
    content: { score: 8.2, max: 15 },
    brand: { score: 2.7, max: 10 },
    tech: { score: 8.9, max: 10 },
  },
  synergy_bonus_applied: 0,
  confidence_level: "moderate",
  top_3_findings: [],
};

check("deterministic overall rounds to an integer", () => {
  const s = getCanonicalScore({
    reportMarkdown: null,
    intelligence: { deterministicScore: FRACTIONAL_DETERMINISTIC },
  });
  assert.equal(isInt(s.overall), true, `overall=${s.overall} is not an integer`);
  assert.equal(s.overall, 44, `expected round(43.6)=44, got ${s.overall}`);
});

check("every deterministic category cell rounds to an integer", () => {
  const s = getCanonicalScore({
    reportMarkdown: null,
    intelligence: { deterministicScore: FRACTIONAL_DETERMINISTIC },
  });
  for (const c of s.categories) {
    assert.equal(
      isInt(c.score),
      true,
      `category ${c.key} score=${c.score} is not an integer`,
    );
  }
});

// ── 2. Legacy markdown path — decimal in the declared header ────────
const MARKDOWN_WITH_DECIMAL_HEADER =
  "## Overall Score\n\n**43.5/100 — At Risk**\n\n" +
  "Structured Data / Schema: 4/25\n" +
  "AI Crawler Readiness: 18/20\n" +
  "Local Trust Signals: 2/20\n" +
  "Content Depth + FAQ Quality: 8/15\n" +
  "Brand / Entity Clarity: 2/10\n" +
  "Technical Accessibility: 9/10\n"; // rubric sum = 43

check("legacy parser overall is an integer (rubric sum wins)", () => {
  const s = parseReportScoreBreakdown(MARKDOWN_WITH_DECIMAL_HEADER);
  assert.equal(isInt(s.overall), true, `overall=${s.overall} is not an integer`);
  assert.equal(s.overall, 43, `expected rubric sum 43, got ${s.overall}`);
});

check("legacy parser category cells are integers", () => {
  const s = parseReportScoreBreakdown(MARKDOWN_WITH_DECIMAL_HEADER);
  for (const c of s.categories) {
    if (c.score === null) continue;
    assert.equal(
      isInt(c.score),
      true,
      `category ${c.key} score=${c.score} is not an integer`,
    );
  }
});

// ── 3. Range sanity ─────────────────────────────────────────────────
check("deterministic overall is clamped to 0..100", () => {
  const s = getCanonicalScore({
    reportMarkdown: null,
    intelligence: { deterministicScore: FRACTIONAL_DETERMINISTIC },
  });
  assert.equal(
    s.overall !== null && s.overall >= 0 && s.overall <= 100,
    true,
    `overall=${s.overall} out of range`,
  );
});

if (failed > 0) {
  console.log(`[decimal-leakage] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[decimal-leakage] passed=${passed} failed=0`);
