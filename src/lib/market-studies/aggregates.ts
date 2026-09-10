import { bandFor } from "@/lib/scoring/bands";
import {
  CATEGORY_MAX,
  type CategoryKey,
  type DeterministicScore,
} from "@/lib/scoring/types";
import { percentile } from "@/lib/utils/percentile";

import { findingLabel } from "./findingLabels";
import type {
  ScoreBandBucket,
  StudyAggregate,
  StudyAuditRow,
  TopFinding,
} from "./types";

/**
 * Tally `top_3_findings[].id` occurrences across a set of scored rows,
 * ranked descending. Same shape/behavior as the identically-named
 * helper in `src/lib/scoring/calibration-summary.ts`; kept local here
 * so the market-study aggregator has no cross-module dependency for
 * one small pure loop.
 */
export function countFindingFrequency(
  rows: ReadonlyArray<{ score: DeterministicScore }>,
  opts?: { limit?: number },
): Array<{ id: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    for (const f of r.score.top_3_findings) {
      counts[f.id] = (counts[f.id] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, opts?.limit ?? 10);
}

/**
 * Minimum completed audits before study aggregates are considered
 * meaningful. Below this the detail page shows "collecting data".
 * Deliberately low (3) — an operator wants a directional read early;
 * the customer-facing cohort gate (15) does not apply to an internal
 * operator study.
 */
export const MIN_STUDY_AUDITS = 3;

/** The five frozen score bands, low → high (see `src/lib/scoring/bands.ts`). */
const BAND_ORDER = [
  "Invisible",
  "At Risk",
  "Needs Work",
  "Competitive",
  "AI-Ready",
] as const;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Compute the aggregate metrics for one market study from REAL audit
 * data only. Pure — the route builds `rows` from
 * `MarketStudyEntry → AuditIntelligence`.
 *
 * Legacy audits (no `deterministicScore`) still count toward
 * avg/median/min/max/distribution via their `overallScore`, but are
 * excluded from the finding-frequency and per-category rollups (they
 * have no stable finding ids) and surfaced separately as `legacyCount`.
 */
export function computeStudyAggregate(
  rows: ReadonlyArray<StudyAuditRow>,
): StudyAggregate {
  const scored = rows.filter(
    (r): r is StudyAuditRow & { overallScore: number } =>
      typeof r.overallScore === "number" && Number.isFinite(r.overallScore),
  );
  const overallScores = scored.map((r) => r.overallScore);
  const deterministicRows = scored.filter(
    (r): r is StudyAuditRow & { overallScore: number; deterministicScore: NonNullable<StudyAuditRow["deterministicScore"]> } =>
      r.deterministicScore != null,
  );

  const auditedCount = scored.length;
  const legacyCount = auditedCount - deterministicRows.length;

  // ── Score distribution across the five frozen bands ──
  const bandCounts: Record<string, number> = Object.fromEntries(
    BAND_ORDER.map((b) => [b, 0]),
  );
  for (const s of overallScores) bandCounts[bandFor(s)] += 1;
  const scoreDistribution: ScoreBandBucket[] = BAND_ORDER.map((band) => ({
    band,
    count: bandCounts[band],
    pct: auditedCount > 0 ? round1((bandCounts[band] / auditedCount) * 100) : 0,
  }));

  // ── Per-category averages (0–100), deterministic rows only ──
  const categoryPct: Partial<Record<CategoryKey, number[]>> = {};
  for (const r of deterministicRows) {
    for (const [key, cat] of Object.entries(
      r.deterministicScore.category_scores,
    ) as Array<[CategoryKey, { score: number; max: number }]>) {
      const max = cat.max > 0 ? cat.max : CATEGORY_MAX[key];
      if (!max) continue;
      (categoryPct[key] ??= []).push((cat.score / max) * 100);
    }
  }
  const categoryAverages: Partial<Record<CategoryKey, number>> = {};
  for (const [key, vals] of Object.entries(categoryPct) as Array<
    [CategoryKey, number[]]
  >) {
    const m = mean(vals);
    if (m != null) categoryAverages[key] = round1(m);
  }

  // ── Top recurring findings + % of businesses affected ──
  const freq = countFindingFrequency(
    deterministicRows.map((r) => ({ score: r.deterministicScore })),
    { limit: 8 },
  );
  const topFindings: TopFinding[] = freq.map(({ id, count }) => ({
    id,
    label: findingLabel(id),
    count,
    pctAffected:
      deterministicRows.length > 0
        ? round1((count / deterministicRows.length) * 100)
        : 0,
  }));

  return {
    auditedCount,
    legacyCount,
    insufficientData: auditedCount < MIN_STUDY_AUDITS,
    avgScore: overallScores.length ? round1(mean(overallScores)!) : null,
    medianScore: percentile(overallScores, 0.5),
    minScore: overallScores.length ? Math.min(...overallScores) : null,
    maxScore: overallScores.length ? Math.max(...overallScores) : null,
    scoreDistribution,
    categoryAverages,
    topFindings,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
