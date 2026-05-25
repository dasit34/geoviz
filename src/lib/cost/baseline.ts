/**
 * Cost baseline — programmatic JSON aggregator.
 *
 * Aggregates per-audit cost across the last N audits, broken down
 * by source so a future component (e.g. external crawl service or
 * managed render API) has an explicit slot. Today the only non-zero
 * source is `llm_cost` (Anthropic Messages API); preflight + render
 * are local to the Railway worker and do not incur per-call charges.
 *
 * Target: median ≤ $0.30 per audit. Reports a green/yellow/red
 * traffic-light so operators can spot regressions instantly.
 *
 * Read-only — safe to call against production.
 */

import { PrismaClient } from "@prisma/client";

export type CostBreakdown = {
  /** Preflight HTML fetch — $0 today (Node fetch on the worker). */
  crawl_cost: number;
  /** Headless render — $0 today (puppeteer-core + Chromium local). */
  render_cost: number;
  /** Anthropic Messages API — from `AuditOrder.estimatedCostUsd`. */
  llm_cost: number;
  total_cost: number;
};

export type CostBaselineReport = {
  sample_size: number;
  cost_per_audit: {
    mean: number;
    median: number;
    p90: number;
    p95: number;
  };
  /** Mean of each component across the sample. */
  breakdown_per_audit: CostBreakdown;
  target_median_usd: 0.3;
  target_status: "green" | "yellow" | "red";
  computed_at: string;
};

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(p * (sorted.length - 1))),
  );
  return sorted[idx];
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const TARGET_MEDIAN: 0.3 = 0.3;

function trafficLight(medianUsd: number): "green" | "yellow" | "red" {
  if (medianUsd <= TARGET_MEDIAN) return "green";
  if (medianUsd <= TARGET_MEDIAN * 1.5) return "yellow";
  return "red";
}

export async function costBaseline(args?: {
  prisma?: PrismaClient;
  /** Default 100; matches the sample size used by `intelligence:cost`. */
  lastN?: number;
}): Promise<CostBaselineReport> {
  const prisma = args?.prisma ?? new PrismaClient();
  const ownsClient = !args?.prisma;
  const take = args?.lastN ?? 100;

  try {
    const rows = await prisma.auditOrder.findMany({
      where: { estimatedCostUsd: { not: null } },
      orderBy: { reportGeneratedAt: "desc" },
      take,
      select: { estimatedCostUsd: true },
    });

    if (rows.length === 0) {
      return {
        sample_size: 0,
        cost_per_audit: { mean: 0, median: 0, p90: 0, p95: 0 },
        breakdown_per_audit: {
          crawl_cost: 0,
          render_cost: 0,
          llm_cost: 0,
          total_cost: 0,
        },
        target_median_usd: TARGET_MEDIAN,
        target_status: "green",
        computed_at: new Date().toISOString(),
      };
    }

    // Prisma Decimal → number. Use `.toNumber()` when available;
    // otherwise rely on the implicit coercion via Number().
    const llmCosts = rows.map((r) => {
      const v = r.estimatedCostUsd;
      if (v === null) return 0;
      if (typeof v === "number") return v;
      const asObj = v as { toNumber?: () => number };
      return typeof asObj.toNumber === "function"
        ? asObj.toNumber()
        : Number(v);
    });

    // Today only the LLM line carries cost. Other slots are reserved.
    const crawlCosts = rows.map(() => 0);
    const renderCosts = rows.map(() => 0);
    const totals = llmCosts.map(
      (llm, i) => llm + crawlCosts[i] + renderCosts[i],
    );

    const medianUsd = percentile(totals, 0.5);

    return {
      sample_size: rows.length,
      cost_per_audit: {
        mean: mean(totals),
        median: medianUsd,
        p90: percentile(totals, 0.9),
        p95: percentile(totals, 0.95),
      },
      breakdown_per_audit: {
        crawl_cost: mean(crawlCosts),
        render_cost: mean(renderCosts),
        llm_cost: mean(llmCosts),
        total_cost: mean(totals),
      },
      target_median_usd: TARGET_MEDIAN,
      target_status: trafficLight(medianUsd),
      computed_at: new Date().toISOString(),
    };
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}
