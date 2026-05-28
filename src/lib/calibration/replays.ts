/**
 * Read-only helpers for the operator calibration cockpit's
 * "Replay History" panel.
 *
 * Pure read. NEVER `create` / `update` / `delete`. The only writes
 * to `CalibrationReplay` happen via `scripts/replay-audits.ts
 * --persist`. This module powers:
 *
 *   - GET /api/admin/calibration/replays  (admin API)
 *   - <ReplayHistoryPanel />              (cockpit component)
 *
 * Mirrors the read-pattern in
 * `src/lib/observations/history/observation-history.ts`:
 *   • findMany with explicit select + orderBy + take
 *   • pure aggregation function operating on the result array
 *   • simple JSON-serializable return shapes
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export const REPLAY_STATUS_VALUES = [
  "stable",
  "minor_drift",
  "major_drift",
  "band_moved",
  "hash_mismatch",
  "partial_replay",
  "unreplayable",
] as const;

export type ReplayStatus = (typeof REPLAY_STATUS_VALUES)[number];

export const REPLAY_SORT_KEYS = ["createdAt", "delta", "status"] as const;
export type ReplaySortKey = (typeof REPLAY_SORT_KEYS)[number];

export type ReplaySortOrder = "asc" | "desc";

export type CategoryDelta = {
  category: string;
  original: number | null;
  recalculated: number | null;
  delta: number | null;
};

export type ChangedFindings = {
  added: string[];
  removed: string[];
};

export type CalibrationReplayRow = {
  id: string;
  auditId: string;
  createdAt: string;
  originalScore: number | null;
  recalculatedScore: number | null;
  delta: number | null;
  previousBand: string | null;
  currentBand: string | null;
  bandChanged: boolean;
  replayStatus: ReplayStatus;
  runtimeMs: number;
  replayMode: string;
  scoringVersion: string | null;
  weightHashMatch: boolean | null;
  categoryHashMatch: boolean | null;
  /** Actual stamped hash from the source replayBundle (lineage). */
  weightHashOriginal: string | null;
  categoryHashOriginal: string | null;
  /** Optional drill-down payload — null when no replayBundle was available. */
  categoryDeltas: CategoryDelta[] | null;
  changedFindings: ChangedFindings | null;
};

export type CalibrationReplaySummary = {
  total: number;
  stablePct: number;
  driftPct: number;
  avgDelta: number | null;
  maxPositiveDelta: number | null;
  maxNegativeDelta: number | null;
  byStatus: Record<ReplayStatus, number>;
};

// ────────────────────────────────────────────────────────────
// Queries
// ────────────────────────────────────────────────────────────

export type GetCalibrationReplayListOptions = {
  limit?: number;
  status?: ReplayStatus;
  bandChangedOnly?: boolean;
  sort?: ReplaySortKey;
  order?: ReplaySortOrder;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Pure read over `CalibrationReplay`. Returns a flat list of rows
 * with the headline columns + drill-down payloads parsed back into
 * typed shapes. No I/O beyond a single `findMany`.
 */
export async function getCalibrationReplayList(
  opts: GetCalibrationReplayListOptions = {},
): Promise<CalibrationReplayRow[]> {
  const take = Math.min(MAX_LIMIT, Math.max(1, opts.limit ?? DEFAULT_LIMIT));

  const where: Prisma.CalibrationReplayWhereInput = {};
  if (opts.status) where.replayStatus = opts.status;
  if (opts.bandChangedOnly) where.bandChanged = true;

  // Sort field mapping. "status" is an enum we sort alphabetically
  // (which happens to put "stable" before "*_drift" — acceptable for
  // the cockpit's filter pill workflow; finer ordering is client-side).
  const sortKey: ReplaySortKey = opts.sort ?? "createdAt";
  const order: ReplaySortOrder = opts.order ?? "desc";
  const orderBy: Prisma.CalibrationReplayOrderByWithRelationInput =
    sortKey === "createdAt"
      ? { createdAt: order }
      : sortKey === "delta"
        ? { delta: order }
        : { replayStatus: order };

  const rows = await prisma.calibrationReplay.findMany({
    where,
    orderBy,
    take,
    select: {
      id: true,
      auditId: true,
      createdAt: true,
      originalScore: true,
      recalculatedScore: true,
      delta: true,
      previousBand: true,
      currentBand: true,
      bandChanged: true,
      replayStatus: true,
      runtimeMs: true,
      replayMode: true,
      scoringVersion: true,
      weightHashMatch: true,
      categoryHashMatch: true,
      weightHashOriginal: true,
      categoryHashOriginal: true,
      categoryDeltas: true,
      changedFindings: true,
    },
  });

  return rows.map((r) => ({
    id: r.id,
    auditId: r.auditId,
    createdAt: r.createdAt.toISOString(),
    originalScore: r.originalScore,
    recalculatedScore: r.recalculatedScore,
    delta: r.delta,
    previousBand: r.previousBand,
    currentBand: r.currentBand,
    bandChanged: r.bandChanged,
    replayStatus: coerceStatus(r.replayStatus),
    runtimeMs: r.runtimeMs,
    replayMode: r.replayMode,
    scoringVersion: r.scoringVersion,
    weightHashMatch: r.weightHashMatch,
    categoryHashMatch: r.categoryHashMatch,
    weightHashOriginal: r.weightHashOriginal,
    categoryHashOriginal: r.categoryHashOriginal,
    categoryDeltas: (r.categoryDeltas as unknown as CategoryDelta[] | null) ?? null,
    changedFindings:
      (r.changedFindings as unknown as ChangedFindings | null) ?? null,
  }));
}

// ────────────────────────────────────────────────────────────
// Aggregation (pure, in-memory)
// ────────────────────────────────────────────────────────────

/**
 * Pure summary over an already-fetched row list. No I/O. Used by the
 * cockpit panel (top-stat tiles) and the admin API response.
 *
 * `driftPct` aggregates the three "real" drift statuses
 * (minor_drift + major_drift + band_moved). `partial_replay`,
 * `hash_mismatch`, and `unreplayable` are reported under `byStatus`
 * but excluded from the drift percentage to avoid double-counting.
 */
export function getCalibrationReplaySummary(
  rows: CalibrationReplayRow[],
): CalibrationReplaySummary {
  const byStatus: Record<ReplayStatus, number> = {
    stable: 0,
    minor_drift: 0,
    major_drift: 0,
    band_moved: 0,
    hash_mismatch: 0,
    partial_replay: 0,
    unreplayable: 0,
  };
  let deltaSum = 0;
  let deltaCount = 0;
  let maxPos: number | null = null;
  let maxNeg: number | null = null;

  for (const r of rows) {
    byStatus[r.replayStatus] += 1;
    if (r.delta !== null) {
      deltaSum += r.delta;
      deltaCount += 1;
      if (r.delta > 0 && (maxPos === null || r.delta > maxPos)) maxPos = r.delta;
      if (r.delta < 0 && (maxNeg === null || r.delta < maxNeg)) maxNeg = r.delta;
    }
  }

  const total = rows.length;
  const pct = (n: number) => (total === 0 ? 0 : (100 * n) / total);
  const driftPct = pct(
    byStatus.minor_drift + byStatus.major_drift + byStatus.band_moved,
  );

  return {
    total,
    stablePct: pct(byStatus.stable),
    driftPct,
    avgDelta: deltaCount === 0 ? null : deltaSum / deltaCount,
    maxPositiveDelta: maxPos,
    maxNegativeDelta: maxNeg,
    byStatus,
  };
}

// ────────────────────────────────────────────────────────────
// Display helpers (pure)
// ────────────────────────────────────────────────────────────

/**
 * Renders the band-transition string used in the cockpit's
 * "previous_band → current_band" column. Returns "—" when both
 * sides are null. When previous === current, shows the band once
 * with a trailing dash.
 */
export function formatBandTransition(
  previous: string | null,
  current: string | null,
): string {
  if (!previous && !current) return "—";
  if (!previous) return `— → ${current}`;
  if (!current) return `${previous} → —`;
  if (previous === current) return `${previous} → —`;
  return `${previous} → ${current}`;
}

/**
 * Defensive narrowing for the `replayStatus` column — Prisma stores it
 * as a free-form string. If a writer ever emits an unknown value the
 * cockpit falls back to `unreplayable` rather than throwing.
 */
function coerceStatus(value: string): ReplayStatus {
  return (REPLAY_STATUS_VALUES as readonly string[]).includes(value)
    ? (value as ReplayStatus)
    : "unreplayable";
}
