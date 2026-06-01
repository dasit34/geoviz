/**
 * ClaudeValidator — REAL cross-model interpretation check.
 *
 * Uses the Anthropic Messages API via the `@anthropic-ai/sdk` package
 * (already a dependency, used by `scripts/geo-worker.ts`). Structured
 * output is enforced via tool-use with `input_schema` — Anthropic's
 * canonical strict-schema mechanism. `tool_choice: { type: "tool", … }`
 * forces the model to call the tool, which means it MUST return
 * arguments matching the input_schema. Functionally equivalent to
 * OpenAI's `response_format: { type: "json_schema", strict: true }`.
 *
 * IMPORTANT — the deterministic GeoViz scoring engine in
 * `src/lib/scoring/` remains canonical. This validator NEVER alters
 * the GeoViz score. The deterministic score is passed to Claude as
 * read-only context; the prompt explicitly forbids commenting on or
 * modifying it.
 *
 * Gating ladder:
 *   1. ANTHROPIC_API_KEY not set        → status: "unavailable"
 *   2. CLAUDE_VALIDATOR_FIXTURE=true    → MOCK_RESPONSE (test-only)
 *   3. Otherwise                        → real Anthropic call
 *
 * Rules per scaffold contract:
 *   - 15s timeout via AbortSignal.timeout
 *   - tool-use + input_schema (strict structured output)
 *   - errors caught → status: "failed", error message captured
 *   - no provider-specific response shape leaks past the validator
 *   - no console logging of the API key, request body, or response
 *
 * Test-only env: `CLAUDE_VALIDATOR_FIXTURE`
 *   When set to "true", the provider returns MOCK_RESPONSE WITHOUT
 *   making a network call. Production must NEVER set this. Used by
 *   `scripts/test-ai-validators.ts` Scenarios 3 + 4 to keep the test
 *   suite hermetic (no real Anthropic calls during `npm test`).
 */

import Anthropic from "@anthropic-ai/sdk";

import type {
  AiValidator,
  ConfidenceLevel,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "claude";
const REQUIRED_ENV_VARS = ["ANTHROPIC_API_KEY"] as const;

// Model + parameters isolated in this file so future swaps are
// one-line changes. Haiku selected for cost + latency (validator is
// checking interpretation, not generating reports).
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";
const CLAUDE_TIMEOUT_MS = 15_000;
const CLAUDE_MAX_TOKENS = 1024;
const CLAUDE_TEMPERATURE = 0.1;

const VALIDATOR_TOOL_NAME = "report_validator_findings";
const VALIDATOR_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    business_understanding_score: {
      type: "number",
      description: "0-100; how clearly the page conveys what the business does",
    },
    category_confidence: {
      type: "number",
      description:
        "0-100; how confidently the business category can be named from the evidence",
    },
    service_area_confidence: {
      type: "number",
      description: "0-100; how confidently the service area can be named",
    },
    recommendation_confidence: {
      type: "number",
      description:
        "0-100; how likely an AI system would be to recommend this business",
    },
    missing_facts: {
      type: "array",
      items: { type: "string" },
      description:
        "Facts an AI would need to improve interpretation. Empty array if none.",
    },
    cited_sources: {
      type: "array",
      items: { type: "string" },
      description:
        "URLs evident in the provided context. Empty array if none.",
    },
    raw_summary: {
      type: "string",
      description: "One or two sentences summarizing the interpretation.",
    },
  },
  required: [
    "business_understanding_score",
    "category_confidence",
    "service_area_confidence",
    "recommendation_confidence",
    "missing_facts",
    "cited_sources",
    "raw_summary",
  ],
};

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
  raw_summary: "[MOCK] Claude validator placeholder — fixture mode active",
  error: null,
};

type ClaudeToolInput = {
  business_understanding_score?: number;
  category_confidence?: number;
  service_area_confidence?: number;
  recommendation_confidence?: number;
  missing_facts?: unknown[];
  cited_sources?: unknown[];
  raw_summary?: string;
};

function numericToConfidence(n: unknown): ConfidenceLevel {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n <= 33) return "low";
  if (n <= 66) return "medium";
  return "high";
}

function clampScore(n: unknown): number | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function buildPrompt(input: ValidationInput): { system: string; user: string } {
  // Schema enforcement happens at the tool layer, so the system prompt
  // focuses on the SEMANTIC task: do not alter the deterministic score,
  // estimate confidences on 0-100 scales, surface missing facts.
  const system =
    "You are reporting how an AI system interprets a business given a " +
    "deterministic GeoViz audit score. The score has ALREADY been " +
    "computed and is canonical — do NOT alter, recompute, or comment " +
    "on it. Estimate, on 0-100 scales:\n" +
    "  - business_understanding_score: how clearly the page conveys " +
    "what the business does\n" +
    "  - category_confidence: how confidently you can name the business " +
    "category from the provided evidence\n" +
    "  - service_area_confidence: how confidently you can name the " +
    "service area\n" +
    "  - recommendation_confidence: how likely an AI system would be " +
    "to recommend this business for a relevant local-query\n" +
    "Report missing_facts the AI would need to improve interpretation. " +
    "Populate cited_sources only with specific URLs evident in the " +
    "provided context (empty array otherwise). Keep raw_summary to " +
    "one or two sentences. Invoke the report_validator_findings tool " +
    "with your structured analysis.";

  const user =
    `Business name: ${input.businessName ?? "(not provided)"}\n` +
    `URL: ${input.url}\n\n` +
    "Deterministic GeoViz audit score (canonical, do not modify):\n" +
    `${JSON.stringify(input.deterministicScore)}\n\n` +
    "Category scores:\n" +
    `${JSON.stringify(input.categoryScores)}\n\n` +
    "Extracted evidence:\n" +
    `${JSON.stringify(input.extractedEvidence)}\n\n` +
    "Report context:\n" +
    `${JSON.stringify(input.reportContext)}`;

  return { system, user };
}

function failedOutput(message: string): NormalizedValidationOutput {
  return {
    provider: PROVIDER_NAME,
    status: "failed",
    business_understanding_score: null,
    category_confidence: null,
    service_area_confidence: null,
    recommendation_confidence: null,
    missing_facts: [],
    cited_sources: [],
    raw_summary: `[failed] Claude validator: ${message}`,
    error: message,
  };
}

export const ClaudeValidator: AiValidator = {
  name: PROVIDER_NAME,
  requiredEnvVars: REQUIRED_ENV_VARS,
  enabled(): boolean {
    return missingKeys().length === 0;
  },
  async validateBusiness(
    input: ValidationInput,
  ): Promise<NormalizedValidationOutput> {
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

    // Test-only fixture-mode escape. Production must never set this.
    if (process.env.CLAUDE_VALIDATOR_FIXTURE === "true") {
      return MOCK_RESPONSE;
    }

    try {
      const { system, user } = buildPrompt(input);
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });

      const response = await client.messages.create(
        {
          model: CLAUDE_MODEL,
          max_tokens: CLAUDE_MAX_TOKENS,
          temperature: CLAUDE_TEMPERATURE,
          system,
          tools: [
            {
              name: VALIDATOR_TOOL_NAME,
              description:
                "Report how an AI system interprets the business given the deterministic GeoViz audit context.",
              input_schema: VALIDATOR_INPUT_SCHEMA,
            },
          ],
          tool_choice: { type: "tool", name: VALIDATOR_TOOL_NAME },
          messages: [{ role: "user", content: user }],
        },
        { signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS) },
      );

      // Find the tool_use content block. With tool_choice forcing the
      // tool, Claude must return one; absence means refusal-equivalent.
      const toolUse = response.content.find(
        (block) => block.type === "tool_use",
      );
      if (!toolUse || toolUse.type !== "tool_use") {
        return failedOutput(
          "Claude did not return a tool_use block (refusal-equivalent)",
        );
      }
      if (toolUse.name !== VALIDATOR_TOOL_NAME) {
        return failedOutput(
          `Claude returned unexpected tool '${toolUse.name}'`,
        );
      }

      const parsed = toolUse.input as ClaudeToolInput;

      // Defensive post-parse sanity check. Tool-use with input_schema
      // SHOULD guarantee all required fields present + correctly typed,
      // but verify before propagating into NormalizedValidationOutput.
      const isFiniteNumber = (v: unknown): boolean =>
        typeof v === "number" && Number.isFinite(v);
      if (
        !isFiniteNumber(parsed.business_understanding_score) ||
        !isFiniteNumber(parsed.category_confidence) ||
        !isFiniteNumber(parsed.service_area_confidence) ||
        !isFiniteNumber(parsed.recommendation_confidence) ||
        typeof parsed.raw_summary !== "string" ||
        !Array.isArray(parsed.missing_facts) ||
        !Array.isArray(parsed.cited_sources)
      ) {
        return failedOutput("Claude response failed schema validation");
      }

      return {
        provider: PROVIDER_NAME,
        status: "passed",
        business_understanding_score: clampScore(
          parsed.business_understanding_score,
        ),
        category_confidence: numericToConfidence(parsed.category_confidence),
        service_area_confidence: numericToConfidence(
          parsed.service_area_confidence,
        ),
        recommendation_confidence: numericToConfidence(
          parsed.recommendation_confidence,
        ),
        missing_facts: asStringArray(parsed.missing_facts),
        cited_sources: asStringArray(parsed.cited_sources),
        raw_summary:
          typeof parsed.raw_summary === "string"
            ? parsed.raw_summary
            : "[Claude returned no summary]",
        error: null,
      };
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const msg = err.message ?? "(no message)";
        return failedOutput(
          `Anthropic API ${err.status ?? "?"}: ${msg.slice(0, 200)}`,
        );
      }
      const e = err as Error;
      const isTimeout =
        e.name === "TimeoutError" || /aborted/i.test(e.message ?? "");
      const reason = isTimeout
        ? `Timeout after ${CLAUDE_TIMEOUT_MS}ms`
        : `${e.name ?? "Error"}: ${e.message ?? String(err)}`;
      return failedOutput(reason);
    }
  },
};
