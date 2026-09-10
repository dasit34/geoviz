import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";

/**
 * Conservative fallback per-audit cost when there's no recent
 * telemetry to average. Real audits land ~$0.10–0.18 for the primary
 * generation call (see COST_AND_USAGE_TRACKING.md); the validator
 * provider calls (OpenAI / Gemini / Perplexity) add a small amount
 * that isn't captured in `estimatedCostUsd`.
 */
export const MARKET_STUDY_FALLBACK_PER_AUDIT_USD = 0.15;

export type BatchCostEstimate = {
  count: number;
  perAuditUsd: number;
  totalUsd: number;
  /** Human-readable explanation of where `perAuditUsd` came from. */
  basis: string;
};

/**
 * Estimate the cost of queuing `count` market-study audits. Averages
 * `AuditOrder.estimatedCostUsd` over completed audits in the last 30
 * days; falls back to a static per-audit figure when there's no data.
 * Covers the primary generation call only.
 */
export async function estimateBatchCost(
  count: number,
  prisma: PrismaClient = defaultPrisma,
): Promise<BatchCostEstimate> {
  const safeCount = Math.max(0, Math.floor(count));
  let perAuditUsd = MARKET_STUDY_FALLBACK_PER_AUDIT_USD;
  let basis = `static estimate (~$${MARKET_STUDY_FALLBACK_PER_AUDIT_USD.toFixed(2)}/audit — no recent telemetry)`;

  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const agg = await prisma.auditOrder.aggregate({
      _avg: { estimatedCostUsd: true },
      _count: { estimatedCostUsd: true },
      where: {
        reportStatus: "generated",
        estimatedCostUsd: { not: null },
        createdAt: { gte: since },
      },
    });
    const avg = agg._avg.estimatedCostUsd;
    const n = agg._count.estimatedCostUsd;
    if (avg != null && n > 0) {
      perAuditUsd = Number(avg);
      basis = `average of ${n} audit${n === 1 ? "" : "s"} in the last 30 days`;
    }
  } catch {
    // Fail-soft — a cost estimate must never block the preview.
  }

  return {
    count: safeCount,
    perAuditUsd: round2(perAuditUsd),
    totalUsd: round2(perAuditUsd * safeCount),
    basis,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
