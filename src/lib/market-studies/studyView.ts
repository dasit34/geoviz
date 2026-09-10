import type { DeterministicScore } from "@/lib/scoring/types";

import { deriveEntryStatus } from "./entryStatus";
import type { MarketStudyEntryStatus, StudyAuditRow } from "./types";

/** Minimal shape the status/score helpers read from an entry. */
export type EntryLike = {
  skipReason: string | null;
  auditOrder: {
    reportStatus: string | null;
    intelligence: { overallScore: number | null } | null;
  } | null;
};

/** Full entry shape the detail route builds (with score JSON + lead). */
export type StudyEntryRow = EntryLike & {
  id: string;
  leadId: string | null;
  auditOrderId: string | null;
  businessName: string;
  websiteUrl: string;
  createdAt: Date;
  auditOrder:
    | (EntryLike["auditOrder"] & {
        reportGeneratedAt: Date | null;
        intelligence:
          | {
              overallScore: number | null;
              deterministicScore: unknown;
              industryCategoryNormalized: string | null;
            }
          | null;
      })
    | null;
  lead: {
    id: string;
    status: string;
    outreach: { status: string }[];
  } | null;
};

export type StudyStatusCounts = Record<MarketStudyEntryStatus, number> & {
  total: number;
};

export type StudyScoreStats = {
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};

export function emptyStatusCounts(): StudyStatusCounts {
  return { total: 0, queued: 0, running: 0, completed: 0, failed: 0, skipped: 0 };
}

export function countEntryStatuses(
  entries: ReadonlyArray<EntryLike>,
): StudyStatusCounts {
  const counts = emptyStatusCounts();
  for (const e of entries) {
    counts.total += 1;
    counts[deriveEntryStatus(e)] += 1;
  }
  return counts;
}

/** avg/median/min/max over completed entries' overall scores. */
export function scoreStats(
  entries: ReadonlyArray<EntryLike>,
): StudyScoreStats {
  const scores = entries
    .map((e) =>
      deriveEntryStatus(e) === "completed"
        ? e.auditOrder?.intelligence?.overallScore ?? null
        : null,
    )
    .filter((s): s is number => typeof s === "number");
  if (scores.length === 0) {
    return { avg: null, median: null, min: null, max: null };
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return {
    avg: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
    median: round1(median),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

/** Build the `StudyAuditRow[]` that `computeStudyAggregate` consumes. */
export function toAggregateRows(
  entries: ReadonlyArray<StudyEntryRow>,
): StudyAuditRow[] {
  return entries
    .filter((e) => deriveEntryStatus(e) === "completed")
    .map((e) => ({
      overallScore: e.auditOrder?.intelligence?.overallScore ?? null,
      deterministicScore:
        (e.auditOrder?.intelligence?.deterministicScore as
          | DeterministicScore
          | null
          | undefined) ?? null,
      industry: e.auditOrder?.intelligence?.industryCategoryNormalized ?? null,
    }));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
