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
    industry_identified: {
      type: "string",
      description:
        "Business category/industry as a customer-facing string (e.g. 'Roofing contractor', 'Family dentistry').",
    },
    location_identified: {
      type: "string",
      description:
        "Geographic service area as a customer-facing string (e.g. 'Toledo, OH metro', 'Statewide', 'Not specified').",
    },
    services_identified: {
      type: "array",
      items: { type: "string" },
      description:
        "3-5 specific services the business offers as customer-facing strings. Empty array if none identified.",
    },
    would_recommend: {
      type: "string",
      enum: ["YES", "PARTIAL", "NO"],
      description:
        "Whether you would comfortably recommend this business to a customer searching for this service today.",
    },
    recommendation_reason: {
      type: "string",
      description:
        "One sentence explaining the would_recommend verdict in customer-facing language.",
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
    "industry_identified",
    "location_identified",
    "services_identified",
    "would_recommend",
    "recommendation_reason",
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
  industry_identified: "Roofing contractor",
  location_identified: "Toledo, OH metro",
  services_identified: [
    "Residential roof replacement",
    "Storm damage repair",
    "Gutter installation",
  ],
  would_recommend: "PARTIAL",
  recommendation_reason:
    "Clear service offering but limited trust signals make a confident recommendation harder.",
};

type ClaudeToolInput = {
  business_understanding_score?: number;
  category_confidence?: number;
  service_area_confidence?: number;
  recommendation_confidence?: number;
  missing_facts?: unknown[];
  cited_sources?: unknown[];
  raw_summary?: string;
  industry_identified?: string;
  location_identified?: string;
  services_identified?: unknown[];
  would_recommend?: string;
  recommendation_reason?: string;
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

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asYesPartialNo(
  value: unknown,
): "YES" | "PARTIAL" | "NO" | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toUpperCase();
  if (v === "YES" || v === "PARTIAL" || v === "NO") return v;
  return undefined;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return cleaned.length > 0 ? cleaned : undefined;
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
    "one or two sentences.\n\n" +
    "Additionally extract, in customer-facing language (no jargon, no " +
    "JSON terminology):\n" +
    "  - industry_identified: the business category as you would " +
    "describe it to a customer (e.g. 'Roofing contractor', 'Family " +
    "dentistry', 'Commercial HVAC service').\n" +
    "  - location_identified: the service area as you would describe " +
    "it to a customer (e.g. 'Toledo, OH metro', 'Statewide', or " +
    "'Not specified on the site').\n" +
    "  - services_identified: 3-5 specific services the business " +
    "appears to offer, written as customer-readable phrases.\n" +
    "  - would_recommend: exactly YES, PARTIAL, or NO — whether you " +
    "would comfortably recommend this business to a customer today.\n" +
    "  - recommendation_reason: one customer-facing sentence " +
    "explaining the would_recommend verdict.\n" +
    "Invoke the report_validator_findings tool with your structured " +
    "analysis.";

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
        industry_identified: asNonEmptyString(parsed.industry_identified),
        location_identified: asNonEmptyString(parsed.location_identified),
        services_identified: asOptionalStringArray(parsed.services_identified),
        would_recommend: asYesPartialNo(parsed.would_recommend),
        recommendation_reason: asNonEmptyString(parsed.recommendation_reason),
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
