/**
 * Observation layer — re-exports.
 *
 * The four AI-platform observation providers (stubs in v1). Persisted
 * separately from `deterministicScore` — see `types.ts` for the
 * contract.
 */

export type {
  ConsensusSnapshot,
  DisagreementArea,
  DriftReport,
  ObservationHealth,
  ObservationProvider,
  ObservationProviderId,
  ObservationResult,
  ObservationRun,
  ObservationSignals,
  ObservationStatus,
  ObservationSummary,
  ProviderObservation,
  ProviderSignals,
  SignalDimension,
} from "./types";
export { OBSERVATION_VERSION } from "./types";

// Consensus + telemetry (v2).
export {
  projectToSignals,
  computeSignalVariance,
  findDisagreementAreas,
} from "./consensus/compareSignals";
export { computeAgreement } from "./consensus/computeAgreement";
export { detectDrift } from "./consensus/driftDetection";
export { buildObservationSummary } from "./storage/observation-summary";

// Observation gate + drift protection (safety lock).
export {
  AGREEMENT_MIN,
  MIN_PROVIDERS,
  VARIANCE_SUPPRESS,
  validateObservation,
} from "./guards/validateObservation";
export {
  detectObservationDrift,
  type DriftAssessment,
  type DriftLevel,
} from "./guards/detectObservationDrift";
export {
  FORBIDDEN_FIELDS,
  ObservationMutationError,
  runObservationGuarded,
} from "./guards/confidenceGate";

// Append-only history persistence (writes never touch scoring).
export {
  buildObservationHistoryRow,
  writeObservationHistory,
  getObservationHistorySummary,
  type ObservationHistoryRow,
  type ObservationHistorySummary,
} from "./history/observation-history";

export {
  executeObservation,
  type ExecuteObservationInput,
  type ExecuteObservationResult,
} from "./executeObservation";
export {
  runObservationExecution,
  getObservationCounters,
  resetObservationCounters,
  type RunObservationExecutionOutcome,
  type ObservationCounters,
} from "./runObservationExecution";
export {
  ObservationCache,
  observationCache,
} from "./cache/observation-cache";
export {
  ALL_PROVIDERS,
  OBSERVATION_PROVIDERS,
  hasProviderKey,
} from "./registry";
export {
  SCORING_FREEZE_VIOLATION_MESSAGE,
  withScoringFreeze,
} from "./freeze-guard";

/**
 * Shadow-mode env flag — default false. When set to `"true"` (case-
 * insensitive), the orchestrator's providers actually fire (today
 * they return deterministic mocks; future PRs will swap in real
 * provider calls). Scoring path is unaffected either way.
 */
export function isObservationEnabled(): boolean {
  return (process.env.ENABLE_OBSERVATION ?? "").toLowerCase() === "true";
}

// Individual provider re-exports (the consolidated lookup lives in
// `./registry.ts` and is exported above as `OBSERVATION_PROVIDERS`).
export { openaiProvider } from "./providers/openai";
export { geminiProvider } from "./providers/gemini";
export { perplexityProvider } from "./providers/perplexity";
export { claudeProvider } from "./providers/claude";
