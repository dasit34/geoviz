/* eslint-disable no-console */
/**
 * scripts/run-no-db-tests.ts — `npm run test:no-db`
 *
 * Runs every test script that needs no database, with DATABASE_URL forced
 * to the `.invalid` no-database sentinel for each child process. Even if
 * one of these scripts unexpectedly reached Prisma, the connection could
 * not resolve — so this runner is safe regardless of what `.env` points
 * at. DB-backed tests (test-review-auth, test-business-linking,
 * test-prepare-for-outreach*, test-market-study-automation-idempotency,
 * test-worker-recovery, test-checkout-audit-creation, …) are deliberately
 * NOT listed; run them only against a non-production database.
 */
// Deliberately NOT guarded: this runner never touches a database itself,
// and every child it spawns gets the no-database sentinel (the children
// still carry their own guards).
import { spawnSync } from "node:child_process";

import { NO_DATABASE_SENTINEL_URL } from "../src/lib/safety/database-target";

const NO_DB_TESTS = [
  // report-quality suite (everything except the DB-backed test-review-auth)
  "test-score-source-parity",
  "test-report-payload-parity",
  "test-decimal-leakage",
  "test-format-score",
  "test-business-name-resolution",
  "test-fabrication-guard",
  "test-missing-providers",
  "test-score-explainer",
  "test-category-label-wrap",
  "test-report-redesign",
  "test-report-model",
  "test-report-document",
  "test-report-providers",
  "test-report-consistency",
  "test-customer-questions",
  "test-model-testing",
  "test-api-key",
  "test-payload-hash-parity",
  "test-eyebrow-consistency",
  "test-report-typos",
  "test-admin-auth",
  "test-category-breakdown-no-placeholders",
  "test-cross-model-ui-render",
  "test-consensus",
  // scoring / comparison / monitoring-foundation
  "test-deterministic-scoring",
  "test-frozen-hash",
  "test-audit-comparison",
  "test-database-target",
  // market study / competitive (pure)
  "test-market-study-automation-rotation",
  "test-market-study-automation-summary",
  "test-competitive-metrics",
  "test-normalize-domain",
  // subscription monitoring (in-memory fakes, no DB / no Stripe)
  "test-monitoring-checkout",
  "test-monitoring-webhook",
  "test-monitoring-access",
  "test-monitoring-scheduler",
  "test-monitoring-cancellation",
  "test-monitoring-token-and-reaudit",
  // visibility tracking v1
  "test-tracking-prompts-competitors",
  "test-tracking-normalize",
  "test-tracking-metrics",
  "test-tracking-cycle",
];

// `--only <substring>` narrows the run (e.g. `npm run test:monitoring`).
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : undefined;
const selected = only ? NO_DB_TESTS.filter((n) => n.includes(only)) : NO_DB_TESTS;

const results: Array<{ name: string; ok: boolean }> = [];
for (const name of selected) {
  const r = spawnSync("npx", ["tsx", `scripts/${name}.ts`], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: NO_DATABASE_SENTINEL_URL },
  });
  results.push({ name, ok: r.status === 0 });
}

const failedNames = results.filter((r) => !r.ok).map((r) => r.name);
console.log(`\n[test:no-db] ${results.length - failedNames.length}/${results.length} passed`);
if (failedNames.length > 0) {
  console.log(`[test:no-db] failed: ${failedNames.join(", ")}`);
  process.exit(1);
}
