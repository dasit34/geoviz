/* eslint-disable no-console */
/**
 * scripts/test-model-testing.ts
 *
 * Guards the cross-model completeness + failure-reason helpers that drive the
 * delivery guard: a paid report whose four real models are ALL unavailable must
 * read as "incomplete" (block delivery), and each provider failure must map to a
 * human reason for the admin.
 */
import assert from "node:assert/strict";

import {
  providerHasUsableData,
  usableProviderCount,
  isModelTestingComplete,
  classifyProviderFailure,
} from "../src/lib/report/model-testing";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

console.log("[model-testing] running...");

const passedOut = (provider: string) => ({
  provider,
  status: "passed",
  business_understanding_score: 60,
  would_recommend: "PARTIAL",
  industry_identified: "Roofing contractor",
});
const unavailableOut = (provider: string, key: string) => ({
  provider,
  status: "unavailable",
  business_understanding_score: null,
  raw_summary: `[unavailable] Required env var(s) missing: ${key}`,
  error: `${key} not set`,
});

check("providerHasUsableData: passed / score / verdict / industry → true; bare unavailable → false", () => {
  assert.equal(providerHasUsableData(passedOut("openai")), true);
  assert.equal(providerHasUsableData({ provider: "x", business_understanding_score: 10 }), true);
  assert.equal(providerHasUsableData({ provider: "x", would_recommend: "NO" }), true);
  assert.equal(providerHasUsableData({ provider: "x", industry_identified: "HVAC" }), true);
  assert.equal(providerHasUsableData(unavailableOut("openai", "OPENAI_API_KEY")), false);
  assert.equal(providerHasUsableData(null), false);
});

check("usableProviderCount: 4 real passed → 4; google AI overview not counted", () => {
  const aiv = {
    outputs: [
      passedOut("openai"),
      passedOut("claude"),
      passedOut("gemini"),
      passedOut("perplexity"),
      { provider: "google_ai_overview", status: "unavailable", error: "no public API" },
    ],
  };
  assert.equal(usableProviderCount(aiv), 4);
});

check("all four real models unavailable → 0 usable → incomplete", () => {
  const aiv = {
    outputs: [
      unavailableOut("openai", "OPENAI_API_KEY"),
      unavailableOut("claude", "ANTHROPIC_API_KEY"),
      unavailableOut("gemini", "GEMINI_API_KEY"),
      unavailableOut("perplexity", "PERPLEXITY_API_KEY"),
      { provider: "google_ai_overview", status: "unavailable", error: "no public API" },
    ],
  };
  assert.equal(usableProviderCount(aiv), 0);
  assert.equal(isModelTestingComplete(aiv), false);
});

check("one real model usable → complete (threshold 1)", () => {
  const aiv = {
    outputs: [
      passedOut("openai"),
      unavailableOut("claude", "ANTHROPIC_API_KEY"),
      unavailableOut("gemini", "GEMINI_API_KEY"),
      unavailableOut("perplexity", "PERPLEXITY_API_KEY"),
    ],
  };
  assert.equal(usableProviderCount(aiv), 1);
  assert.equal(isModelTestingComplete(aiv), true);
});

check("null / empty aiValidations → incomplete", () => {
  assert.equal(usableProviderCount(null), 0);
  assert.equal(usableProviderCount({ outputs: [] }), 0);
  assert.equal(usableProviderCount(undefined), 0);
  assert.equal(isModelTestingComplete(null), false);
});

check("classifyProviderFailure maps each failure mode", () => {
  assert.equal(classifyProviderFailure(passedOut("openai")), "OK");
  assert.equal(classifyProviderFailure(unavailableOut("claude", "ANTHROPIC_API_KEY")), "Missing API key");
  assert.equal(classifyProviderFailure({ provider: "openai", status: "failed", error: "401 Unauthorized: invalid api key" }), "Invalid API key");
  assert.equal(classifyProviderFailure({ provider: "gemini", status: "failed", error: "request timed out" }), "Timeout");
  assert.equal(classifyProviderFailure({ provider: "perplexity", status: "failed", error: "500 internal server error" }), "Provider error");
  assert.equal(classifyProviderFailure({ provider: "google_ai_overview", status: "unavailable", error: "no public API" }), "Skipped model test");
  assert.equal(classifyProviderFailure({ provider: "x", status: "skipped" }), "Skipped model test");
});

console.log(`[model-testing] passed=${passed} failed=${failed}`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
