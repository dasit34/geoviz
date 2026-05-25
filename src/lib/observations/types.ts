/**
 * Observation layer — public types only.
 *
 * "Observations" capture how each AI provider (OpenAI, Gemini,
 * Perplexity, Claude) actually responds to a representative customer
 * query about a business — separate concern from the deterministic
 * scoring engine. Stored separately (future `observations Json?`
 * column on `AuditIntelligence`) so observation drift never alters
 * the scoring contract.
 *
 * V1 ships the interfaces only. Providers are stubs that throw
 * `not yet implemented`. No API calls, no persistence, no migrations.
 * When providers are wired in a follow-up PR, results will be
 * persisted alongside `deterministicScore` but never inside it.
 */

export type ObservationProviderId =
  | "openai"
  | "gemini"
  | "perplexity"
  | "claude";

/**
 * Lightweight signals returned by an `observe(input)` call. Each
 * value is a 0..1 normalized score; missing fields mean "the
 * provider didn't surface this signal on this call". Today every
 * provider returns deterministic mocks for all four fields.
 */
export type ObservationSignals = {
  retrieval?: number;
  trust?: number;
  citation?: number;
  recommendation?: number;
};

/**
 * One observation result returned by one provider for one call.
 *
 * v1 = deterministic mock payloads (no live API). The shape is the
 * authoritative one — when providers come online, real API responses
 * map into the same fields. `enabled` reflects the gate state at
 * call time, `success` reflects whether the call (mock or real)
 * returned without throwing.
 */
export interface ObservationResult {
  provider: ObservationProviderId;
  enabled: boolean;
  success: boolean;
  latency_ms: number;
  cost_usd: number;
  signals: ObservationSignals;
  raw_summary?: string;
  /** ISO timestamp — the only impure field in the mock path. */
  created_at: string;
}

export interface ObservationProvider {
  readonly id: ObservationProviderId;
  /**
   * Future API. Throws `not yet implemented` in v1; real providers
   * will perform a single read-only AI query and return what they
   * observed about the business.
   */
  observe(input: {
    businessName: string;
    websiteUrl: string;
    /** Optional probe query — provider may rephrase. */
    probe?: string;
  }): Promise<ObservationResult>;
}

/* ─────────────────────────────────────────────────────────────────
 * Observation Layer V2 — consensus + telemetry
 *
 * Flat per-provider snapshots + cross-provider agreement +
 * drift-vs-baseline + the persisted ObservationSummary record.
 *
 * v2 = pure types + helpers; no DB persistence yet (deferred to a
 * future PR with its own additive Prisma column). Scoring is
 * structurally and runtime-isolated from this layer — see
 * `freeze-guard.ts` for the runtime check.
 * ──────────────────────────────────────────────────────────────── */

export const OBSERVATION_VERSION = "observation@2.0.0";

/** The four dimensions every provider reports a signal for. */
export type SignalDimension =
  | "retrieval"
  | "trust"
  | "citation"
  | "recommendation";

/**
 * Flat per-provider signal snapshot — the input shape consensus
 * helpers consume. Adapted from `ObservationResult` via
 * `projectToSignals(result)`.
 */
export type ProviderSignals = {
  provider: ObservationProviderId;
  retrieval: number | null;
  trust: number | null;
  citation: number | null;
  recommendation: number | null;
  /** 0..1 — per-provider confidence in its own answer (mock today). */
  confidence: number;
};

/** A dimension where providers disagree (variance over threshold). */
export type DisagreementArea = {
  dimension: SignalDimension;
  /** Std-dev across providers, normalized 0..1. */
  variance: number;
  /** Lowest provider score on this dimension. */
  min: number;
  /** Highest provider score on this dimension. */
  max: number;
  /** `max - min` — convenience field for human-readable summaries. */
  spread: number;
};

/**
 * Gate status emitted by `validateObservation` — explicit labels
 * for the four outcomes a guarded observation summary can land in.
 * Callers MUST treat anything other than "OK" as "do not surface
 * as decision input".
 */
export type ObservationStatus =
  | "OK"
  | "DISAGREE"
  | "SUPPRESSED"
  | "SINGLE_PROVIDER";

/**
 * Health verdict for a single observation summary. The gate's
 * authoritative answer to "is this run usable as decision input?"
 * — `usable` is the single boolean the caller checks; the other
 * fields exist for operator triage + dashboards.
 */
export interface ObservationHealth {
  status: ObservationStatus;
  agreement_band: "high" | "medium" | "low";
  /** Max stdev across the four signal dimensions. */
  variance: number;
  /** True when `status === "OK"`. */
  usable: boolean;
  /** Plain-English one-liner operators can grep. */
  explanation: string;
}

/** Per-provider drift between two runs of the same business. */
export type DriftReport = {
  /** ISO of the prior run (the baseline). */
  baseline_at: string;
  /** Providers whose any-dimension delta exceeded the material threshold. */
  drifted_providers: Array<{
    provider: ObservationProviderId;
    largest_delta: number;
    largest_delta_dimension: SignalDimension;
  }>;
  /** Per-dimension max(|current - baseline|) across all providers. */
  max_delta_by_dimension: Record<SignalDimension, number>;
};

/**
 * The persisted telemetry record — one per audit when observations
 * actually fire. Carries the scoring-engine hashes from `frozen.ts`
 * so an analyst can prove scoring was unchanged at the time of
 * write.
 */
export interface ObservationSummary {
  observation_version: string;
  scoring_weight_hash: string;
  scoring_category_hash: string;
  /** Providers that returned `success: true` in this run. */
  providers_run: ObservationProviderId[];
  agreement_score: number;                 // 0..100
  agreement_band: "high" | "medium" | "low";
  disagreement_areas: DisagreementArea[];
  signal_variance: Record<SignalDimension, number>;
  estimated_cost_usd: number;
  avg_latency_ms: number;
  recorded_at: string;
  /** Set when a prior summary was passed for drift comparison. */
  drift?: DriftReport;
}

/* ─────────────────────────────────────────────────────────────────
 * Observation run + provider observation + consensus snapshot.
 *
 * V1 ships only the TypeScript shapes — no Prisma migration, no
 * persistence, no API calls. When the providers go live, results
 * will land in a future `observations Json?` column on
 * `AuditIntelligence` (separate from `deterministicScore` so
 * observation drift never alters the scoring contract).
 * ──────────────────────────────────────────────────────────────── */

/**
 * One observation produced by one provider during an
 * `ObservationRun`. Replaces the lightweight `ObservationResult`
 * placeholder for any new code; `ObservationResult` is kept for
 * backward compat with the existing provider stubs.
 */
export interface ProviderObservation {
  /** Which provider produced this row. */
  provider: ObservationProviderId;
  /** The exact query the provider received. */
  query: string;
  /** True when the business was named in the provider's response. */
  mentioned: boolean;
  /** True when the provider recommended this business (vs. only mentioning). */
  recommended: boolean;
  /** Domains cited by the provider in its response. */
  citation_domains: string[];
  /** Provider-level hallucination flags surfaced by the verifier. */
  hallucination_flags: string[];
  /** USD spent on this provider call. */
  cost_usd: number;
  /** Wall-clock ms for this provider call. */
  latency_ms: number;
  /** Raw provider payload for replay + audit trail. */
  raw: unknown;
  /** ISO timestamp the provider call returned. */
  observed_at: string;
}

/**
 * Cross-provider consensus aggregated after every provider in the
 * run responds. Persisted alongside the run so dashboards can read
 * it without re-deriving from the per-provider rows.
 */
export interface ConsensusSnapshot {
  /** Count of providers that mentioned the business. */
  providers_mentioning: number;
  /** Count of providers that recommended the business. */
  providers_recommending: number;
  /** Union of all citation domains across providers. */
  union_citation_domains: string[];
  /** Union of all hallucination flags across providers. */
  union_hallucination_flags: string[];
  /** 0..1 — fraction of providers that mentioned the business. */
  mention_rate: number;
  /** 0..1 — fraction of providers that recommended the business. */
  recommendation_rate: number;
}

/**
 * One orchestrator invocation against all configured providers for
 * a single audit. A new `ObservationRun` is recorded each time
 * `ENABLE_OBSERVATION=true` and the observation pipeline fires.
 */
export interface ObservationRun {
  /** Stable id for this run — one row per orchestrator invocation. */
  id: string;
  /** Foreign key to the audit this run belongs to. */
  audit_order_id: string;
  /** Audited business URL (denormalized for query convenience). */
  website_url: string;
  /** The customer-intent query the providers received. */
  query: string;
  /** Wall-clock ms for the entire orchestration (max of providers, plus aggregation). */
  total_latency_ms: number;
  /** Aggregate USD spent across all provider observations in this run. */
  total_cost_usd: number;
  /** Per-provider observations collected during this run. */
  observations: ProviderObservation[];
  /** Cross-provider consensus aggregated post-run. */
  consensus: ConsensusSnapshot;
  /** ISO timestamp the run was recorded. */
  recorded_at: string;
}
