/**
 * Competitive-intelligence metrics — public surface.
 *
 * Every export here is a pure-read aggregation over the Observation /
 * QueryLibraryEntry / ObservationCompetitorMention tables written by
 * `@/lib/intelligence/evidence/persistObservationEvidence`. None of
 * these touch `@/lib/scoring/*` (frozen) or any `AuditIntelligence`
 * score column — see each file's own doc comment for its formula, and
 * `docs/COMPETITIVE_METRICS_FORMULAS.md` for the same formulas in
 * prose, cross-referenced against these implementations.
 */

export { mentionRate } from "./mentionRate";
export { recommendationRate } from "./recommendationRate";
export { shareOfVoice } from "./shareOfVoice";
export { competitorFrequency } from "./competitorFrequency";
export { queryWinLoss } from "./queryWinLoss";
export { modelWinLoss } from "./modelWinLoss";

export type {
  MentionRate,
  RecommendationRate,
  ShareOfVoiceEntry,
  ShareOfVoiceResult,
  CompetitorFrequencyEntry,
  QueryOutcome,
  QueryWinLoss,
  ModelOutcome,
  ModelWinLoss,
} from "./types";
