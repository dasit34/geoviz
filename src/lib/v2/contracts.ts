/**
 * GeoViz V2 — Intelligence Layer contracts.
 *
 * This file is a **type-only seam** for the V2 modules described in
 * the project CLAUDE.md (Recurring monitoring, Competitor tracking,
 * Historical visibility tracking, Benchmark datasets, Crawler
 * intelligence, Renderability analysis).
 *
 * Nothing in here is imported by V1 today. All declarations are
 * `type` / `interface` only — no runtime code, no side effects. When
 * V2 work begins, each module implements its corresponding interface
 * and the V1 ↔ V2 boundary stays narrow and reviewable.
 *
 * Hard rule: do NOT add runtime functions to this file. If you need
 * to ship a working V2 helper, create `src/lib/v2/<module>.ts` and
 * have it implement the relevant interface from here.
 */

/** Shared scalar — a 0–100 score with the same semantics as V1. */
export type VisibilityScore = number;

/** Shared scalar — Unix epoch ms. */
export type Timestamp = number;

/** A point-in-time snapshot of a business's AI visibility. */
export interface VisibilitySnapshot {
  /** The audit row this snapshot was derived from (CUID). */
  orderId: string;
  /** Canonical hostname the audit ran against. */
  hostname: string;
  /** Overall visibility score at the time of the snapshot. */
  overall: VisibilityScore;
  /** Per-category scores keyed by rubric category. */
  byCategory: Record<string, VisibilityScore>;
  /** When the snapshot was captured. */
  capturedAt: Timestamp;
}

// ────────────────────────────────────────────────────────────
// 1. Recurring monitoring
// ────────────────────────────────────────────────────────────

export interface RecurringMonitor {
  /**
   * Register a hostname for recurring re-audit at a given cadence.
   * Returns an opaque schedule ID the caller can later cancel.
   */
  schedule(args: {
    hostname: string;
    cadenceDays: number;
    notifyEmail: string;
  }): Promise<{ scheduleId: string }>;

  cancel(scheduleId: string): Promise<void>;
}

// ────────────────────────────────────────────────────────────
// 2. Competitor tracking
// ────────────────────────────────────────────────────────────

export interface CompetitorComparison {
  primary: VisibilitySnapshot;
  competitor: VisibilitySnapshot;
  /**
   * Per-category deltas (primary − competitor). Positive numbers mean
   * the primary business leads.
   */
  deltas: Record<string, number>;
  /**
   * Short, human-readable summary lines. V2 must never expose a delta
   * without a sentence-level explanation.
   */
  reasons: string[];
}

export interface CompetitorTracker {
  compare(args: {
    primaryHostname: string;
    competitorHostname: string;
  }): Promise<CompetitorComparison>;
}

// ────────────────────────────────────────────────────────────
// 3. Historical visibility tracking
// ────────────────────────────────────────────────────────────

export interface VisibilityHistory {
  hostname: string;
  snapshots: VisibilitySnapshot[];
  /** Best-fit trendline direction over the window. */
  trend: "up" | "flat" | "down" | "insufficient_data";
}

export interface HistoryStore {
  record(snapshot: VisibilitySnapshot): Promise<void>;
  load(hostname: string, windowDays: number): Promise<VisibilityHistory>;
}

// ────────────────────────────────────────────────────────────
// 4. Benchmark datasets
// ────────────────────────────────────────────────────────────

export interface BenchmarkCohort {
  /** Cohort label (e.g. industry, geo, business size). */
  label: string;
  /** Median overall score within the cohort. */
  medianOverall: VisibilityScore;
  /** Per-category medians. */
  byCategory: Record<string, VisibilityScore>;
  /** Number of audits that contributed. Used to gate marketing claims. */
  sampleSize: number;
}

export interface BenchmarkStore {
  /**
   * Returns the cohort(s) a given snapshot should be benchmarked
   * against. May return an empty array when the cohort isn't large
   * enough to publish — callers must respect this and refuse to
   * surface unstable benchmarks to customers.
   */
  cohortsFor(snapshot: VisibilitySnapshot): Promise<BenchmarkCohort[]>;
}

// ────────────────────────────────────────────────────────────
// 5. Crawler intelligence
// ────────────────────────────────────────────────────────────

export type CrawlerOutcome =
  | { kind: "ok"; statusCode: number; elapsedMs: number }
  | { kind: "blocked"; statusCode: number; reason: string }
  | { kind: "error"; reason: string };

export interface CrawlerProbe {
  hostname: string;
  userAgent: string;
  outcome: CrawlerOutcome;
  capturedAt: Timestamp;
}

export interface CrawlerIntelligence {
  /**
   * Probe a hostname as a specific AI crawler UA. Implementations may
   * be a direct request, a hosted browser, or a third-party service —
   * call sites should not care which.
   */
  probe(args: {
    hostname: string;
    userAgent: string;
  }): Promise<CrawlerProbe>;
}

// ────────────────────────────────────────────────────────────
// 6. Renderability analysis
// ────────────────────────────────────────────────────────────

export interface RenderabilityReport {
  hostname: string;
  /** What an AI ingestion bot would actually read after rendering. */
  ingestedText: string;
  /** Whether content was meaningfully different between raw HTML and post-render. */
  hydrationCriticalContent: boolean;
  /** Headings the bot saw, in document order. */
  headings: Array<{ level: number; text: string }>;
  /** Notes from the renderer (timeouts, blocked requests, etc.). */
  diagnostics: string[];
}

export interface RenderabilityAnalyzer {
  analyze(hostname: string): Promise<RenderabilityReport>;
}
