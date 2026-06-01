/**
 * AI validator orchestration.
 *
 * Runs every provider in `VALIDATOR_REGISTRY` and returns a
 * `ValidationLayerResult` containing one normalized output per
 * provider, in registry order. Never throws — a provider that throws
 * gets converted into a `status: "failed"` output with the error
 * message captured.
 *
 * The orchestrator does NOT mutate provider output. Whatever a
 * provider returns is what appears in the result array.
 *
 * Wired into production via `persistAuditIntelligence` in
 * `src/lib/audit-intelligence.ts`. Runs unconditionally on every
 * audit; per-provider fail-soft is handled inside each validator
 * when its `*_API_KEY` is absent (returns `status: "unavailable"`).
 *
 * @see ./types.ts for the input/output contracts
 * @see ./registry.ts for the provider order
 * @see ./providers/* for each provider's gating ladder and mock
 */

import { VALIDATOR_REGISTRY } from "./registry";
import { devLog } from "./devLog";
import type {
  NormalizedValidationOutput,
  ValidationInput,
  ValidationLayerResult,
} from "./types";

export async function runAiValidationLayer(
  input: ValidationInput,
): Promise<ValidationLayerResult> {
  const outputs: NormalizedValidationOutput[] = [];
  for (const validator of VALIDATOR_REGISTRY) {
    try {
      const output = await validator.validateBusiness(input);
      outputs.push(output);
    } catch (err) {
      const e = err as Error;
      outputs.push({
        provider: validator.name,
        status: "failed",
        business_understanding_score: null,
        category_confidence: null,
        service_area_confidence: null,
        recommendation_confidence: null,
        missing_facts: [],
        cited_sources: [],
        raw_summary: `[failed] ${e.name ?? "Error"}: ${e.message ?? String(err)}`,
        error: e.message ?? String(err),
      });
    }
  }

  const result: ValidationLayerResult = {
    outputs,
    ran_at: new Date().toISOString(),
  };

  // Dev-only log per scaffold contract. No-op in production. Never
  // writes to disk or the database.
  devLog(result);

  return result;
}
