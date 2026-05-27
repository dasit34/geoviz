/**
 * ClaudeValidator — placeholder for cross-model interpretation checks.
 *
 * SCAFFOLD ONLY. Returns mocked output regardless of env state when the
 * master gate + API key gates would let a real call through. The real
 * Anthropic API call is deferred — see TODO(prod-integration) below.
 *
 * Gating ladder:
 *   1. ENABLE_AI_VALIDATORS !== "true"  → status: "skipped"
 *   2. ANTHROPIC_API_KEY not set       → status: "unavailable"
 *   3. Both gates open                 → MOCK_RESPONSE (status: "passed")
 *
 * GeoViz's deterministic scoring engine in `src/lib/scoring/` remains
 * the canonical source of truth. This validator never alters, replaces,
 * or contributes to the score — it only reports how Claude interprets
 * the business given the deterministic score.
 */

import type {
  AiValidator,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "claude";
const REQUIRED_ENV_VARS = ["ANTHROPIC_API_KEY"] as const;

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
  business_understanding_score: 78,
  category_confidence: "high",
  service_area_confidence: "medium",
  recommendation_confidence: "medium",
  missing_facts: [
    "service area boundary not explicit",
    "hours of operation",
  ],
  cited_sources: [],
  raw_summary: "[MOCK] Claude validator placeholder — real API call deferred",
  error: null,
};

export const ClaudeValidator: AiValidator = {
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
    // TODO(prod-integration): replace MOCK_RESPONSE with a real Claude
    // API call. Read ANTHROPIC_API_KEY from process.env, send a
    // structured prompt asking the model what the business does, who
    // it serves, whether it would recommend the business, and what
    // facts are missing. Map the response into NormalizedValidationOutput.
    return MOCK_RESPONSE;
  },
};
