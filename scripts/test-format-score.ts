/* eslint-disable no-console */
/**
 * scripts/test-format-score.ts
 *
 * Guards the single customer-facing score display authority
 * (src/lib/scoring/format-score.ts) and its adoption. A raw float must
 * never reach a customer surface as "55.5/100".
 *
 *   1. formatDisplayScore behavior: round, clamp, placeholder.
 *   2. Adoption guard: the customer score surfaces (cover, score card,
 *      category cards, admin banner, email) all format through the
 *      helper rather than interpolating a raw number.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatDisplayScore,
  formatDisplayScoreOutOf100,
  SCORE_PLACEHOLDER,
} from "../src/lib/scoring/format-score";

const REPO_ROOT = process.cwd();
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

console.log("[format-score] running...");

check("rounds a float to an integer string", () => {
  assert.equal(formatDisplayScore(55.51866666666667), "56");
  assert.equal(formatDisplayScore(43.4), "43");
  assert.equal(formatDisplayScore(100), "100");
  assert.equal(formatDisplayScore(0), "0");
});

check("clamps out-of-range values to 0..100", () => {
  assert.equal(formatDisplayScore(140), "100");
  assert.equal(formatDisplayScore(-5), "0");
});

check("null / undefined / NaN → placeholder", () => {
  assert.equal(formatDisplayScore(null), SCORE_PLACEHOLDER);
  assert.equal(formatDisplayScore(undefined), SCORE_PLACEHOLDER);
  assert.equal(formatDisplayScore(Number.NaN), SCORE_PLACEHOLDER);
});

check("never emits a decimal point", () => {
  for (const v of [55.5, 12.345, 99.99, 0.4]) {
    assert.ok(!formatDisplayScore(v).includes("."), `float leaked for ${v}`);
  }
});

check("out-of-100 form composes the same integer", () => {
  assert.equal(formatDisplayScoreOutOf100(55.9), "56 / 100");
  assert.equal(formatDisplayScoreOutOf100(null), "— / 100");
});

// ── Adoption guards ─────────────────────────────────────────────────
const ADOPTERS: Array<[string, string]> = [
  ["ReportScoreCard", "src/components/ReportScoreCard.tsx"],
  ["CategoryScoreCard", "src/components/CategoryScoreCard.tsx"],
  ["AuditReportContent (cover)", "src/components/AuditReportContent.tsx"],
  ["AdminReportCard (banner)", "src/components/AdminReportCard.tsx"],
  ["send-report email route", "src/app/api/admin/orders/[id]/send-report/route.ts"],
];

for (const [label, rel] of ADOPTERS) {
  check(`${label} imports + uses formatDisplayScore`, () => {
    const src = readFileSync(join(REPO_ROOT, rel), "utf8");
    assert.match(src, /formatDisplayScore/, `${rel} does not reference the helper`);
    assert.match(src, /scoring\/format-score/, `${rel} does not import the helper`);
  });
}

if (failed > 0) {
  console.log(`[format-score] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[format-score] passed=${passed} failed=0`);
