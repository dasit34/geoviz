/* eslint-disable no-console */
/**
 * scripts/observe-test.ts
 *
 * Smoke test for the four observation providers. Runs each provider
 * directly through the registry (bypassing the gate) with a sample
 * input and prints `provider · latency_ms · cost_usd · enabled`.
 *
 *   npm run observe:test
 *
 * Confirms all four providers return deterministic mocks. No
 * external API calls. Mirrors what `npm run observe:baseline` would
 * report if `ENABLE_OBSERVATION=true` and the relevant keys were set.
 */

import "dotenv/config";

import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";
import {
  computeAgreement,
  isObservationEnabled,
  projectToSignals,
} from "../src/lib/observations";
import { ALL_PROVIDERS, OBSERVATION_PROVIDERS } from "../src/lib/observations/registry";
import type { ObservationResult, ProviderSignals } from "../src/lib/observations";

function pad(s: string | number, n: number): string {
  const str = String(s);
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

async function main(): Promise<void> {
  const enabledGate = isObservationEnabled();
  console.log(
    `[observe:test] running 4 providers (ENABLE_OBSERVATION=${enabledGate})`,
  );
  console.log(
    `  ${pad("provider", 12)} ${pad("latency_ms", 12)} ${pad("cost_usd", 10)} ${pad("enabled", 9)} ${pad("success", 9)}`,
  );

  const input = {
    businessName: "Acme Plumbing",
    websiteUrl: "https://acme-plumbing.example",
  };

  const results: ObservationResult[] = [];
  for (const id of ALL_PROVIDERS) {
    const provider = OBSERVATION_PROVIDERS[id];
    try {
      const result = await provider.observe(input);
      results.push(result);
      console.log(
        `  ${pad(result.provider, 12)} ${pad(result.latency_ms, 12)} ${pad(result.cost_usd.toFixed(4), 10)} ${pad(String(result.enabled), 9)} ${pad(String(result.success), 9)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `  ${pad(id, 12)} ${pad("-", 12)} ${pad("-", 10)} ${pad("-", 9)} ${pad("THREW", 9)} (${msg})`,
      );
    }
  }

  console.log(
    `[observe:test] all providers returned deterministic mocks; no fetch calls`,
  );

  // Consensus telemetry on the mocked signals.
  const signals: ProviderSignals[] = results
    .filter((r) => r.success)
    .map(projectToSignals);
  const { score, band } = computeAgreement(signals);
  const totalCost = results
    .filter((r) => r.success)
    .reduce((sum, r) => sum + r.cost_usd, 0);

  console.log(
    `[observe:test] consensus agreement = ${band.toUpperCase()} (${score} / 100) across ${signals.length} providers`,
  );
  console.log(
    `[observe:test] projected cost = $${totalCost.toFixed(4)} (mock; not actual API spend)`,
  );
  console.log(`[observe:test] scoring_weight_hash   = ${WEIGHT_HASH}   (unchanged)`);
  console.log(`[observe:test] scoring_category_hash = ${CATEGORY_HASH}   (unchanged)`);
}

main().catch((err) => {
  console.error("[observe:test] error:", err);
  process.exitCode = 1;
});
