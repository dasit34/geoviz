/* eslint-disable no-console */
/**
 * scripts/test-category-label-wrap.ts
 *
 * Regression guard for the "Recommendati / on Ready" mid-word split in
 * the PDF category cards. Root cause was `overflow-wrap: anywhere` (and
 * a conflicting `word-break: keep-all` block) winning the cascade for
 * `.category-score-label` in the print @media block.
 *
 * This pins the print CSS contract:
 *   - `.category-score-label` is NOT in any `overflow-wrap: anywhere`
 *     selector group;
 *   - exactly one authoritative print rule sets `overflow-wrap: normal`
 *     + `word-break: keep-all` (break only at the space, never mid-word);
 *   - the rubric-weight chip drops to its own line in print.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

// Strip CSS comments first — a comment that mentions a class name
// would otherwise get bundled into the next rule's selector by the
// naive brace split below and trip a false positive.
const css = readFileSync(
  join(REPO_ROOT, "src/app/report/[id]/print/print.css"),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

console.log("[category-label-wrap] running...");

check("no `overflow-wrap: anywhere` selector targets .category-score-label", () => {
  // Scan each rule block; any block whose selector list includes
  // .category-score-label must NOT declare overflow-wrap: anywhere.
  const blocks = css.split("}");
  for (const block of blocks) {
    const brace = block.indexOf("{");
    if (brace === -1) continue;
    const selector = block.slice(0, brace);
    const body = block.slice(brace + 1);
    if (/\.category-score-label\b/.test(selector)) {
      assert.ok(
        !/overflow-wrap:\s*anywhere/i.test(body),
        `a rule on "${selector.trim().slice(0, 60)}" sets overflow-wrap: anywhere`,
      );
    }
  }
});

check("authoritative print rule locks normal + keep-all (no mid-word break)", () => {
  assert.match(
    css,
    /\.category-score-label\s*\{[^}]*overflow-wrap:\s*normal\s*!important;[^}]*word-break:\s*keep-all\s*!important/,
    "expected the authoritative .category-score-label rule with normal + keep-all",
  );
});

check("rubric-weight chip drops to its own line in print", () => {
  assert.match(
    css,
    /\.category-score-label\s+\.category-score-weight\s*\{[^}]*display:\s*block\s*!important/,
    "expected the weight chip to be display:block in print",
  );
});

if (failed > 0) {
  console.log(`[category-label-wrap] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[category-label-wrap] passed=${passed} failed=0`);
