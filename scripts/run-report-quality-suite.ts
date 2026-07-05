/* eslint-disable no-console */
/**
 * scripts/run-report-quality-suite.ts
 *
 * Runs every sub-script in the report-quality suite and always executes
 * all of them, regardless of individual failures — replaces the old
 * `&&`-chained `test:report-quality` npm script, which stopped at the
 * first failing script and silently skipped everything after it
 * (this masked 12 scripts, including test:admin-auth and test:consensus,
 * behind a single stale assertion in test-report-document.ts).
 *
 * Reuses the accumulate-then-exit pattern already used inside individual
 * test scripts (see scripts/verify-system.ts's step()/record() helpers)
 * at the suite level instead of just the per-script level.
 */

import { spawnSync } from "node:child_process";

// Exact order previously encoded in package.json's `&&` chain.
const SCRIPTS = [
  "scripts/test-score-source-parity.ts",
  "scripts/test-report-payload-parity.ts",
  "scripts/test-decimal-leakage.ts",
  "scripts/test-format-score.ts",
  "scripts/test-business-name-resolution.ts",
  "scripts/test-fabrication-guard.ts",
  "scripts/test-missing-providers.ts",
  "scripts/test-score-explainer.ts",
  "scripts/test-category-label-wrap.ts",
  "scripts/test-report-redesign.ts",
  "scripts/test-report-model.ts",
  "scripts/test-report-document.ts",
  "scripts/test-report-providers.ts",
  "scripts/test-report-consistency.ts",
  "scripts/test-customer-questions.ts",
  "scripts/test-model-testing.ts",
  "scripts/test-api-key.ts",
  "scripts/test-payload-hash-parity.ts",
  "scripts/test-eyebrow-consistency.ts",
  "scripts/test-report-typos.ts",
  "scripts/test-admin-auth.ts",
  "scripts/test-review-auth.ts",
  "scripts/test-category-breakdown-no-placeholders.ts",
  "scripts/test-cross-model-ui-render.ts",
  "scripts/test-consensus.ts",
];

interface Result {
  script: string;
  ok: boolean;
  durationMs: number;
}

const results: Result[] = [];

console.log(`[report-quality-suite] running ${SCRIPTS.length} scripts...\n`);

for (const script of SCRIPTS) {
  const startedAt = Date.now();
  const proc = spawnSync("npx", ["tsx", script], {
    stdio: "inherit",
    env: process.env,
  });
  const durationMs = Date.now() - startedAt;
  const ok = proc.status === 0;
  results.push({ script, ok, durationMs });
  console.log(""); // spacing between sub-script output blocks
}

const failedResults = results.filter((r) => !r.ok);

console.log("═".repeat(60));
console.log("[report-quality-suite] summary");
console.log("═".repeat(60));
for (const r of results) {
  const mark = r.ok ? "✓" : "✗";
  console.log(`  ${mark} ${r.script} (${r.durationMs}ms)`);
}
console.log("═".repeat(60));
console.log(
  `[report-quality-suite] ${results.length - failedResults.length}/${results.length} passed`,
);

if (failedResults.length > 0) {
  console.log(
    `[report-quality-suite] FAILED — ${failedResults.length} script(s) failed:`,
  );
  for (const r of failedResults) console.log(`  ✗ ${r.script}`);
  process.exit(1);
}

console.log("[report-quality-suite] all scripts passed");
process.exit(0);
