import type { CategoryKey, DeterministicScore } from "@/lib/scoring/types";

/**
 * Per-entry status. DERIVED at read time from the linked
 * `AuditOrder.reportStatus` (or `skipReason`) — never stored, so it
 * can't drift. The customer spec's five states.
 */
export type MarketStudyEntryStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

/** Terminal states — polling can stop once every entry is here. */
export const TERMINAL_ENTRY_STATUSES: ReadonlySet<MarketStudyEntryStatus> =
  new Set(["completed", "failed", "skipped"]);

/**
 * The minimal shape `deriveEntryStatus` needs. Accepts the real
 * Prisma row or a partial in tests.
 */
export type EntryStatusInput = {
  skipReason: string | null;
  auditOrder: { reportStatus: string | null } | null;
};

/**
 * One completed-audit row fed to `computeStudyAggregate`. Built from a
 * `MarketStudyEntry` joined to its `AuditIntelligence`.
 */
export type StudyAuditRow = {
  /** Canonical overall score 0–100, or null if unresolved. */
  overallScore: number | null;
  /**
   * The full deterministic score JSON when present (`scoring@1.0.0`
   * rows). Null for legacy rows — those are counted in `legacyCount`
   * and excluded from finding-frequency + category rollups.
   */
  deterministicScore: DeterministicScore | null;
  /** Normalized industry slug, for context only. */
  industry: string | null;
};

export type ScoreBandBucket = {
  band: string;
  count: number;
  pct: number;
};

export type TopFinding = {
  id: string;
  label: string;
  count: number;
  /** Percentage of businesses (with a deterministic score) affected. */
  pctAffected: number;
};

export type StudyAggregate = {
  /** Businesses with a completed audit + resolvable overall score. */
  auditedCount: number;
  /** Completed audits that are legacy (no deterministic score). */
  legacyCount: number;
  /**
   * True when there is too little completed data to report meaningful
   * aggregates. Callers should show "collecting data" instead of the
   * numbers below.
   */
  insufficientData: boolean;
  avgScore: number | null;
  medianScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  scoreDistribution: ScoreBandBucket[];
  /** Mean 0–100 per category across deterministic-scored audits. */
  categoryAverages: Partial<Record<CategoryKey, number>>;
  topFindings: TopFinding[];
};

/** Context for `classifyLeadForAudit`. */
export type EligibilityContext = {
  /** Normalized domains already seen earlier in THIS selection. */
  seenDomains: Set<string>;
  /** Lead ids already having an entry in the target study. */
  studyLeadIds: Set<string>;
  /**
   * Lead ids with a queued/running/completed market-study audit within
   * `MARKET_STUDY_RECENT_AUDIT_DAYS`.
   */
  recentlyAuditedLeadIds: Set<string>;
};

/** The subset of a Lead row eligibility needs. */
export type EligibilityLead = {
  id: string;
  businessName: string;
  website: string | null;
  domain: string | null;
  status: string;
};

export type EligibilityResult =
  | { eligible: true; websiteUrl: string; normalizedDomain: string }
  | { eligible: false; skipReason: string };
