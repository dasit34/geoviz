/**
 * Internal type definitions for the AI validator scaffold.
 *
 * This module is NOT part of the public surface of `@/lib/validators`.
 * The public surface exports only `runAiValidationLayer`. These types
 * are imported directly by tests via `@/lib/validators/types` and by
 * the providers / orchestrator / registry inside the scaffold.
 */

/**
 * `skipped` is retained for backward compatibility with historical
 * `aiValidations` records persisted before the master-enable flag was
 * removed; new audits will only produce `passed | failed | unavailable`.
 */
export type ValidationStatus = "skipped" | "passed" | "failed" | "unavailable";

export type ConfidenceLevel = "low" | "medium" | "high" | null;

/**
 * Normalized output shape every provider returns. Shape is part of the
 * scaffold contract — changing it requires updating every provider AND
 * `scripts/test-ai-validators.ts`.
 */
export type NormalizedValidationOutput = {
  provider: string;
  status: ValidationStatus;
  business_understanding_score: number | null;
  category_confidence: ConfidenceLevel;
  service_area_confidence: ConfidenceLevel;
  recommendation_confidence: ConfidenceLevel;
  missing_facts: string[];
  cited_sources: string[];
  raw_summary: string;
  error: string | null;
};

/**
 * Input passed to every provider. Deliberately accepts opaque values
 * for the upstream-scoring artifacts (deterministicScore, categoryScores,
 * extractedEvidence, reportContext) — the validator layer does not
 * couple itself to the scoring engine's exact type shape so the
 * scoring engine can evolve without breaking the scaffold.
 */
export type ValidationInput = {
  businessName: string | null;
  url: string;
  deterministicScore: unknown;
  categoryScores: unknown;
  extractedEvidence: unknown;
  reportContext: unknown;
};

/**
 * Single validator's contract. Providers must:
 *   - report a stable `name` (used in NormalizedValidationOutput.provider)
 *   - declare which env vars they would need to run for real
 *   - implement `enabled()` so callers can predict gating
 *   - implement `validateBusiness(input)` returning the normalized output
 *
 * `enabled()` returns true when the provider's required env vars (its
 * `*_API_KEY`) are present. API-key presence is the single gate;
 * fixture-mode envs (`*_VALIDATOR_FIXTURE`) remain test-only.
 */
export type AiValidator = {
  name: string;
  enabled(): boolean;
  requiredEnvVars: readonly string[];
  validateBusiness(input: ValidationInput): Promise<NormalizedValidationOutput>;
};

/**
 * Aggregate result returned by `runAiValidationLayer`. The orchestrator
 * never throws — provider exceptions become a `status: "failed"` output
 * in the array.
 */
export type ValidationLayerResult = {
  outputs: NormalizedValidationOutput[];
  ran_at: string;
};
