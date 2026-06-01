/**
 * OpenAIValidator — REAL cross-model interpretation check.
 *
 * Calls the OpenAI Chat Completions API to ask how an AI system
 * interprets the business given the deterministic GeoViz audit
 * context. Returns the answer as a NormalizedValidationOutput.
 *
 * IMPORTANT — the deterministic GeoViz scoring engine in
 * `src/lib/scoring/` remains canonical. This validator NEVER alters
 * the GeoViz score. The deterministic score is passed to OpenAI as
 * read-only context; the prompt explicitly forbids commenting on or
 * modifying it.
 *
 * Gating ladder:
 *   1. OPENAI_API_KEY not set           → status: "unavailable"
 *   2. OPENAI_VALIDATOR_FIXTURE=true    → MOCK_RESPONSE (test-only escape)
 *   3. Otherwise                        → real OpenAI call
 *
 * Rules per scaffold contract:
 *   - 15s timeout via AbortSignal.timeout
 *   - temperature: 0.1 (low, near-deterministic)
 *   - response_format: structured outputs with strict JSON Schema
 *     (OpenAI guarantees server-side that the response matches the
 *     declared schema — all required fields present, no extras,
 *     types exact). Numeric ranges are clamped client-side since
 *     JSON Schema strict mode does not allow minimum/maximum.
 *   - safety refusals (message.refusal) → status: "failed"
 *   - errors caught → status: "failed", error message captured
 *   - no markdown / no chain-of-thought / no provider SDK
 *   - no console logging of the API key, request body, or response
 *
 * Test-only env: `OPENAI_VALIDATOR_FIXTURE`
 *   When set to "true", the provider returns MOCK_RESPONSE WITHOUT
 *   making a network call. Production must NEVER set this. Used by
 *   `scripts/test-ai-validators.ts` Scenarios 3 + 4 to keep the test
 *   suite hermetic (no real OpenAI calls during `npm test`).
 */

import type {
  AiValidator,
  ConfidenceLevel,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "openai";
const REQUIRED_ENV_VARS = ["OPENAI_API_KEY"] as const;

// Model is isolated in this file so future swaps are a one-line change.
const OPENAI_MODEL = "gpt-4.1-mini";
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = 15_000;
const OPENAI_TEMPERATURE = 0.1;

// Strict JSON Schema enforced server-side by OpenAI's structured-outputs
// response format. Guarantees: every key in `required` is present, no
// additional keys (`additionalProperties: false`), types match exactly.
// JSON Schema's `minimum`/`maximum` keywords are NOT allowed in OpenAI
// strict mode — numeric 0..100 ranges are enforced client-side via
// `clampScore()` and `numericToConfidence()` below.
const OPENAI_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
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
  properties: {
    business_understanding_score: { type: "number" },
    category_confidence: { type: "number" },
    service_area_confidence: { type: "number" },
    recommendation_confidence: { type: "number" },
    missing_facts: { type: "array", items: { type: "string" } },
    cited_sources: { type: "array", items: { type: "string" } },
    raw_summary: { type: "string" },
    industry_identified: { type: "string" },
    location_identified: { type: "string" },
    services_identified: { type: "array", items: { type: "string" } },
    would_recommend: { type: "string", enum: ["YES", "PARTIAL", "NO"] },
    recommendation_reason: { type: "string" },
  },
} as const;

function missingKeys(): string[] {
  return REQUIRED_ENV_VARS.filter(
    (k) => typeof process.env[k] !== "string" || process.env[k]!.length === 0,
  );
}

const MOCK_RESPONSE: NormalizedValidationOutput = {
  provider: PROVIDER_NAME,
  status: "passed",
  business_understanding_score: 72,
  category_confidence: "high",
  service_area_confidence: "low",
  recommendation_confidence: "medium",
  missing_facts: ["service area boundary not explicit", "pricing not stated"],
  cited_sources: [],
  raw_summary: "[MOCK] OpenAI validator placeholder — fixture mode active",
  error: null,
  industry_identified: "Roofing contractor",
  location_identified: "Toledo, OH area",
  services_identified: [
    "Roof installation",
    "Roof repair",
    "Storm damage assessment",
  ],
  would_recommend: "PARTIAL",
  recommendation_reason:
    "Identifiable roofing offering but service area definition is thin.",
};

// JSON shape OpenAI is asked to return. Confidence fields come back as
// 0-100 numbers and get mapped into the NormalizedValidationOutput's
// "low" | "medium" | "high" | null enum below.
type OpenAIJsonResponse = {
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
  // Structured outputs enforce the JSON shape server-side, so the
  // system prompt focuses on the SEMANTIC task: do not alter the
  // deterministic score, estimate the four confidences on 0-100 scales,
  // report missing facts + citable sources, keep raw_summary brief.
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
    "explaining the would_recommend verdict.";

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
    raw_summary: `[failed] OpenAI validator: ${message}`,
    error: message,
  };
}

export const OpenAIValidator: AiValidator = {
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
    // Lets the test suite exercise the "key present + master gate on"
    // path without burning OpenAI credits or requiring network.
    if (process.env.OPENAI_VALIDATOR_FIXTURE === "true") {
      return MOCK_RESPONSE;
    }

    try {
      const { system, user } = buildPrompt(input);
      const response = await fetch(OPENAI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "geoviz_validator_response",
              strict: true,
              schema: OPENAI_JSON_SCHEMA,
            },
          },
          temperature: OPENAI_TEMPERATURE,
        }),
        signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return failedOutput(
          `HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string; refusal?: string | null };
        }>;
      };
      const message = data.choices?.[0]?.message;

      // Structured-outputs safety refusal — when OpenAI's safety system
      // declines to comply with the request, `message.refusal` is set
      // instead of `message.content`. Convert to status:"failed" with
      // a safe (truncated, non-leaky) error message.
      const refusal = message?.refusal;
      if (typeof refusal === "string" && refusal.length > 0) {
        return failedOutput(
          `OpenAI safety refusal: ${refusal.slice(0, 200)}`,
        );
      }

      const content = message?.content;
      if (!content) {
        return failedOutput("OpenAI returned empty content");
      }

      let parsed: OpenAIJsonResponse;
      try {
        parsed = JSON.parse(content) as OpenAIJsonResponse;
      } catch (parseErr) {
        const e = parseErr as Error;
        return failedOutput(`JSON parse error: ${e.message ?? "unknown"}`);
      }

      // Defensive post-parse sanity check. Strict mode SHOULD guarantee
      // every required field is present and correctly typed, but verify
      // before propagating into NormalizedValidationOutput. Any
      // inconsistency is treated as a schema validation failure with a
      // clean error message (no body / no key leak).
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
        return failedOutput(
          "OpenAI response failed schema validation",
        );
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
            : "[OpenAI returned no summary]",
        error: null,
        industry_identified: asNonEmptyString(parsed.industry_identified),
        location_identified: asNonEmptyString(parsed.location_identified),
        services_identified: asOptionalStringArray(parsed.services_identified),
        would_recommend: asYesPartialNo(parsed.would_recommend),
        recommendation_reason: asNonEmptyString(parsed.recommendation_reason),
      };
    } catch (err) {
      const e = err as Error;
      const isTimeout =
        e.name === "TimeoutError" || /aborted/i.test(e.message ?? "");
      const reason = isTimeout
        ? `Timeout after ${OPENAI_TIMEOUT_MS}ms`
        : `${e.name ?? "Error"}: ${e.message ?? String(err)}`;
      return failedOutput(reason);
    }
  },
};
