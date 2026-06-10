/**
 * AI Answer Graph — capture helpers (additive, moat-data only).
 *
 * This module supports the data-accumulation layer: it does NOT alter
 * the deterministic GeoViz score, the customer-facing consensus, or any
 * existing validator behavior. It only helps each provider record
 * future-value ("moat") data on every audit:
 *
 *   - verbatim model output, the exact prompt, the model id/version, a
 *     per-answer timestamp, and parsed citation domains (free — derived
 *     from data the provider already has in hand), and
 *   - a separate buyer-intent "competitive" query whose verbatim answer
 *     captures which businesses each model names for the category — the
 *     one piece that is neither derivable from the egocentric validator
 *     prompt nor backfillable later.
 *
 * Everything here is fail-soft: a capture error NEVER changes the
 * validator's `status`, score, or customer-facing output. Competitive
 * capture is additionally gated by `GEO_COMPETITIVE_CAPTURE` (default
 * ON; set to "false" to disable without a deploy if latency/cost bites).
 *
 * @see ./types.ts — CompetitiveCapture + the optional capture fields
 */

import type { CompetitiveCapture, ValidationInput } from "./types";

/** Stamped on every `ValidationLayerResult` so future ETL can version the records. */
export const CAPTURE_VERSION = "capture@1.0.0";

/** Versions the prompt text we send, so re-prompts stay queryable across changes. */
export const CAPTURE_PROMPT_VERSION = "capture@1.0.0";

/** Per-call timeout for the competitive query (kept in line with the validators). */
export const COMPETITIVE_TIMEOUT_MS = 15_000;

/**
 * Competitive capture defaults ON. Disable with `GEO_COMPETITIVE_CAPTURE=false`
 * (a kill-switch for latency/cost without a code deploy). Never runs in
 * validator fixture mode — providers return their mock before reaching here.
 */
export function competitiveCaptureEnabled(): boolean {
  return process.env.GEO_COMPETITIVE_CAPTURE !== "false";
}

/**
 * Parse bare hostnames from a list of cited-source strings. Cheap,
 * derive-at-capture so the future citation-source graph ("which domains
 * each model trusts") doesn't have to re-parse flat strings. Best-effort:
 * non-URL strings are skipped. De-duplicated, order preserved.
 */
export function parseDomains(citedSources: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of citedSources) {
    if (typeof raw !== "string") continue;
    // Pull the first URL-ish token out of strings like
    // "https://example.com/about (homepage)".
    const match = raw.match(/https?:\/\/[^\s)]+/i);
    const candidate = match ? match[0] : raw.trim();
    let host: string | null = null;
    try {
      host = new URL(candidate).hostname.replace(/^www\./i, "").toLowerCase();
    } catch {
      // Fall back: a bare "example.com/x" without a scheme.
      const bare = candidate
        .replace(/^www\./i, "")
        .split(/[/?#\s]/)[0]
        ?.toLowerCase();
      if (bare && bare.includes(".")) host = bare;
    }
    if (host && !seen.has(host)) {
      seen.add(host);
      out.push(host);
    }
  }
  return out;
}

/**
 * The buyer-intent competitive prompt. The model infers the subject's
 * category + location from the provided evidence, then answers the
 * consumer question naturally, naming specific businesses — and reports
 * whether the subject is among them. Returns the structured-output field
 * spec the caller renders into its provider-native schema.
 */
export function buildCompetitivePrompt(input: ValidationInput): {
  system: string;
  user: string;
} {
  const system =
    "You simulate how an AI assistant answers a consumer who is choosing " +
    "a local service provider. From the business and its website evidence, " +
    "infer the business's primary service category and primary service " +
    "location, then answer the consumer's question as you naturally would. " +
    "Name SPECIFIC real businesses you would actually surface for that " +
    "category in that location (aim for 5-8 when you can). Then report " +
    "whether the SUBJECT business below is among the ones you named. Do " +
    "NOT mention or modify any audit score. Fields:\n" +
    "  - inferred_category: the subject's service category in plain words\n" +
    "  - inferred_location: the subject's service area in plain words\n" +
    "  - answer: your natural consumer-facing answer naming the businesses\n" +
    "  - businesses: the specific business names you named (array)\n" +
    "  - subject_named: true if the subject business is among them, else false";

  const user =
    `Subject business name: ${input.businessName ?? "(not provided)"}\n` +
    `Subject URL: ${input.url}\n\n` +
    "Website evidence about the subject business:\n" +
    `${JSON.stringify(input.extractedEvidence)}\n\n` +
    "Consumer question: \"Who are the best providers in this category and " +
    'area, and would you recommend any in particular?"';

  return { system, user };
}

/** Logical shape the competitive structured-output asks each model to return. */
export type CompetitiveParsed = {
  inferred_category?: unknown;
  inferred_location?: unknown;
  answer?: unknown;
  businesses?: unknown;
  subject_named?: unknown;
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function asBoolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Normalize a provider's competitive structured output into the persisted
 * `CompetitiveCapture` shape. `rawResponse` is the verbatim provider text
 * (the durable, re-parseable asset) — keep it even when parsing is thin.
 */
export function normalizeCompetitive(args: {
  parsed: CompetitiveParsed | null;
  rawResponse: string;
  model: string;
  modelVersion: string | null;
  queryText: string;
  retrievedAt: string;
  status: CompetitiveCapture["status"];
  error: string | null;
}): CompetitiveCapture {
  const businesses = asStringArray(args.parsed?.businesses);
  return {
    query_text: args.queryText,
    prompt_version: CAPTURE_PROMPT_VERSION,
    raw_response: args.rawResponse,
    inferred_category:
      typeof args.parsed?.inferred_category === "string"
        ? args.parsed.inferred_category
        : null,
    inferred_location:
      typeof args.parsed?.inferred_location === "string"
        ? args.parsed.inferred_location
        : null,
    entities: businesses,
    business_named: asBoolOrNull(args.parsed?.subject_named),
    model: args.model,
    model_version: args.modelVersion,
    retrieved_at: args.retrievedAt,
    status: args.status,
    error: args.error,
  };
}

/** A fail-soft competitive record for the unavailable/error paths. */
export function competitiveStub(args: {
  model: string;
  queryText: string;
  status: CompetitiveCapture["status"];
  error: string | null;
}): CompetitiveCapture {
  return normalizeCompetitive({
    parsed: null,
    rawResponse: "",
    model: args.model,
    modelVersion: null,
    queryText: args.queryText,
    retrievedAt: new Date().toISOString(),
    status: args.status,
    error: args.error,
  });
}
