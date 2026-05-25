/* eslint-disable no-console */
/**
 * scripts/observe-baseline.ts
 *
 * Cost-baseline projection for the observation layer.
 *
 *   npm run observe:baseline
 *
 * Runs `executeObservation` once with a sample input and prints the
 * resulting JSON:
 *
 *   {
 *     observations_enabled,
 *     projected_cost_per_audit,
 *     provider_count,
 *     providers: [{ provider, enabled, cost_usd, latency_ms }]
 *   }
 *
 * With `ENABLE_OBSERVATION=false` (default), the projection is zero
 * across the board. Flip the flag + set per-provider keys to see
 * the mocked cost projection light up.
 */

import "dotenv/config";

import {
  buildObservationSummary,
  executeObservation,
  isObservationEnabled,
} from "../src/lib/observations";

async function main(): Promise<void> {
  const result = await executeObservation({
    businessName: "Acme Plumbing",
    websiteUrl: "https://acme-plumbing.example",
  });

  // Build the consensus summary when observations actually ran.
  // When the flag is off (or no provider keys are set), consensus is
  // null — the projection still emits cost + provider rows so
  // operators can read the gate state.
  const ranAny = result.observations.some((o) => o.success);
  const consensus = ranAny
    ? buildObservationSummary({ result })
    : null;

  const projection = {
    observations_enabled: isObservationEnabled(),
    projected_cost_per_audit: result.total_cost_usd,
    provider_count: result.observations.filter((o) => o.success).length,
    providers: result.observations.map((o) => ({
      provider: o.provider,
      enabled: o.enabled,
      cost_usd: o.cost_usd,
      latency_ms: o.latency_ms,
    })),
    skipped_reason: result.skipped_reason ?? null,
    consensus,
  };

  console.log(JSON.stringify(projection, null, 2));
}

main().catch((err) => {
  console.error("[observe:baseline] error:", err);
  process.exitCode = 1;
});
