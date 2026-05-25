/**
 * Deterministic mock observation factory.
 *
 * Every provider stub delegates to `buildMockObservation` so the
 * mock payloads are uniform: same input ⇒ same signals + same
 * latency + same cost (modulo `created_at`). No `fetch()`, no SDK
 * import — the only async surface is a short `sleep` so the
 * orchestrator's wall-clock measurement is non-zero.
 *
 * v1 = mocks only. When providers come online, the real `observe()`
 * paths will replace this delegate while preserving the
 * `ObservationResult` shape.
 */

import { createHash } from "node:crypto";

import { hasProviderKey } from "../registry";
import type {
  ObservationProviderId,
  ObservationResult,
  ObservationSignals,
} from "../types";
import { isObservationEnabled } from "../index";

/**
 * Per-provider mock constants. Illustrative — not real pricing or
 * real latencies; only used to make the orchestrator's projection
 * meaningful without making any network call.
 */
const PROVIDER_PROFILES: Record<
  ObservationProviderId,
  { latency_ms: number; cost_usd: number }
> = {
  claude:     { latency_ms: 320, cost_usd: 0.012 },
  openai:     { latency_ms: 280, cost_usd: 0.009 },
  gemini:     { latency_ms: 410, cost_usd: 0.006 },
  perplexity: { latency_ms: 510, cost_usd: 0.011 },
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Derive the four signal floats deterministically from the input.
 * sha256 of `${provider}::${websiteUrl}::${businessName}::${probe}`
 * → split into 4 hex slices → normalized 0..1.
 */
function deriveSignals(
  provider: ObservationProviderId,
  input: { businessName: string; websiteUrl: string; probe?: string },
): ObservationSignals {
  const key = `${provider}::${input.websiteUrl}::${input.businessName}::${input.probe ?? ""}`;
  const digest = createHash("sha256").update(key).digest("hex");
  const slice = (start: number): number => {
    // 4 hex chars = 16 bits = 0..65535 → normalize to 0..1, round to 0.01
    const n = parseInt(digest.slice(start, start + 4), 16);
    return Math.round((n / 0xffff) * 100) / 100;
  };
  return {
    retrieval:      slice(0),
    trust:          slice(4),
    citation:       slice(8),
    recommendation: slice(12),
  };
}

/**
 * Build a single deterministic mock observation. Pure except the
 * timestamp on `created_at` and the short `sleep` simulating
 * provider latency.
 *
 * Important: the mock NEVER fails. Real provider adapters will fail
 * via try/catch in `executeObservation`; the mock layer is for
 * shape-conformance only.
 */
export async function buildMockObservation(
  provider: ObservationProviderId,
  input: { businessName: string; websiteUrl: string; probe?: string },
): Promise<ObservationResult> {
  const profile = PROVIDER_PROFILES[provider];
  // Tiny actual latency (~20ms) — keeps the orchestrator's wall-clock
  // measurement non-zero without paying the mock's nominal cost.
  await sleep(20);
  const enabled = isObservationEnabled() && hasProviderKey(provider);
  return {
    provider,
    enabled,
    success: true,
    latency_ms: profile.latency_ms,
    cost_usd: profile.cost_usd,
    signals: deriveSignals(provider, input),
    raw_summary: `[mock] ${provider} observed ${input.businessName} (${input.websiteUrl})`,
    created_at: new Date().toISOString(),
  };
}

/** Exposed for the cost-baseline projection. */
export function mockCostFor(provider: ObservationProviderId): number {
  return PROVIDER_PROFILES[provider].cost_usd;
}

/** Exposed so `observe:test` can list latency without firing the mock. */
export function mockLatencyFor(provider: ObservationProviderId): number {
  return PROVIDER_PROFILES[provider].latency_ms;
}
