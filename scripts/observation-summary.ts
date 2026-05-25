/* eslint-disable no-console */
/**
 * scripts/observation-summary.ts
 *
 * Read-only aggregate over the `ObservationHistory` table.
 * Prints the brief's table by default; `--json` for programmatic
 * consumers (dashboards, alerts, scheduled reports).
 *
 *   npm run observation:summary
 *   npm run observation:summary -- --json
 *
 * Safe against production — every query is read-only.
 */

import "dotenv/config";

import { getObservationHistorySummary } from "../src/lib/observations";

const JSON_MODE = process.argv.includes("--json");

function fmtPct(n: number | null): string {
  if (n === null) return "n/a";
  return `${n.toFixed(1)}%`;
}

function fmtCost(n: number | null): string {
  if (n === null) return "$0.0000";
  return `$${n.toFixed(4)}`;
}

function fmtAvg(n: number | null): string {
  if (n === null) return "n/a";
  return n.toFixed(1);
}

async function main(): Promise<void> {
  const summary = await getObservationHistorySummary();

  if (JSON_MODE) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log(`[observation:summary] computed ${summary.computed_at}`);
  console.log("");
  console.log(`  audit_count:                          ${summary.audit_count}`);
  console.log(
    `  avg_agreement:                        ${fmtAvg(summary.avg_agreement)}`,
  );
  console.log(
    `  suppressed_pct:                       ${fmtPct(summary.suppressed_pct)}`,
  );
  console.log(
    `  single_provider_pct:                  ${fmtPct(summary.single_provider_pct)}`,
  );
  console.log(
    `  estimated_observation_cost (total):   ${fmtCost(summary.estimated_observation_cost_total)}`,
  );
  console.log(
    `  estimated_observation_cost / audit:   ${fmtCost(summary.estimated_observation_cost_per_audit)}`,
  );
  console.log("");
  console.log(
    `  scoring_unchanged:                    ${summary.scoring_unchanged ? "✓ YES" : "✗ NO"}`,
  );
  console.log(`  scoring_weight_hash:                  ${summary.scoring_weight_hash}`);
  console.log(`  scoring_category_hash:                ${summary.scoring_category_hash}`);
}

main().catch((err) => {
  console.error("[observation:summary] error:", err);
  process.exitCode = 1;
});
