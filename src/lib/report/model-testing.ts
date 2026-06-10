/**
 * model-testing.ts — completeness + failure-reason helpers for the cross-model
 * validation layer (`AuditIntelligence.aiValidations`).
 *
 * One source of truth for "did this provider return usable data" (shared with
 * `buildProviders` in report-model.ts so the report and the delivery guard never
 * disagree). Used by the admin delivery guard: a paid report whose four real AI
 * models are ALL unavailable must not be delivered as a complete audit without
 * an explicit admin override. Pure + display/ops only — never touches scoring.
 */

/** The four directly-tested models. `google_ai_overview` is a derived readiness
 *  signal with no public API (always "unavailable") and is NOT counted. */
const REAL_PROVIDERS = new Set(["openai", "claude", "gemini", "perplexity"]);

type ProviderOutput = {
  provider?: string;
  status?: string;
  business_understanding_score?: number | null;
  would_recommend?: string;
  missing_facts?: unknown;
  industry_identified?: string;
  raw_summary?: string;
  error?: string | null;
};

/**
 * True when a validator output carries usable signal for its provider — the
 * EXACT predicate `buildProviders` uses to decide a card is not UNAVAILABLE.
 * Keep these in lockstep.
 */
export function providerHasUsableData(o: unknown): boolean {
  if (!o || typeof o !== "object") return false;
  const x = o as ProviderOutput;
  return (
    x.status === "passed" ||
    typeof x.business_understanding_score === "number" ||
    !!x.would_recommend ||
    (Array.isArray(x.missing_facts) && x.missing_facts.length > 0) ||
    !!x.industry_identified
  );
}

/** Extract the `outputs[]` from a persisted `aiValidations` value (which is
 *  `{ outputs: [...] }`, or — for some legacy rows — the array directly). */
function extractOutputs(aiValidations: unknown): ProviderOutput[] {
  if (Array.isArray(aiValidations)) return aiValidations as ProviderOutput[];
  if (aiValidations && typeof aiValidations === "object") {
    const out = (aiValidations as { outputs?: unknown }).outputs;
    if (Array.isArray(out)) return out as ProviderOutput[];
  }
  return [];
}

/** Count of the four REAL models that returned usable data (0–4). Null/empty
 *  `aiValidations` → 0. */
export function usableProviderCount(aiValidations: unknown): number {
  return extractOutputs(aiValidations).filter(
    (o) => REAL_PROVIDERS.has(o.provider ?? "") && providerHasUsableData(o),
  ).length;
}

/**
 * Whether model testing is complete enough to deliver. Default threshold: at
 * least ONE real model returned usable data. Null/empty → incomplete.
 */
export function isModelTestingComplete(
  aiValidations: unknown,
  minRequired = 1,
): boolean {
  return usableProviderCount(aiValidations) >= minRequired;
}

export type ProviderFailureReason =
  | "OK"
  | "Missing API key"
  | "Invalid API key"
  | "Timeout"
  | "Provider error"
  | "Skipped model test";

/**
 * Customer/admin-facing reason a provider has no usable result. Derived from
 * the validator output's status + error + raw_summary.
 */
export function classifyProviderFailure(o: unknown): ProviderFailureReason {
  if (providerHasUsableData(o)) return "OK";
  const x = (o ?? {}) as ProviderOutput;
  const blob = `${x.error ?? ""} ${x.raw_summary ?? ""}`.toLowerCase();
  const status = (x.status ?? "").toLowerCase();

  if (/api[\s_-]?key.*(not set|missing)|env var|not set|unavailable.*key/.test(blob)) {
    return "Missing API key";
  }
  if (/\b401\b|\b403\b|unauthor|invalid.*(api )?key|authentication|forbidden/.test(blob)) {
    return "Invalid API key";
  }
  if (/timeout|timed out|etimedout|abort|deadline/.test(blob)) {
    return "Timeout";
  }
  if (status === "skipped" || /no public api|skipped/.test(blob)) {
    return "Skipped model test";
  }
  if (status === "unavailable") {
    // Unavailable without an explicit key/skip signal → treat as missing key
    // (the dominant cause) so the operator checks credentials first.
    return "Missing API key";
  }
  return "Provider error";
}
