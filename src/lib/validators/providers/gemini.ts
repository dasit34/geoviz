/**
 * GeminiValidator — placeholder for cross-model interpretation checks.
 *
 * SCAFFOLD ONLY. Returns mocked output regardless of env state when the
 * gates would let a real call through. The real Gemini API call is
 * deferred — see TODO(prod-integration) below.
 *
 * Gating ladder:
 *   1. ENABLE_AI_VALIDATORS !== "true"  → status: "skipped"
 *   2. GEMINI_API_KEY not set          → status: "unavailable"
 *   3. Both gates open                 → MOCK_RESPONSE (status: "passed")
 *
 * Deterministic scoring remains canonical. This validator never alters
 * the GeoViz score.
 */

import type {
  AiValidator,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "gemini";
const REQUIRED_ENV_VARS = ["GEMINI_API_KEY"] as const;

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
  business_understanding_score: 65,
  category_confidence: "medium",
  service_area_confidence: "low",
  recommendation_confidence: "low",
  missing_facts: [
    "service area not described",
    "no testimonials visible to crawler",
    "business hours absent",
  ],
  cited_sources: [],
  raw_summary: "[MOCK] Gemini validator placeholder — real API call deferred",
  error: null,
};

export const GeminiValidator: AiValidator = {
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
    // TODO(prod-integration): replace MOCK_RESPONSE with a real Gemini
    // API call. Read GEMINI_API_KEY from process.env. Map the response
    // into NormalizedValidationOutput.
    return MOCK_RESPONSE;
  },
};
