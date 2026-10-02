/**
 * Visibility tracking v1 — shared types.
 */
import type { TrackingProvider } from "../plans";

export type { TrackingProvider };

/** What a provider adapter returns for one tracked prompt. */
export type ProviderAnswer =
  | {
      ok: true;
      provider: TrackingProvider;
      model: string;
      groundingMode: "web_search" | "none";
      answerText: string;
      /** Businesses the answer named, in order (as reported by the model's structured output, when available). */
      namedBusinesses: string[];
      /** Provider-native citation URLs (search results / annotations / grounding chunks). */
      nativeCitationUrls: string[];
      latencyMs: number;
    }
  | {
      ok: false;
      provider: TrackingProvider;
      model: string | null;
      errorCode: "unavailable" | "timeout" | "provider_error" | "parse_error";
      errorMessage: string;
      latencyMs: number;
    };

export type TrackingProviderRunner = (provider: TrackingProvider, prompt: string) => Promise<ProviderAnswer>;

/** Entity the detector looks for (the customer or a tracked competitor). */
export type TrackedEntity = {
  id: string;
  name: string;
  websiteUrl: string | null;
};

/** Normalized, storable result fields for one provider answer. */
export type NormalizedResult = {
  status: "measured" | "not_measured";
  errorCode: string | null;
  errorMessage: string | null;
  groundingMode: string | null;
  model: string | null;
  mentioned: boolean | null;
  position: number | null;
  citedUrls: string[];
  citedDomains: string[];
  namedBusinesses: string[];
  competitorIdsMentioned: string[];
  matchEvidence: { matchedBy: string[]; matchedText: string | null } | null;
  detectorVersion: string | null;
  answerText: string | null;
  latencyMs: number | null;
};

/** The minimal result shape the pure metric functions consume. */
export type ResultForMetrics = {
  trackedPromptId: string;
  provider: string;
  status: string;
  mentioned: boolean | null;
  position: number | null;
  citedDomains: string[];
  namedBusinesses: string[];
  competitorIdsMentioned: string[];
};

export type CompetitorRef = {
  id: string;
  name: string;
  normalizedName: string;
  domain: string | null;
};
