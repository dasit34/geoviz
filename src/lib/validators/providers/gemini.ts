/**
 * GeminiValidator — REAL cross-model interpretation check.
 *
 * Uses Google's Generative Language API (v1beta) via raw fetch().
 * Structured output is enforced via `generationConfig.responseSchema`
 * with `responseMimeType: "application/json"` — Gemini's strict
 * structured-output mechanism. The schema uses OpenAPI 3.0 type
 * names (uppercase OBJECT / STRING / NUMBER / ARRAY), different from
 * JSON Schema's lowercase variants used by OpenAI's response_format.
 *
 * IMPORTANT — the deterministic GeoViz scoring engine in
 * `src/lib/scoring/` remains canonical. This validator NEVER alters
 * the GeoViz score. The deterministic score is passed to Gemini as
 * read-only context.
 *
 * Gating ladder:
 *   1. GEMINI_API_KEY not set           → status: "unavailable"
 *   2. GEMINI_VALIDATOR_FIXTURE=true    → MOCK_RESPONSE (test-only)
 *   3. Otherwise                        → real Gemini call
 *
 * Rules per scaffold contract:
 *   - 15s timeout via AbortSignal.timeout
 *   - responseSchema enforces structured output server-side
 *   - safety / recitation finishReason → status: "failed"
 *   - prompt-level block (promptFeedback.blockReason) → status: "failed"
 *   - errors caught → status: "failed", error message captured
 *   - no SDK / no provider lib — raw fetch only
 *   - no console logging of API key, headers, or response body
 *
 * Test-only env: `GEMINI_VALIDATOR_FIXTURE`
 *   When set to "true", returns MOCK_RESPONSE without making a
 *   network call. Production must NEVER set this. Used by
 *   `scripts/test-ai-validators.ts` Scenarios 3 + 4 to keep the test
 *   suite hermetic (no real Gemini calls during `npm test`).
 */

import { readApiKey } from "../apiKey";
import type {
  AiValidator,
  ConfidenceLevel,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "gemini";
const REQUIRED_ENV_VARS = ["GEMINI_API_KEY"] as const;

// Model + parameters isolated in this file so future swaps are
// one-line changes. gemini-2.5-flash selected for cost + latency
// (validator is checking interpretation, not generating reports).
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GEMINI_TIMEOUT_MS = 15_000;
const GEMINI_TEMPERATURE = 0.1;

// OpenAPI 3.0 schema (Gemini's expected shape — uppercase type names,
// distinct from OpenAI's JSON Schema). Structured-output mode pins
// every required field and forbids extras when combined with
// `responseMimeType: "application/json"`.
const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    business_understanding_score: { type: "NUMBER" },
    category_confidence: { type: "NUMBER" },
    service_area_confidence: { type: "NUMBER" },
    recommendation_confidence: { type: "NUMBER" },
    missing_facts: { type: "ARRAY", items: { type: "STRING" } },
    cited_sources: { type: "ARRAY", items: { type: "STRING" } },
    raw_summary: { type: "STRING" },
    industry_identified: { type: "STRING" },
    location_identified: { type: "STRING" },
    services_identified: { type: "ARRAY", items: { type: "STRING" } },
    would_recommend: { type: "STRING", enum: ["YES", "PARTIAL", "NO"] },
    recommendation_reason: { type: "STRING" },
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
} as const;

function missingKeys(): string[] {
  return REQUIRED_ENV_VARS.filter((k) => readApiKey(k) === null);
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
  raw_summary: "[MOCK] Gemini validator placeholder — fixture mode active",
  error: null,
  industry_identified: "Roofing contractor",
  location_identified: "Not specified on the site",
  services_identified: ["Roofing services"],
  would_recommend: "NO",
  recommendation_reason:
    "Limited trust signals and unclear service area make a confident recommendation hard.",
};

type GeminiJsonResponse = {
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
  // Same semantic prompt shape as OpenAI + Claude — schema enforcement
  // handles the structural part.
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
    raw_summary: `[failed] Gemini validator: ${message}`,
    error: message,
  };
}

export const GeminiValidator: AiValidator = {
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
    if (process.env.GEMINI_VALIDATOR_FIXTURE === "true") {
      return MOCK_RESPONSE;
    }

    try {
      const { system, user } = buildPrompt(input);
      const response = await fetch(GEMINI_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": readApiKey("GEMINI_API_KEY")!,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: {
            temperature: GEMINI_TEMPERATURE,
            responseMimeType: "application/json",
            responseSchema: GEMINI_RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return failedOutput(
          `HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
        );
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        promptFeedback?: { blockReason?: string };
      };

      // Prompt-level safety block — Gemini refused before generating.
      const promptBlock = data.promptFeedback?.blockReason;
      if (promptBlock) {
        return failedOutput(`Gemini prompt blocked: ${promptBlock}`);
      }

      const candidate = data.candidates?.[0];
      if (!candidate) {
        return failedOutput("Gemini returned no candidates");
      }

      // Safety / recitation refusal at the candidate level — Gemini
      // started generating but stopped for a non-success reason.
      const finishReason = candidate.finishReason;
      if (
        typeof finishReason === "string" &&
        finishReason !== "STOP" &&
        finishReason !== "MAX_TOKENS"
      ) {
        return failedOutput(`Gemini finishReason: ${finishReason}`);
      }

      const text = candidate.content?.parts?.[0]?.text;
      if (!text) {
        return failedOutput("Gemini returned empty content");
      }

      let parsed: GeminiJsonResponse;
      try {
        parsed = JSON.parse(text) as GeminiJsonResponse;
      } catch (parseErr) {
        const e = parseErr as Error;
        return failedOutput(`JSON parse error: ${e.message ?? "unknown"}`);
      }

      // Defensive post-parse sanity check. responseSchema SHOULD
      // guarantee all required fields are present and correctly
      // typed, but verify before propagating into NormalizedValidationOutput.
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
        return failedOutput("Gemini response failed schema validation");
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
            : "[Gemini returned no summary]",
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
        ? `Timeout after ${GEMINI_TIMEOUT_MS}ms`
        : `${e.name ?? "Error"}: ${e.message ?? String(err)}`;
      return failedOutput(reason);
    }
  },
};
