/**
 * GeoViz Anthropic API pricing + cost-estimation helpers.
 *
 * Pure module — no DB, no SDK, no React. Just a price table and a
 * single estimator function. Imported by `scripts/geo-worker.ts` to
 * compute the per-audit USD cost we persist on
 * `AuditOrder.estimatedCostUsd`.
 *
 * Why model-aware: when the worker upgrades from one model family to
 * another, historic cost rows would silently misvalue if we used a
 * single fixed rate. Storing `modelUsed` per row + matching the
 * rate at compute-time keeps the recorded `estimatedCostUsd` correct
 * across model upgrades.
 *
 * Prompt-caching pricing (Anthropic):
 *   • cache_creation_input_tokens  — 25% premium over input rate
 *   • cache_read_input_tokens      — 10% of input rate
 *
 * Rates below are an approximation of public Anthropic list pricing
 * at the time of writing; verify against the live billing dashboard
 * before treating `estimatedCostUsd` as the source of truth for
 * financial reporting. Treat it as a **directional** signal for
 * cost monitoring + capacity planning, not the actual invoice.
 */

export type ModelFamily = "haiku" | "sonnet" | "opus";

export type ModelRates = {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cache-creation input tokens (25% premium over input). */
  cacheCreation: number;
  /** USD per 1M cache-read input tokens (10% of input rate). */
  cacheRead: number;
};

/**
 * Public list pricing (approximate). Update here when Anthropic
 * publishes new rates. The cost estimator below resolves a given
 * `modelId` to the right family via substring match — handles
 * version drift like "claude-sonnet-4-6" vs "claude-sonnet-4-5"
 * without a code change.
 */
const RATES: Record<ModelFamily, ModelRates> = {
  haiku: {
    input: 1.0,
    output: 5.0,
    cacheCreation: 1.25,
    cacheRead: 0.1,
  },
  sonnet: {
    input: 3.0,
    output: 15.0,
    cacheCreation: 3.75,
    cacheRead: 0.3,
  },
  opus: {
    input: 15.0,
    output: 75.0,
    cacheCreation: 18.75,
    cacheRead: 1.5,
  },
};

/**
 * Resolves a model ID like "claude-sonnet-4-6" or
 * "claude-opus-4-7" to its family. Unknown / empty → defaults to
 * "sonnet" (the current GeoViz worker default) so the cost stays
 * directionally correct rather than NaN.
 */
export function resolveModelFamily(modelId: string | null | undefined): ModelFamily {
  const id = (modelId ?? "").toLowerCase();
  if (id.includes("haiku")) return "haiku";
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return "sonnet";
  return "sonnet";
}

export type TokenUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationTokens: number | null;
  cacheReadTokens: number | null;
};

/**
 * Compute the estimated USD cost for one audit's token usage. Null
 * inputs are treated as zero so partial usage records still produce
 * a meaningful estimate. Returns USD rounded to 6 decimal places
 * (matches the Prisma Decimal(10, 6) column precision).
 *
 * Formula:
 *   cost = (inputTokens         × inputRate         / 1_000_000)
 *        + (outputTokens        × outputRate        / 1_000_000)
 *        + (cacheCreationTokens × cacheCreationRate / 1_000_000)
 *        + (cacheReadTokens     × cacheReadRate     / 1_000_000)
 */
export function estimateAuditCostUsd(
  modelId: string | null | undefined,
  usage: TokenUsage,
): number {
  const rates = RATES[resolveModelFamily(modelId)];
  const input = (usage.inputTokens ?? 0) * rates.input;
  const output = (usage.outputTokens ?? 0) * rates.output;
  const cacheCreate = (usage.cacheCreationTokens ?? 0) * rates.cacheCreation;
  const cacheRead = (usage.cacheReadTokens ?? 0) * rates.cacheRead;
  const totalCentsTimes1M = input + output + cacheCreate + cacheRead;
  return Math.round((totalCentsTimes1M / 1_000_000) * 1_000_000) / 1_000_000;
}

/**
 * Human-readable single-line breakdown of a usage record. Used in
 * worker logs so an operator tailing Railway logs can see the cost
 * shape per audit without opening the DB.
 *
 *   "input=3812 output=4271 cacheCreate=0 cacheRead=0 model=sonnet cost=$0.0769"
 */
/**
 * Operator-facing color tone for a per-audit cost. Used by the admin
 * card + the admin summary strip to surface "this audit was unusually
 * expensive" without a chart. Thresholds calibrated to the per-audit
 * cost analysis in COST_AND_USAGE_TRACKING.md §1 (typical Sonnet
 * audit ~$0.10, complex site ~$0.18).
 *
 *   low    : < $0.05   — well below the typical run; usually a
 *                        small site that needed few tool round-trips.
 *   medium : < $0.15   — normal range, includes the typical $0.10
 *                        audit. Most audits live here.
 *   high   : ≥ $0.15   — flag for review. Either a very large site,
 *                        runaway tool round-trips, or output hitting
 *                        the max_tokens cap.
 *   none   : cost null — no telemetry (CLI mode, pre-Phase-1).
 *
 * NOT customer-facing. Operator UI only.
 */
export type CostTone = "low" | "medium" | "high" | "none";

export const COST_THRESHOLD_LOW = 0.05;
export const COST_THRESHOLD_HIGH = 0.15;

export function costTone(cost: number | null | undefined): CostTone {
  if (cost === null || cost === undefined || !Number.isFinite(cost)) {
    return "none";
  }
  if (cost < COST_THRESHOLD_LOW) return "low";
  if (cost < COST_THRESHOLD_HIGH) return "medium";
  return "high";
}

export function formatUsageLog(
  modelId: string | null | undefined,
  usage: TokenUsage,
): string {
  const family = resolveModelFamily(modelId);
  const cost = estimateAuditCostUsd(modelId, usage);
  return [
    `input=${usage.inputTokens ?? 0}`,
    `output=${usage.outputTokens ?? 0}`,
    `cacheCreate=${usage.cacheCreationTokens ?? 0}`,
    `cacheRead=${usage.cacheReadTokens ?? 0}`,
    `model=${family}`,
    `cost=$${cost.toFixed(4)}`,
  ].join(" ");
}
