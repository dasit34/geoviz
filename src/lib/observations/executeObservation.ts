/**
 * Observation execution layer.
 *
 * Reads `ENABLE_OBSERVATION` + per-provider keys, decides which
 * providers fire, calls them in parallel, collects results, returns
 * a typed bundle. Never throws — per-provider failures become
 * `{ success: false }` entries in the result array.
 *
 * v1 = all providers return deterministic mocks via
 * `buildMockObservation`. The orchestrator itself is the
 * production-grade shape — when real providers come online, only
 * the providers change.
 */

import { observationCache, ObservationCache } from "./cache/observation-cache";
import { ALL_PROVIDERS, hasProviderKey, OBSERVATION_PROVIDERS } from "./registry";
import type {
  ObservationProviderId,
  ObservationResult,
} from "./types";
import { isObservationEnabled } from "./index";

export type ExecuteObservationInput = {
  businessName: string;
  websiteUrl: string;
  /** Optional probe phrase — provider may rephrase. Default ""; the
   * cache keys on this so different probes don't collide. */
  probe?: string;
};

export type ExecuteObservationResult = {
  enabled: boolean;
  /** Populated only when no observations actually ran. */
  skipped_reason?: "flag_disabled" | "no_providers_enabled";
  /** Observations in stable provider order (sorted by id). */
  observations: ObservationResult[];
  total_latency_ms: number;
  total_cost_usd: number;
};

/**
 * Run every enabled provider in parallel and return the bundle.
 *
 * Gate sequence:
 *   1. ENABLE_OBSERVATION must be "true". Otherwise return
 *      `{ enabled: false, skipped_reason: "flag_disabled", ... }`.
 *   2. At least one provider must have its API key set in env.
 *      Otherwise return `{ enabled: true, skipped_reason: "no_providers_enabled", ... }`.
 *   3. Each provider with a key fires `observe(input)` in parallel.
 *      Per-provider exceptions become `{ success: false }` entries.
 *      The orchestrator NEVER throws.
 *
 * Cache: results are memoized in-process for 60 minutes per
 * `(provider, websiteUrl, probe)` triple. Bypass by passing a
 * custom cache instance.
 */
export async function executeObservation(
  input: ExecuteObservationInput,
  opts: { cache?: ObservationCache } = {},
): Promise<ExecuteObservationResult> {
  const enabled = isObservationEnabled();
  if (!enabled) {
    return {
      enabled: false,
      skipped_reason: "flag_disabled",
      observations: [],
      total_latency_ms: 0,
      total_cost_usd: 0,
    };
  }

  const activeProviders = ALL_PROVIDERS.filter((id) => hasProviderKey(id));
  if (activeProviders.length === 0) {
    return {
      enabled: true,
      skipped_reason: "no_providers_enabled",
      observations: [],
      total_latency_ms: 0,
      total_cost_usd: 0,
    };
  }

  const cache = opts.cache ?? observationCache;
  const startedAt = Date.now();

  const observations = await Promise.all(
    activeProviders.map((id) => runOne(id, input, cache)),
  );

  // Stable ordering — alphabetic by provider id so output never
  // depends on which call resolved first.
  observations.sort((a, b) => a.provider.localeCompare(b.provider));

  return {
    enabled: true,
    observations,
    total_latency_ms: Date.now() - startedAt,
    total_cost_usd: observations.reduce(
      (sum, o) => sum + (o.success ? o.cost_usd : 0),
      0,
    ),
  };
}

async function runOne(
  id: ObservationProviderId,
  input: ExecuteObservationInput,
  cache: ObservationCache,
): Promise<ObservationResult> {
  const cacheKey = ObservationCache.keyFor(id, input.websiteUrl, input.probe);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const result = await OBSERVATION_PROVIDERS[id].observe(input);
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Graceful fail — emit a `{ success: false }` entry. Do NOT
    // cache failures (so a transient provider blip doesn't lock
    // out subsequent attempts for an hour).
    return {
      provider: id,
      enabled: true,
      success: false,
      latency_ms: 0,
      cost_usd: 0,
      signals: {},
      raw_summary: `[error] ${msg}`,
      created_at: new Date().toISOString(),
    };
  }
}
