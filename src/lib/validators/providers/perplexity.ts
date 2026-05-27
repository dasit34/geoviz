/**
 * PerplexityValidator — placeholder for cross-model interpretation checks.
 *
 * SCAFFOLD ONLY. Returns mocked output regardless of env state when the
 * gates would let a real call through. The real Perplexity API call is
 * deferred — see TODO(prod-integration) below.
 *
 * Gating ladder:
 *   1. ENABLE_AI_VALIDATORS !== "true"  → status: "skipped"
 *   2. PERPLEXITY_API_KEY not set      → status: "unavailable"
 *   3. Both gates open                 → MOCK_RESPONSE (status: "passed")
 *
 * Deterministic scoring remains canonical. This validator never alters
 * the GeoViz score. Of the four runnable providers Perplexity is the
 * one most likely to populate `cited_sources` in real responses.
 */

import type {
  AiValidator,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "perplexity";
const REQUIRED_ENV_VARS = ["PERPLEXITY_API_KEY"] as const;

function isMasterEnabled(): boolean {
  return process.env.ENABLE_AI_VALIDATORS === "true";
}

function missingKeys(): string[] {
  return REQUIRED_ENV_VARS.filter(
    (k) => typeof process.env[k] !== "string" || process.env[k]!.length === 0,
  );
}

const MOCK_RESPONSE: NormalizedValidationOutput = {
  provider: PROVIDER_NAME,
  status: "passed",
  business_understanding_score: 81,
  category_confidence: "high",
  service_area_confidence: "high",
  recommendation_confidence: "medium",
  missing_facts: ["pricing not surfaced"],
  cited_sources: [
    "https://example.com/about (homepage)",
    "https://example.com/services",
  ],
  raw_summary:
    "[MOCK] Perplexity validator placeholder — real API call deferred",
  error: null,
};

export const PerplexityValidator: AiValidator = {
  name: PROVIDER_NAME,
  requiredEnvVars: REQUIRED_ENV_VARS,
  enabled(): boolean {
    return isMasterEnabled() && missingKeys().length === 0;
  },
  async validateBusiness(
    _input: ValidationInput,
  ): Promise<NormalizedValidationOutput> {
    if (!isMasterEnabled()) {
      return {
        provider: PROVIDER_NAME,
        status: "skipped",
        business_understanding_score: null,
        category_confidence: null,
        service_area_confidence: null,
        recommendation_confidence: null,
        missing_facts: [],
        cited_sources: [],
        raw_summary: "[skipped] ENABLE_AI_VALIDATORS is not 'true'",
        error: null,
      };
    }
    const missing = missingKeys();
    if (missing.length > 0) {
      return {
        provider: PROVIDER_NAME,
        status: "unavailable",
        business_understanding_score: null,
        category_confidence: null,
        service_area_confidence: null,
        recommendation_confidence: null,
        missing_facts: [],
        cited_sources: [],
        raw_summary: `[unavailable] Required env var(s) missing: ${missing.join(", ")}`,
        error: `${missing.join(", ")} not set`,
      };
    }
    // TODO(prod-integration): replace MOCK_RESPONSE with a real
    // Perplexity API call. Read PERPLEXITY_API_KEY from process.env.
    // Map the response into NormalizedValidationOutput; Perplexity
    // typically returns citations — wire them into `cited_sources`.
    return MOCK_RESPONSE;
  },
};
