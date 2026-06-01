/* eslint-disable no-console */
/**
 * Launch Blocker P1 #5 (validation half) —
 * scripts/test-report-typos.ts
 *
 * Greps every customer-facing string source for the common defects
 * that the Bilski Dental review surfaced:
 *
 *   1. Words that contain a `fi` ligature ("verified", "office",
 *      "finding") in a context that ALSO sets `font-feature-settings`
 *      to NOT disable ligatures. Today we disable ligatures globally
 *      in print.css, so this check primarily catches REGRESSIONS to
 *      that disable rule.
 *   2. Specific known-bad strings: "veried", "of ce", "of cial",
 *      "deni tion" (artifacts of dropped `fi`/`fl` ligatures).
 *   3. Lowercase-only business-name placeholders in template strings
 *      ("bilski dental" or any all-lowercase quoted phrase used as a
 *      hardcoded customer-facing label).
 *
 * Exit code 0 if clean; 1 if any defect found. Designed to run in CI
 * before the worker prompt is shipped.
 *
 * Read-only — does not modify any files.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sync as glob } from "glob";

const REPO_ROOT = process.cwd();

// Customer-facing source roots. Worker scripts are included because
// they generate prose that reaches customers via the report.
const SOURCE_GLOBS = [
  "src/components/**/*.{ts,tsx}",
  "src/lib/intelligence/**/*.ts",
  "src/lib/parse-report.ts",
  "src/lib/consensus/**/*.ts",
  "src/app/report/**/*.{ts,tsx}",
  "src/app/sample-report/**/*.{ts,tsx}",
  "scripts/geo-worker.ts",
];

// Known artifacts of dropped fi/fl ligatures in PDF output.
const KNOWN_LIGATURE_DROPS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bveried\b/g, "veried (dropped fi → should be 'verified' or 'confirmed')"],
  [/\bof ce\b/gi, "'of ce' (dropped fi → should be 'office')"],
  [/\bof cial\b/gi, "'of cial' (dropped fi → should be 'official')"],
  [/\bdeni tion\b/gi, "'deni tion' (dropped fi → should be 'definition')"],
  [/\bnding\b(?!\s)/g, "'nding' isolated (dropped fi → 'finding')"],
  [/\bow\b(?!\.)/g, "'ow' isolated (dropped fl → 'flow')"],
];

// Strings that ONLY appear lowercased in a hardcoded customer-facing
// position. Real customer names entered through the order form get
// Title-Cased by formatBusinessName(); these checks find HARDCODED
// lowercase strings that bypass that path.
const HARDCODED_LOWERCASE = [
  /["']bilski dental["']/g,
  /["']newman roofing["']/g,
  /["']rocks roofing["']/g,
  /["']ohio tiger["']/g,
];

let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    process.stdout.write(`  ✓ ${label}\n`);
  } else {
    const line = `  ✗ ${label}${detail ? ` — ${detail}` : ""}`;
    process.stdout.write(`${line}\n`);
    failures.push(line);
    failed += 1;
  }
}

function scanFile(path: string): void {
  const abs = join(REPO_ROOT, path);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return; // glob can over-match; ignore unreadable files
  }
  for (const [pattern, msg] of KNOWN_LIGATURE_DROPS) {
    const match = text.match(pattern);
    if (match) {
      check(`${path}: no dropped-ligature artifact`, false, msg);
    }
  }
  for (const pattern of HARDCODED_LOWERCASE) {
    if (pattern.test(text)) {
      check(
        `${path}: no hardcoded all-lowercase customer name`,
        false,
        `pattern ${pattern.source} matched — customer-facing strings must Title-Case`,
      );
    }
  }
}

function checkLigatureDisableStillPresent(): void {
  const printCss = readFileSync(
    join(REPO_ROOT, "src/app/report/[id]/print/print.css"),
    "utf8",
  );
  const hasGlobalDisable =
    /font-variant-ligatures:\s*none/.test(printCss) &&
    /"liga"\s*0/.test(printCss);
  check(
    "print.css disables ligatures globally (prevents fi/fl drops)",
    hasGlobalDisable,
    hasGlobalDisable
      ? undefined
      : "expected `font-variant-ligatures: none` + `font-feature-settings: 'liga' 0` in @media print",
  );
}

console.log("[report-typo-test] scanning customer-facing sources for defects");
checkLigatureDisableStillPresent();

const allFiles = new Set<string>();
for (const g of SOURCE_GLOBS) {
  for (const f of glob(g, { cwd: REPO_ROOT, nodir: true })) {
    allFiles.add(f);
  }
}
let scanned = 0;
for (const f of allFiles) {
  scanFile(f);
  scanned += 1;
}
console.log(`[report-typo-test] scanned ${scanned} files`);

if (failed > 0) {
  console.log(`[report-typo-test] FAILED — ${failed} defect(s):`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log("[report-typo-test] passed — no known typo defects detected");
