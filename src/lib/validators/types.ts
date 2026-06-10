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
  // ─── Rich understanding fields (optional; legacy records lack these)
  // Reify what the system prompts already implicitly ask for in
  // raw_summary — what the AI system identifies about the business.
  // Render layer falls back to compact verdict layout when all five
  // are absent (legacy audits).
  industry_identified?: string;
  location_identified?: string;
  services_identified?: string[];
  would_recommend?: "YES" | "PARTIAL" | "NO";
  recommendation_reason?: string;
  // ─── AI Answer Graph capture layer (additive; all optional) ─────────
  // Future-value ("moat") data recorded on every audit. NOT read by the
  // consensus layer, NOT customer-facing, NOT involved in scoring. Legacy
  // records lack these. See `./capture.ts`.
  /** Exact model id used for the validation call (e.g. "gpt-4.1-mini"). */
  model?: string;
  /** Resolved/snapshot model id from the API response, when exposed; else null. */
  model_version?: string | null;
  /** Exact prompt sent for the validation call (system + user, verbatim). */
  prompt_text?: string;
  /** Versions the capture prompt set, e.g. "capture@1.0.0". */
  prompt_version?: string;
  /** Full verbatim model response for the validation call (vs. the short raw_summary). */
  raw_response_text?: string;
  /** ISO timestamp of when this answer was retrieved. */
  answer_retrieved_at?: string;
  /** Bare hostnames parsed from cited_sources (derive-at-capture). */
  cited_source_domains?: string[];
  /** Buyer-intent competitive query capture (which businesses the model names). */
  competitive?: CompetitiveCapture | null;
};

/**
 * Captured output of the buyer-intent "competitive" query — the model's
 * answer to "who are the best providers in this category/area" plus whether
 * the subject business was named. Stored inside `aiValidations`; never
 * rendered to customers and never fed into the consensus index.
 */
export type CompetitiveCapture = {
  /** The competitive prompt sent (verbatim-ish; user portion). */
  query_text: string;
  prompt_version: string;
  /** Verbatim provider output for the competitive query (durable, re-parseable). */
  raw_response: string;
  inferred_category: string | null;
  inferred_location: string | null;
  /** Business names the model named for the category/area. */
  entities: string[];
  /** Whether the subject business was among them (null when unknown). */
  business_named: boolean | null;
  model: string;
  model_version: string | null;
  retrieved_at: string;
  status: ValidationStatus;
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
  /** Capture-layer version stamp for future ETL. Optional on legacy records. */
  capture_version?: string;
};
