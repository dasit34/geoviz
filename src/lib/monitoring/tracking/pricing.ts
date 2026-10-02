/**
 * Per-sample cost for tracked-prompt calls.
 *
 * Rates verified 2026-10-02 against the providers' official pricing pages:
 *   - Anthropic Claude Haiku 4.5: $1 / MTok input, $5 / MTok output; web
 *     search $10 per 1,000 searches (platform.claude.com/docs/en/about-claude/pricing).
 *   - OpenAI gpt-4.1-mini: $0.40 / MTok input, $1.60 / MTok output;
 *     web_search_preview (non-reasoning models) $25 per 1,000 calls, search
 *     content tokens free (developers.openai.com/api/docs/pricing).
 *   - Google gemini-2.5-flash: $0.30 / MTok input, $2.50 / MTok output;
 *     Google Search grounding free for 1,500 requests/day, then $35 per
 *     1,000 grounded prompts (ai.google.dev/gemini-api/docs/pricing). We
 *     charge the paid rate — a conservative upper bound.
 *   - Perplexity sonar: $1 / MTok input, $1 / MTok output; request fee
 *     $5 / $8 / $12 per 1,000 for low / medium / high search context
 *     (docs.perplexity.ai/getting-started/pricing).
 * A provider-reported cost in the response always wins over this estimate.
 */
import type { TrackingProvider } from "./types";

export const TRACKING_PRICING_VERSION = "tracking-pricing@2026-10-02";

type Rates = { inputPerM: number; outputPerM: number; perSearch: number };

export const RATES: Record<TrackingProvider, Rates> = {
  claude: { inputPerM: 1.0, outputPerM: 5.0, perSearch: 10 / 1000 },
  openai: { inputPerM: 0.4, outputPerM: 1.6, perSearch: 25 / 1000 },
  gemini: { inputPerM: 0.3, outputPerM: 2.5, perSearch: 35 / 1000 },
  perplexity: { inputPerM: 1.0, outputPerM: 1.0, perSearch: 8 / 1000 },
};

const PERPLEXITY_REQUEST_FEE: Record<string, number> = { low: 5 / 1000, medium: 8 / 1000, high: 12 / 1000 };

export type SampleUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  /** Billable search operations (Claude searches, OpenAI search calls, 1 per grounded Gemini prompt, 1 Perplexity request). */
  searchCalls: number | null;
  /** Perplexity search context size, when reported. */
  searchContextSize?: string | null;
  /** Cost the provider itself reported for this request, in USD. */
  reportedCostUsd?: number | null;
};

export type SampleCost = { costUsd: number | null; costSource: "provider_reported" | "estimated" | null };

export function estimateSampleCost(provider: TrackingProvider, usage: SampleUsage | null): SampleCost {
  if (!usage) return { costUsd: null, costSource: null };
  if (typeof usage.reportedCostUsd === "number" && Number.isFinite(usage.reportedCostUsd)) {
    return { costUsd: round6(usage.reportedCostUsd), costSource: "provider_reported" };
  }
  if (usage.inputTokens === null && usage.outputTokens === null && usage.searchCalls === null) {
    return { costUsd: null, costSource: null };
  }
  const r = RATES[provider];
  let perSearch = r.perSearch;
  if (provider === "perplexity" && usage.searchContextSize && PERPLEXITY_REQUEST_FEE[usage.searchContextSize]) {
    perSearch = PERPLEXITY_REQUEST_FEE[usage.searchContextSize]!;
  }
  const cost =
    ((usage.inputTokens ?? 0) / 1e6) * r.inputPerM +
    ((usage.outputTokens ?? 0) / 1e6) * r.outputPerM +
    (usage.searchCalls ?? 0) * perSearch;
  return { costUsd: round6(cost), costSource: "estimated" };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
