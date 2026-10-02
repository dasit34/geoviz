/**
 * Visibility tracking v1 — shared types.
 */
import type { TrackingProvider } from "../plans";
import type { SampleUsage } from "./pricing";

export type { TrackingProvider };

/** Exact search configuration a sample ran with (part of its compatibility fingerprint). */
export type SearchSettings = {
  grounding: "web_search" | "none";
  /** Provider tool / mode, e.g. "web_search_20250305", "web_search_preview", "google_search", "sonar-native". */
  tool: string | null;
  contextSize?: string | null;
};

/** Provider response captured BEFORE any normalization — the verification record. */
export type RawCapture = {
  text: string;
  citations: Array<{ url: string; title?: string | null; citedText?: string | null }>;
  searchQueries: string[];
  finishReason: string | null;
  responseId: string | null;
  usage: unknown;
};

/**
 * What a provider adapter returns for one sample.
 * - `ok: true`  → the provider answered.
 * - `outcome: "failed"`  → the provider definitively did not answer (error
 *   response, missing key) — the outcome is known.
 * - `outcome: "unknown"` → a request may have reached the provider and
 *   been processed/billed (timeout, dropped connection) — never auto-retried.
 */
export type ProviderAnswer =
  | {
      ok: true;
      provider: TrackingProvider;
      model: string;
      searchSettings: SearchSettings;
      answerText: string;
      /** Provider-native citation URLs (search results / annotations / grounding chunks). */
      nativeCitationUrls: string[];
      raw: RawCapture;
      usage: SampleUsage | null;
      providerRequestId: string | null;
      latencyMs: number;
    }
  | {
      ok: false;
      provider: TrackingProvider;
      model: string | null;
      outcome: "failed" | "unknown";
      errorCode: "unavailable" | "provider_error" | "timeout" | "network_error" | "empty_answer";
      errorMessage: string;
      providerRequestId?: string | null;
      latencyMs: number;
    };

/** Returned by `retrieve` while a provider-side job is still running. */
export type StillRunning = { pending: true };

/**
 * Provider access for the cycle runner. `retrieve` exists only where the
 * provider offers request retrieval (OpenAI Responses background mode);
 * everywhere else a crash mid-request leaves an `unknown` outcome.
 */
export interface TrackingProviderClient {
  run(
    provider: TrackingProvider,
    prompt: string,
    hooks?: { onSubmitted?: (providerRequestId: string) => Promise<void> },
  ): Promise<ProviderAnswer | StillRunning>;
  supportsRetrieval(provider: TrackingProvider): boolean;
  retrieve(provider: TrackingProvider, providerRequestId: string): Promise<ProviderAnswer | StillRunning>;
}

/** Entity the detector looks for (the customer or a tracked competitor). */
export type TrackedEntity = {
  id: string;
  name: string;
  websiteUrl: string | null;
};

export type PositionStatus = "ranked" | "not_in_list" | "no_ordered_list" | "not_measured";
export type CallState = "pending" | "in_flight" | "completed" | "failed" | "unknown";

/** Normalized, storable fields for one sample. */
export type NormalizedResult = {
  status: "measured" | "not_measured";
  callState: Exclude<CallState, "pending" | "in_flight">;
  errorCode: string | null;
  errorMessage: string | null;
  groundingMode: string | null;
  searchSettings: SearchSettings | null;
  model: string | null;
  promptVersion: string;
  extractorVersion: string | null;
  configFingerprint: string | null;
  mentioned: boolean | null;
  position: number | null;
  positionStatus: PositionStatus;
  citedUrls: string[];
  citedDomains: string[];
  namedBusinesses: string[];
  competitorIdsMentioned: string[];
  matchEvidence: { matchedBy: string[]; matchedText: string | null } | null;
  detectorVersion: string | null;
  answerText: string | null;
  rawResponse: RawCapture | null;
  providerRequestId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  searchCalls: number | null;
  costUsd: number | null;
  costSource: string | null;
  latencyMs: number | null;
};

/** The minimal per-sample shape the pure metric functions consume. */
export type ResultForMetrics = {
  trackedPromptId: string;
  provider: string;
  sampleIndex: number;
  status: string;
  callState: string;
  mentioned: boolean | null;
  position: number | null;
  positionStatus: string | null;
  configFingerprint: string | null;
  citedDomains: string[];
  namedBusinesses: string[];
  competitorIdsMentioned: string[];
  costUsd: number | null;
};

export type CompetitorRef = {
  id: string;
  name: string;
  normalizedName: string;
  domain: string | null;
};
