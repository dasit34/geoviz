/**
 * Test-only fixture validator. Returns a canned NormalizedValidationOutput
 * so the orchestrator's "no mutation" + "registry-order" + "pass-through"
 * behaviors can be exercised without touching real providers or env.
 *
 * Intentionally NOT re-exported from `@/lib/validators/index`. Tests
 * import this directly via `@/lib/validators/testing/mockValidator`.
 */

import type {
  AiValidator,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

export function createMockValidator(
  name: string,
  overrides: Partial<NormalizedValidationOutput> = {},
): AiValidator {
  const base: NormalizedValidationOutput = {
    provider: name,
    status: "passed",
    business_understanding_score: 50,
    category_confidence: "medium",
    service_area_confidence: "medium",
    recommendation_confidence: "medium",
    missing_facts: [],
    cited_sources: [],
    raw_summary: `[test-fixture] mock validator ${name}`,
    error: null,
  };

  return {
    name,
    requiredEnvVars: [] as const,
    enabled: () => true,
    async validateBusiness(
      _input: ValidationInput,
    ): Promise<NormalizedValidationOutput> {
      // Spread overrides last so callers can stamp any field.
      return { ...base, ...overrides, provider: name };
    },
  };
}
