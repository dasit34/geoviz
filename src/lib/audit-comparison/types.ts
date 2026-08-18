/**
 * Re-Audit / Verification Audit comparison — type contracts.
 *
 * The comparison is always computed fresh from two already-persisted
 * `AuditIntelligence` rows (`deterministicScore` + `aiValidations`
 * Json) — nothing here is itself persisted. See `buildAuditComparison.ts`
 * for the one entry point that produces this shape, and `classify.ts`
 * for the deterministic (no-LLM) classification rules.
 *
 * Two clearly separated halves, deliberately never merged into one
 * undifferentiated "score went up" narrative:
 *   - `siteTechnical` — from `deterministicScore` only. Zero model
 *     variability; the same two audits will always diff the same way.
 *   - `liveModel` — from `aiValidations` only. Real LLM calls, which
 *     can vary run-to-run even against an identical query — every
 *     consumer of this data must show the variability caveat, never
 *     present it as a clean causal result of the site-technical change.
 */

export const COMPARISON_ENGINE_VERSION = "audit-comparison@1.0.0";

export type ComparisonClassification =
  | "IMPROVED"
  | "DECLINED"
  | "UNCHANGED"
  | "NOT_COMPARABLE";

export type ScoreDelta = {
  previous: number | null;
  current: number | null;
  delta: number | null;
  classification: ComparisonClassification;
};

export type LabeledScoreDelta = ScoreDelta & {
  key: string;
  label: string;
};

// ── Site / technical (deterministicScore-derived, zero model variability) ──

export type SiteTechnicalComparison = {
  overall: ScoreDelta;
  /** Understanding / AI Accessibility / Trust / Recommendation Readiness. */
  dimensions: LabeledScoreDelta[];
  /** Schema, Crawl Access, Trust Signals, Content Depth, Brand Presence, Content Extraction. */
  diagnostics: LabeledScoreDelta[];
  /** Google AI Overviews Readiness, Structured Identity, Entity Consistency, Trust Evidence. */
  readiness: LabeledScoreDelta[];
  issues: {
    resolved: IssueComparisonEntry[];
    partiallyResolved: IssueComparisonEntry[];
    unchanged: IssueComparisonEntry[];
    new: IssueComparisonEntry[];
  };
};

export type IssueComparisonEntry = {
  id: string;
  message: string;
  categoryKey: string;
  severity: string;
};

// ── Live AI model movement (aiValidations-derived, real LLM variability) ──

export type ProviderComparisonEntry = {
  provider: string;
  display: string;
  comparable: boolean;
  /** Why NOT_COMPARABLE, when applicable — e.g. "buyer-intent query text changed between audits". */
  notComparableReason: string | null;
  previous: ProviderSnapshot | null;
  current: ProviderSnapshot | null;
  understandingScore: ScoreDelta;
  mentioned: BooleanDelta;
  recommended: BooleanDelta;
  citationCount: ScoreDelta;
};

export type ProviderSnapshot = {
  status: string;
  businessUnderstandingScore: number | null;
  wouldRecommend: string | null;
  mentioned: boolean;
  citationCount: number;
  topEntityNamed: string | null;
  queryText: string | null;
};

export type BooleanDelta = {
  previous: boolean | null;
  current: boolean | null;
  classification: ComparisonClassification;
};

export type CompetitorComparison = {
  previouslyNamed: string[];
  currentlyNamed: string[];
  newlyAppearing: string[];
  noLongerAppearing: string[];
  persisting: string[];
};

export type LiveModelComparison = {
  providers: ProviderComparisonEntry[];
  competitors: CompetitorComparison;
  /** How many of the tested providers recommended the business, previous vs current. */
  recommendedCount: { previous: number; current: number; totalProviders: number };
};

// ── Query / category consistency (governs `comparable` above) ──

export type QueryConsistency = {
  categoryConsistent: boolean;
  previousCategory: string | null;
  currentCategory: string | null;
  previousTaxonomyVersion: string | null;
  currentTaxonomyVersion: string | null;
  /** Per-provider query-text match, keyed by provider name. */
  perProviderQueryMatch: Record<string, boolean | null>;
};

// ── Cohort context (never a delta — see audit-percentile.ts) ──

export type CohortPosition = {
  label: string; // e.g. "Current cohort position"
  copy: string;
  percentile: number | null;
  cohortSize: number;
  bucket: string;
};

export type CohortContext = {
  previous: CohortPosition | null;
  current: CohortPosition | null;
  note: string;
};

// ── Top level ──

export type AuditComparisonAvailability = {
  /** False when the PREVIOUS audit predates deterministic scoring — nothing fabricated, just marked unavailable. */
  siteTechnicalAvailable: boolean;
  liveModelAvailable: boolean;
};

export type AuditComparisonResult = {
  engineVersion: string;
  previousAuditOrderId: string;
  currentAuditOrderId: string;
  previousCreatedAt: Date;
  currentCreatedAt: Date;
  availability: AuditComparisonAvailability;
  queryConsistency: QueryConsistency;
  siteTechnical: SiteTechnicalComparison | null;
  liveModel: LiveModelComparison | null;
  cohort: CohortContext;
};
