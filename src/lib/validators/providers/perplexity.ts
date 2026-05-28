/**
 * PerplexityValidator — REAL cross-model interpretation check.
 *
 * Calls the Perplexity Chat Completions API (OpenAI-compatible) to
 * ask how an AI system interprets the business given the
 * deterministic GeoViz audit context. Returns the answer as a
 * NormalizedValidationOutput.
 *
 * IMPORTANT — the deterministic GeoViz scoring engine in
 * `src/lib/scoring/` remains canonical. This validator NEVER alters
 * the GeoViz score. The deterministic score is passed to Perplexity
 * as read-only context; the prompt explicitly forbids commenting
 * on or modifying it.
 *
 * Gating ladder:
 *   1. ENABLE_AI_VALIDATORS !== "true"      → status: "skipped"
 *   2. PERPLEXITY_API_KEY not set           → status: "unavailable"
 *   3. PERPLEXITY_VALIDATOR_FIXTURE=true    → MOCK_RESPONSE (test-only)
 *   4. Both gates open + no fixture         → real Perplexity call
 *
 * Rules per scaffold contract:
 *   - 15s timeout via AbortSignal.timeout
 *   - temperature: 0.1 (low, near-deterministic)
 *   - response_format: structured outputs with JSON Schema
 *     (Perplexity enforces server-side on Tier 3+ accounts; lower
 *     tiers fall back to best-effort. The defensive client-side
 *     re-check below catches non-conforming responses either way.)
 *   - finish_reason != "stop" → status: "failed" (analogue to
 *     OpenAI's safety-refusal path)
 *   - errors caught → status: "failed", error message captured
 *   - no markdown / no chain-of-thought / no provider SDK
 *   - no console logging of the API key, request body, or response
 *
 * Perplexity-specific behavior: the API returns a top-level
 * `citations: string[]` array of URLs the model retrieved. These
 * are merged into `cited_sources`, taking precedence over (and
 * de-duplicated with) any URLs the model put in the JSON body —
 * the top-level array reflects the actual retrieval set.
 *
 * Test-only env: `PERPLEXITY_VALIDATOR_FIXTURE`
 *   When set to "true", the provider returns MOCK_RESPONSE WITHOUT
 *   making a network call. Production must NEVER set this.
 */

import type {
  AiValidator,
  ConfidenceLevel,
  NormalizedValidationOutput,
  ValidationInput,
} from "../types";

const PROVIDER_NAME = "perplexity";
const REQUIRED_ENV_VARS = ["PERPLEXITY_API_KEY"] as const;

// Model is isolated in this file so future swaps are a one-line change.
const PERPLEXITY_MODEL = "sonar";
const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const PERPLEXITY_TIMEOUT_MS = 15_000;
const PERPLEXITY_TEMPERATURE = 0.1;

// JSON Schema enforced server-side by Perplexity's structured-outputs
// response format (Tier 3+ accounts). Mirrors the OpenAI validator
// schema so consensus comparisons stay apples-to-apples. Numeric
// 0..100 ranges are enforced client-side via `clampScore()` and
// `numericToConfidence()` since strict mode does not honor
// minimum/maximum.
const PERPLEXITY_JSON_SCHEMA = {
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
  ],
  properties: {
    business_understanding_score: { type: "number" },
    category_confidence: { type: "number" },
    service_area_confidence: { type: "number" },
    recommendation_confidence: { type: "number" },
    missing_facts: { type: "array", items: { type: "string" } },
    cited_sources: { type: "array", items: { type: "string" } },
    raw_summary: { type: "string" },
  },
} as const;

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
  business_understanding_score: 81,
  category_confidence: "high",
  service_area_confidence: "high",
  recommendation_confidence: "medium",
  missing_facts: ["pricing not surfaced"],
  cited_sources: [
    "https://example.com/about (homepage)",
    "https://example.com/services",
  ],
  raw_summary:
    "[MOCK] Perplexity validator placeholder — fixture mode active",
  error: null,
};

type PerplexityJsonResponse = {
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

// Top-level citations from Perplexity reflect the actual retrieval
// set, so they take precedence. The JSON body's `cited_sources` may
// repeat or add URLs — merged and de-duplicated, preserving order.
function mergeCitedSources(
  topLevel: unknown,
  fromJson: unknown,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of asStringArray(topLevel)) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  for (const u of asStringArray(fromJson)) {
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

function buildPrompt(input: ValidationInput): { system: string; user: string } {
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
    "one or two sentences. Return ONLY the JSON object matching the " +
    "schema — no markdown, no chain-of-thought, no commentary.";

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
    raw_summary: `[failed] Perplexity validator: ${message}`,
    error: message,
  };
}

export const PerplexityValidator: AiValidator = {
  name: PROVIDER_NAME,
  requiredEnvVars: REQUIRED_ENV_VARS,
  enabled(): boolean {
    return isMasterEnabled() && missingKeys().length === 0;
  },
  async validateBusiness(
    input: ValidationInput,
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

    // Test-only fixture-mode escape. Production must never set this.
    if (process.env.PERPLEXITY_VALIDATOR_FIXTURE === "true") {
      return MOCK_RESPONSE;
    }

    try {
      const { system, user } = buildPrompt(input);
      const response = await fetch(PERPLEXITY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          model: PERPLEXITY_MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { schema: PERPLEXITY_JSON_SCHEMA },
          },
          temperature: PERPLEXITY_TEMPERATURE,
        }),
        signal: AbortSignal.timeout(PERPLEXITY_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return failedOutput(
          `HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
        );
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string | null;
        }>;
        citations?: unknown;
      };
      const choice = data.choices?.[0];

      // finish_reason analogue to OpenAI's safety-refusal path.
      // "stop" is the expected normal completion. Anything else
      // (e.g., "length" truncation) means the JSON body may be
      // incomplete or untrustworthy — treat as a soft failure.
      const finish = choice?.finish_reason;
      if (typeof finish === "string" && finish !== "stop") {
        return failedOutput(`Perplexity finish_reason=${finish}`);
      }

      const content = choice?.message?.content;
      if (!content) {
        return failedOutput("Perplexity returned empty content");
      }

      let parsed: PerplexityJsonResponse;
      try {
        parsed = JSON.parse(content) as PerplexityJsonResponse;
      } catch (parseErr) {
        const e = parseErr as Error;
        return failedOutput(`JSON parse error: ${e.message ?? "unknown"}`);
      }

      // Defensive post-parse sanity check. Tier 3+ strict mode SHOULD
      // guarantee every required field is present and correctly typed,
      // but verify before propagating. Lower-tier accounts fall back
      // to best-effort here.
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
          "Perplexity response failed schema validation",
        );
      }

      // Merge Perplexity's top-level `data.citations` (the actual
      // retrieval set) with whatever the model put in the JSON body.
      const mergedCitations = mergeCitedSources(
        data.citations,
        parsed.cited_sources,
      );

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
        cited_sources: mergedCitations,
        raw_summary:
          typeof parsed.raw_summary === "string"
            ? parsed.raw_summary
            : "[Perplexity returned no summary]",
        error: null,
      };
    } catch (err) {
      const e = err as Error;
      const isTimeout =
        e.name === "TimeoutError" || /aborted/i.test(e.message ?? "");
      const reason = isTimeout
        ? `Timeout after ${PERPLEXITY_TIMEOUT_MS}ms`
        : `${e.name ?? "Error"}: ${e.message ?? String(err)}`;
      return failedOutput(reason);
    }
  },
};
