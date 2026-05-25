/* eslint-disable no-console */
/**
 * scripts/cost-baseline.ts
 *
 * Prints the per-audit cost baseline + a traffic-light vs the
 * $0.30 median target. Read-only — pulls `AuditOrder.estimatedCostUsd`
 * from production and aggregates.
 *
 *   npm run cost:baseline
 *   npm run cost:baseline -- --json
 */

import "dotenv/config";

import { costBaseline } from "../src/lib/cost/baseline";

const JSON_MODE = process.argv.includes("--json");

function fmt(n: number): string {
  return `$${n.toFixed(4)}`;
}

function trafficLightEmoji(status: "green" | "yellow" | "red"): string {
  if (status === "green") return "🟢";
  if (status === "yellow") return "🟡";
  return "🔴";
}

async function main(): Promise<void> {
  const report = await costBaseline();

  if (JSON_MODE) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("[cost-baseline] computed", report.computed_at);
  console.log("");
  console.log(`  sample_size:       ${report.sample_size} audits`);
  console.log("");
  console.log("  cost_per_audit:");
  console.log(`    mean:            ${fmt(report.cost_per_audit.mean)}`);
  console.log(`    median:          ${fmt(report.cost_per_audit.median)}`);
  console.log(`    p90:             ${fmt(report.cost_per_audit.p90)}`);
  console.log(`    p95:             ${fmt(report.cost_per_audit.p95)}`);
  console.log("");
  console.log("  breakdown_per_audit (mean):");
  console.log(`    crawl_cost:      ${fmt(report.breakdown_per_audit.crawl_cost)}`);
  console.log(`    render_cost:     ${fmt(report.breakdown_per_audit.render_cost)}`);
  console.log(`    llm_cost:        ${fmt(report.breakdown_per_audit.llm_cost)}`);
  console.log(`    total_cost:      ${fmt(report.breakdown_per_audit.total_cost)}`);
  console.log("");
  console.log(
    `  ${trafficLightEmoji(report.target_status)} median ${fmt(report.cost_per_audit.median)} vs target ${fmt(report.target_median_usd)} — ${report.target_status.toUpperCase()}`,
  );
}

main().catch((err) => {
  console.error("[cost-baseline] error:", err);
  process.exitCode = 1;
});
