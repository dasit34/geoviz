/**
 * Observation history — append-only persistence layer.
 *
 * Three surfaces:
 *
 *   buildObservationHistoryRow(args)        — pure builder; no I/O
 *   writeObservationHistory(prisma, row)    — single Prisma create
 *   getObservationHistorySummary(prisma)    — read-only aggregate
 *
 * Stamps the deterministic scoring hashes (`weightHash`,
 * `categoryHash`, `scoringVersion`) on every row at write time so
 * an analyst can prove scoring was unchanged when the row was
 * written.
 *
 * Append-only is enforced at the application layer — there is no
 * update or upsert path on this module.
 */

import { Prisma, PrismaClient } from "@prisma/client";

import { CATEGORY_HASH, WEIGHT_HASH } from "@/lib/scoring/frozen";
import { SCORING_VERSION } from "@/lib/scoring/version";

import type {
  ObservationHealth,
  ObservationProviderId,
  ObservationStatus,
  ObservationSummary,
} from "../types";

/**
 * Row payload — matches the Prisma model 1:1 except `id` (Prisma
 * generates it via `@default(cuid())`) and `createdAt` (DB default).
 */
export type ObservationHistoryRow = {
  auditId: string;
  providerCount: number;
  agreementScore: number;
  variance: number;
  observationStatus: ObservationStatus;
  providerNames: ObservationProviderId[];
  estimatedCost: number;
  avgLatency: number;
  scoringVersion: string;
  weightHash: string;
  categoryHash: string;
};

export type ObservationHistorySummary = {
  audit_count: number;
  avg_agreement: number | null;
  suppressed_pct: number | null;
  single_provider_pct: number | null;
  estimated_observation_cost_total: number;
  estimated_observation_cost_per_audit: number | null;
  scoring_weight_hash: string;
  scoring_category_hash: string;
  scoring_unchanged: boolean;
  computed_at: string;
};

/**
 * Pure builder. Same `(auditId, summary, health)` triple ⇒ same row.
 *
 * Stamps `scoringVersion` + `weightHash` + `categoryHash` from
 * `frozen.ts` so the row carries freeze-contract evidence.
 */
export function buildObservationHistoryRow(args: {
  auditId: string;
  summary: ObservationSummary;
  health: ObservationHealth;
}): ObservationHistoryRow {
  const { auditId, summary, health } = args;
  return {
    auditId,
    providerCount: summary.providers_run.length,
    agreementScore: summary.agreement_score,
    variance: health.variance,
    observationStatus: health.status,
    providerNames: [...summary.providers_run],
    estimatedCost: summary.estimated_cost_usd,
    avgLatency: summary.avg_latency_ms,
    scoringVersion: SCORING_VERSION,
    weightHash: WEIGHT_HASH,
    categoryHash: CATEGORY_HASH,
  };
}

/**
 * Single Prisma `create`. Append-only — no upsert, no update.
 * Returns the generated `id`.
 *
 * Caller is expected to wrap this in a try/catch where appropriate.
 * The function does NOT swallow Prisma errors.
 */
export async function writeObservationHistory(args: {
  prisma: PrismaClient | Prisma.TransactionClient;
  row: ObservationHistoryRow;
}): Promise<{ id: string }> {
  const created = await args.prisma.observationHistory.create({
    data: {
      auditId: args.row.auditId,
      providerCount: args.row.providerCount,
      agreementScore: args.row.agreementScore,
      variance: args.row.variance,
      observationStatus: args.row.observationStatus,
      providerNames:
        args.row.providerNames as unknown as Prisma.InputJsonValue,
      estimatedCost: new Prisma.Decimal(args.row.estimatedCost.toFixed(6)),
      avgLatency: args.row.avgLatency,
      scoringVersion: args.row.scoringVersion,
      weightHash: args.row.weightHash,
      categoryHash: args.row.categoryHash,
    },
    select: { id: true },
  });
  return { id: created.id };
}

/**
 * Read-only aggregate over the history table. Used by the
 * `observation:summary` CLI + future admin dashboards.
 */
export async function getObservationHistorySummary(args?: {
  prisma?: PrismaClient;
  lastN?: number;
}): Promise<ObservationHistorySummary> {
  const prisma = args?.prisma ?? new PrismaClient();
  const ownsClient = !args?.prisma;
  const take = args?.lastN ?? 1000;

  try {
    const rows = await prisma.observationHistory.findMany({
      orderBy: { createdAt: "desc" },
      take,
      select: {
        agreementScore: true,
        observationStatus: true,
        estimatedCost: true,
        weightHash: true,
        categoryHash: true,
      },
    });

    if (rows.length === 0) {
      return {
        audit_count: 0,
        avg_agreement: null,
        suppressed_pct: null,
        single_provider_pct: null,
        estimated_observation_cost_total: 0,
        estimated_observation_cost_per_audit: null,
        scoring_weight_hash: WEIGHT_HASH,
        scoring_category_hash: CATEGORY_HASH,
        scoring_unchanged: true,
        computed_at: new Date().toISOString(),
      };
    }

    const avgAgreement =
      rows.reduce((s, r) => s + r.agreementScore, 0) / rows.length;

    const suppressedCount = rows.filter(
      (r) =>
        r.observationStatus === "SUPPRESSED" ||
        r.observationStatus === "DISAGREE",
    ).length;
    const singleProviderCount = rows.filter(
      (r) => r.observationStatus === "SINGLE_PROVIDER",
    ).length;

    const costs = rows.map((r) => {
      const v = r.estimatedCost;
      if (typeof v === "number") return v;
      const asObj = v as { toNumber?: () => number };
      return typeof asObj.toNumber === "function"
        ? asObj.toNumber()
        : Number(v);
    });
    const costTotal = costs.reduce((a, b) => a + b, 0);

    const distinctHashes = new Set(rows.map((r) => r.weightHash));
    const scoringUnchanged = distinctHashes.size === 1;

    return {
      audit_count: rows.length,
      avg_agreement: avgAgreement,
      suppressed_pct: (suppressedCount / rows.length) * 100,
      single_provider_pct: (singleProviderCount / rows.length) * 100,
      estimated_observation_cost_total: costTotal,
      estimated_observation_cost_per_audit: costTotal / rows.length,
      scoring_weight_hash: WEIGHT_HASH,
      scoring_category_hash: CATEGORY_HASH,
      scoring_unchanged: scoringUnchanged,
      computed_at: new Date().toISOString(),
    };
  } finally {
    if (ownsClient) await prisma.$disconnect();
  }
}
