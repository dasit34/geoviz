/**
 * GoogleAIOverviewValidator — PERMANENT PLACEHOLDER.
 *
 * Google AI Overviews has no public API at the time of this scaffold.
 * This provider always returns `status: "unavailable"` regardless of
 * env state. It exists in the registry so the validator layer's
 * "one row per provider" output shape stays stable when Google later
 * (if ever) exposes a programmatic surface.
 *
 * Do NOT add an API call here unless / until Google publishes a stable
 * public endpoint AND the operator decides to wire it up. The default
 * stance is "this provider cannot run."
 *
 * Deterministic scoring remains canonical. This placeholder contributes
 * nothing to the GeoViz score.
 */

import type {
  AiValidator,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "google_ai_overview";

const PLACEHOLDER_OUTPUT: NormalizedValidationOutput = {
  provider: PROVIDER_NAME,
  status: "unavailable",
  business_understanding_score: null,
  category_confidence: null,
  service_area_confidence: null,
  recommendation_confidence: null,
  missing_facts: [],
  cited_sources: [],
  raw_summary:
    "[unavailable] Google AI Overviews has no public API — permanent placeholder",
  error: "no public API",
};

export const GoogleAIOverviewValidator: AiValidator = {
  name: PROVIDER_NAME,
  requiredEnvVars: [] as const,
  enabled(): boolean {
    return false; // permanent — no public API to call
  },
  async validateBusiness(
    _input: ValidationInput,
  ): Promise<NormalizedValidationOutput> {
    // No env gating here — this provider is permanently unavailable.
    // TODO(prod-integration): if Google ever ships a public AI Overview
    // API, replace PLACEHOLDER_OUTPUT with a real call. Until then this
    // file should not change.
    return PLACEHOLDER_OUTPUT;
  },
};
