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
 *   1. PERPLEXITY_API_KEY not set           → status: "unavailable"
 *   2. PERPLEXITY_VALIDATOR_FIXTURE=true    → MOCK_RESPONSE (test-only)
 *   3. Otherwise                            → real Perplexity call
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

import { readApiKey } from "../apiKey";
import {
  CAPTURE_PROMPT_VERSION,
  COMPETITIVE_TIMEOUT_MS,
  buildCompetitivePrompt,
  competitiveCaptureEnabled,
  normalizeCompetitive,
  parseDomains,
  type CompetitiveParsed,
} from "../capture";
import type {
  AiValidator,
  CompetitiveCapture,
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

// Bounded retry for the MAIN validation request only (not the
// competitive-capture sub-call below — that's a separate, capture-only
// feature and out of scope for this fix). A transient 429/5xx or a
// network timeout gets up to 2 retries before the request is treated
// as a final failure, same as it always was.
const PERPLEXITY_MAX_ATTEMPTS = 3;
const PERPLEXITY_RETRY_DELAYS_MS = [1000, 2500]; // before attempt 2, before attempt 3
const PERPLEXITY_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const PERPLEXITY_RETRY_DELAY_CAP_MS = 10_000; // ceiling on a respected Retry-After

// Buyer-intent competitive capture (AI Answer Graph). Perplexity is
// search-grounded, so its competitive set reflects real retrieval.
// Capture-only — never fed to consensus/scoring.
const PERPLEXITY_COMPETITIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "inferred_category",
    "inferred_location",
    "answer",
    "businesses",
    "subject_named",
  ],
  properties: {
    inferred_category: { type: "string" },
    inferred_location: { type: "string" },
    answer: { type: "string" },
    businesses: { type: "array", items: { type: "string" } },
    subject_named: { type: "boolean" },
  },
} as const;

async function runPerplexityCompetitive(
  input: ValidationInput,
): Promise<CompetitiveCapture> {
  const { system, user } = buildCompetitivePrompt(input);
  const retrievedAt = new Date().toISOString();
  try {
    const response = await fetch(PERPLEXITY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${readApiKey("PERPLEXITY_API_KEY")!}`,
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { schema: PERPLEXITY_COMPETITIVE_SCHEMA },
        },
        temperature: PERPLEXITY_TEMPERATURE,
      }),
      signal: AbortSignal.timeout(COMPETITIVE_TIMEOUT_MS),
    });
    if (!response.ok) {
      return normalizeCompetitive({
        parsed: null,
        rawResponse: "",
        model: PERPLEXITY_MODEL,
        modelVersion: null,
        queryText: user,
        retrievedAt,
        status: "failed",
        error: `HTTP ${response.status}`,
      });
    }
    const data = (await response.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    let parsed: CompetitiveParsed | null = null;
    try {
      parsed = content ? (JSON.parse(content) as CompetitiveParsed) : null;
    } catch {
      parsed = null;
    }
    return normalizeCompetitive({
      parsed,
      rawResponse: content,
      model: PERPLEXITY_MODEL,
      modelVersion: data.model ?? null,
      queryText: user,
      retrievedAt,
      status: parsed ? "passed" : "failed",
      error: parsed ? null : "competitive parse failed",
    });
  } catch (err) {
    const e = err as Error;
    return normalizeCompetitive({
      parsed: null,
      rawResponse: "",
      model: PERPLEXITY_MODEL,
      modelVersion: null,
      queryText: user,
      retrievedAt,
      status: "failed",
      error: e.message ?? String(err),
    });
  }
}

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
  return REQUIRED_ENV_VARS.filter((k) => readApiKey(k) === null);
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
  industry_identified: "Roofing contractor",
  location_identified: "Toledo, OH metro and surrounding counties",
  services_identified: [
    "Roof replacement",
    "Storm damage repair",
    "Insurance claim support",
    "Gutter installation",
  ],
  would_recommend: "PARTIAL",
  recommendation_reason:
    "Clear service offering with cited testimonials, but pricing and licensing details are not visible.",
};

type PerplexityJsonResponse = {
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
    "explaining the would_recommend verdict.\n\n" +
    "Return ONLY the JSON object matching the schema — no markdown, " +
    "no chain-of-thought, no commentary.";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Same timeout/abort detection the outer catch block already uses,
// plus generic fetch-layer network errors — both are transient and
// worth a retry. Anything else (programming errors, etc.) is not.
function isRetryableNetworkError(e: Error): boolean {
  const isTimeout = e.name === "TimeoutError" || /aborted/i.test(e.message ?? "");
  const isNetwork = e.name === "TypeError" && /fetch failed|network/i.test(e.message ?? "");
  return isTimeout || isNetwork;
}

// Respects a valid `Retry-After` header (seconds or HTTP-date form)
// when present and reasonable; otherwise falls back to the scheduled
// default delay for this attempt. Capped so a large/malformed value
// can never block the worker for an unreasonable amount of time.
function retryDelayMs(response: Response, fallbackMs: number): number {
  const header = response.headers.get("retry-after");
  if (!header) return fallbackMs;
  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.min(asSeconds * 1000, PERPLEXITY_RETRY_DELAY_CAP_MS);
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    const ms = asDate - Date.now();
    return ms > 0 ? Math.min(ms, PERPLEXITY_RETRY_DELAY_CAP_MS) : fallbackMs;
  }
  return fallbackMs;
}

// Safe, production-visible retry telemetry — status/attempt/outcome
// only. Never logs the request body, headers, or API key.
function logRetryAttempt(fields: {
  attempt: number;
  httpStatus?: number;
  error?: string;
  retryScheduled: boolean;
  delayMs?: number;
  outcome?: "success" | "exhausted" | "non-retryable";
}): void {
  const { attempt, httpStatus, error, retryScheduled, delayMs, outcome } = fields;
  console.log(
    `[perplexity-retry] provider=perplexity attempt=${attempt}/${PERPLEXITY_MAX_ATTEMPTS}` +
      (httpStatus !== undefined ? ` httpStatus=${httpStatus}` : "") +
      (error ? ` error="${error}"` : "") +
      ` retryScheduled=${retryScheduled}` +
      (delayMs !== undefined ? ` delayMs=${delayMs}` : "") +
      (outcome ? ` outcome=${outcome}` : ""),
  );
}

// Retries ONLY the main validation fetch — never the competitive-capture
// sub-call. On success (ok, or a non-retryable/exhausted non-ok status)
// returns the Response as-is so all downstream parsing/validation stays
// byte-for-byte unchanged. On a retryable thrown error that exhausts
// retries, rethrows so the existing outer catch block's classification
// (timeout vs. generic error) is unchanged.
async function fetchPerplexityMainWithRetry(
  body: string,
): Promise<Response> {
  for (let attempt = 1; attempt <= PERPLEXITY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(PERPLEXITY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${readApiKey("PERPLEXITY_API_KEY")!}`,
        },
        body,
        // Fresh timeout per attempt — a fired AbortSignal can't be
        // reused, and a retry shouldn't be pre-doomed by attempt 1's
        // stale timer.
        signal: AbortSignal.timeout(PERPLEXITY_TIMEOUT_MS),
      });

      const canRetryStatus =
        !response.ok &&
        PERPLEXITY_RETRY_STATUSES.has(response.status) &&
        attempt < PERPLEXITY_MAX_ATTEMPTS;

      if (!canRetryStatus) {
        logRetryAttempt({
          attempt,
          httpStatus: response.status,
          retryScheduled: false,
          outcome: response.ok
            ? "success"
            : PERPLEXITY_RETRY_STATUSES.has(response.status)
              ? "exhausted"
              : "non-retryable",
        });
        return response;
      }

      const delay = retryDelayMs(response, PERPLEXITY_RETRY_DELAYS_MS[attempt - 1]);
      logRetryAttempt({
        attempt,
        httpStatus: response.status,
        retryScheduled: true,
        delayMs: delay,
      });
      await sleep(delay);
    } catch (err) {
      const e = err as Error;
      const canRetryError = isRetryableNetworkError(e) && attempt < PERPLEXITY_MAX_ATTEMPTS;

      if (!canRetryError) {
        logRetryAttempt({
          attempt,
          error: e.message ?? String(err),
          retryScheduled: false,
          outcome: "exhausted",
        });
        throw err;
      }

      const delay = PERPLEXITY_RETRY_DELAYS_MS[attempt - 1];
      logRetryAttempt({
        attempt,
        error: e.message ?? String(err),
        retryScheduled: true,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }
  // Unreachable — the loop always returns or throws by the final
  // attempt — but TypeScript needs an exhaustive path.
  throw new Error("Perplexity retry loop exhausted without a result");
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
    if (process.env.PERPLEXITY_VALIDATOR_FIXTURE === "true") {
      return MOCK_RESPONSE;
    }

    // Buyer-intent competitive query, concurrent with the main call.
    // Capture-only; fail-soft; never alters the validator status/score.
    const competitivePromise: Promise<CompetitiveCapture | null> =
      competitiveCaptureEnabled()
        ? runPerplexityCompetitive(input)
        : Promise.resolve(null);

    try {
      const { system, user } = buildPrompt(input);
      const response = await fetchPerplexityMainWithRetry(
        JSON.stringify({
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
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return failedOutput(
          `HTTP ${response.status}${errText ? `: ${errText.slice(0, 200)}` : ""}`,
        );
      }

      const mainRetrievedAt = new Date().toISOString();
      const data = (await response.json()) as {
        model?: string;
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
        industry_identified: asNonEmptyString(parsed.industry_identified),
        location_identified: asNonEmptyString(parsed.location_identified),
        services_identified: asOptionalStringArray(parsed.services_identified),
        would_recommend: asYesPartialNo(parsed.would_recommend),
        recommendation_reason: asNonEmptyString(parsed.recommendation_reason),
        // ─── AI Answer Graph capture (additive, never alters status/score) ──
        model: PERPLEXITY_MODEL,
        model_version: data.model ?? null,
        prompt_text: `${system}\n\n${user}`,
        prompt_version: CAPTURE_PROMPT_VERSION,
        raw_response_text: content,
        answer_retrieved_at: mainRetrievedAt,
        cited_source_domains: parseDomains(mergedCitations),
        competitive: await competitivePromise,
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
