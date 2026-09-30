/**
 * Calibration Engine — before/after chaining for repeat audits of the
 * same business.
 *
 * Reuses the exact `websiteUrl`-equality convention already
 * load-bearing elsewhere in this codebase (see
 * `src/lib/audit-intelligence.ts`'s `score_stability_index` history
 * query). No `businessId` FK is introduced — consistent with this
 * repo's own stated avoidance of premature abstraction
 * (`docs/DO_NOT_BUILD_YET.md`'s Agency Platform / Enterprise entries
 * make the identical point about RBAC).
 *
 * Pure functions — no I/O. Callers fetch via
 * `prisma.auditOrder.findMany({ where: { websiteUrl }, orderBy: { createdAt: "asc" }, include: { intelligence: true } })`
 * and pass the result in.
 */

import type { CategoryKey, DeterministicScore } from "@/lib/scoring/types";

export type AuditChainEntry = {
  auditOrderId: string;
  createdAt: string;
  overallScore: number | null;
  categoryScores: Partial<Record<CategoryKey, number>> | null;
};

export type ChainDelta = {
  fromAuditOrderId: string;
  toAuditOrderId: string;
  overallDelta: number | null;
  categoryDeltas: Partial<Record<CategoryKey, number>> | null;
  elapsedMs: number;
};

type SourceOrder = {
  id: string;
  createdAt: Date;
  intelligence: {
    overallScore: number | null;
    deterministicScore: unknown;
  } | null;
};

function isDeterministicScore(v: unknown): v is DeterministicScore {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.overall_score === "number" &&
    typeof obj.scoring_version === "string"
  );
}

/** Sorts ascending by `createdAt` — the chronological chain for one business. */
export function buildAuditChain(
  orders: ReadonlyArray<SourceOrder>,
): AuditChainEntry[] {
  return [...orders]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((o) => {
      const det = isDeterministicScore(o.intelligence?.deterministicScore)
        ? o.intelligence!.deterministicScore
        : null;
      const categoryScores: Partial<Record<CategoryKey, number>> | null = det
        ? (Object.fromEntries(
            Object.entries(det.category_scores).map(([k, v]) => [k, v.score]),
          ) as Partial<Record<CategoryKey, number>>)
        : null;
      return {
        auditOrderId: o.id,
        createdAt: o.createdAt.toISOString(),
        overallScore: o.intelligence?.overallScore ?? null,
        categoryScores,
      };
    });
}

/** Consecutive-pair deltas across an already-built chain. */
export function computeChainDeltas(chain: AuditChainEntry[]): ChainDelta[] {
  const deltas: ChainDelta[] = [];
  for (let i = 1; i < chain.length; i++) {
    const prev = chain[i - 1];
    const curr = chain[i];

    const overallDelta =
      prev.overallScore !== null && curr.overallScore !== null
        ? curr.overallScore - prev.overallScore
        : null;

    let categoryDeltas: Partial<Record<CategoryKey, number>> | null = null;
    if (prev.categoryScores && curr.categoryScores) {
      categoryDeltas = {};
      for (const key of Object.keys(curr.categoryScores) as CategoryKey[]) {
        const p = prev.categoryScores[key];
        const c = curr.categoryScores[key];
        if (typeof p === "number" && typeof c === "number") {
          categoryDeltas[key] = c - p;
        }
      }
    }

    deltas.push({
      fromAuditOrderId: prev.auditOrderId,
      toAuditOrderId: curr.auditOrderId,
      overallDelta,
      categoryDeltas,
      elapsedMs:
        new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime(),
    });
  }
  return deltas;
}
