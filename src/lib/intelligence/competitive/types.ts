/**
 * Types for the competitive-intelligence metrics module.
 *
 * Every metric here is a plain, reproducible ratio or count computed
 * directly from `Observation` / `ObservationCompetitorMention` rows —
 * NOT a new score, and NEVER written to `AuditIntelligence.overallScore`
 * or any other frozen scoring column. See
 * `docs/COMPETITIVE_METRICS_FORMULAS.md` for the formulas in prose,
 * cross-referenced against these types.
 */

export type MentionRate = {
  businessId: string;
  /** Only competitive_capture rows carry a non-null `mentioned` value. */
  totalObservations: number;
  mentionedCount: number;
  /** null when totalObservations === 0 — no fake precision. */
  rate: number | null;
};

export type RecommendationRate = {
  businessId: string;
  /** Only self_assessment rows carry a non-null `recommended` value. */
  totalObservations: number;
  recommendedCount: number;
  rate: number | null;
};

export type ShareOfVoiceEntry = {
  entityName: string;
  entityNormalized: string;
  isSubjectBusiness: boolean;
  mentionCount: number;
  /** 0..1 — mentionCount / totalMentions in scope. */
  share: number;
};

export type ShareOfVoiceResult = {
  industryNormalized: string;
  geographyRaw: string;
  windowDays: number | null;
  totalMentions: number;
  entities: ShareOfVoiceEntry[];
};

export type CompetitorFrequencyEntry = {
  competitorNormalized: string;
  /** Most-recently-seen verbatim name for this normalized identity. */
  competitorName: string;
  mentionCount: number;
};

export type QueryOutcome = {
  provider: string;
  /** true when the latest observation for this provider+query had
   * mentioned === true OR recommended === true. */
  win: boolean;
  observedAt: string;
};

export type QueryWinLoss = {
  businessId: string;
  queryLibraryEntryId: string;
  /** One entry per provider that has ever observed this query for this
   * business — always the MOST RECENT observation per provider, never
   * averaged across re-runs. */
  outcomes: QueryOutcome[];
  wins: number;
  losses: number;
};

export type ModelOutcome = {
  provider: string;
  win: boolean;
  observedAt: string;
};

export type ModelWinLoss = {
  businessId: string;
  windowDays: number | null;
  /** One entry per provider, using each provider's single most recent
   * observation in scope. */
  outcomes: ModelOutcome[];
  wins: number;
  losses: number;
};
