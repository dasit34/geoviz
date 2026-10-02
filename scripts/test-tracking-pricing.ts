/* eslint-disable no-console */
/**
 * scripts/test-tracking-pricing.ts — per-sample cost math (rates verified
 * 2026-10-02) and provider-reported cost precedence.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { RATES, estimateSampleCost } from "../src/lib/monitoring/tracking/pricing";

const h = harness("tracking-pricing");
const close = (a: number | null, b: number) => assert.ok(a !== null && Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

(async () => {
  console.log("[tracking-pricing] running...");

  await h.check("verified rates are pinned", () => {
    assert.deepEqual(RATES.claude, { inputPerM: 1, outputPerM: 5, perSearch: 0.01 });
    assert.deepEqual(RATES.openai, { inputPerM: 0.4, outputPerM: 1.6, perSearch: 0.025 });
    assert.deepEqual(RATES.gemini, { inputPerM: 0.3, outputPerM: 2.5, perSearch: 0.035 });
    assert.equal(RATES.perplexity.inputPerM, 1);
  });

  await h.check("estimate = tokens × rate + searches × per-search fee", () => {
    const c = estimateSampleCost("claude", { inputTokens: 10_000, outputTokens: 1_000, searchCalls: 2 });
    close(c.costUsd, 0.01 + 0.005 + 0.02);
    assert.equal(c.costSource, "estimated");
  });

  await h.check("Perplexity request fee follows reported search context size", () => {
    close(estimateSampleCost("perplexity", { inputTokens: 0, outputTokens: 0, searchCalls: 1, searchContextSize: "high" }).costUsd, 0.012);
    close(estimateSampleCost("perplexity", { inputTokens: 0, outputTokens: 0, searchCalls: 1, searchContextSize: "low" }).costUsd, 0.005);
  });

  await h.check("provider-reported cost wins over the estimate", () => {
    const c = estimateSampleCost("perplexity", { inputTokens: 999_999, outputTokens: 0, searchCalls: 1, reportedCostUsd: 0.0061 });
    assert.deepEqual(c, { costUsd: 0.0061, costSource: "provider_reported" });
  });

  await h.check("no usage → cost unknown (null), never 0", () => {
    assert.deepEqual(estimateSampleCost("openai", null), { costUsd: null, costSource: null });
    assert.deepEqual(estimateSampleCost("openai", { inputTokens: null, outputTokens: null, searchCalls: null }), { costUsd: null, costSource: null });
  });

  h.done();
})();
