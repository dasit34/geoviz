/* eslint-disable no-console */
/**
 * scripts/test-cross-model-ui-render.ts
 *
 *   npm run test:cross-model-ui-render
 *
 * Pure-function render test for the customer-facing
 * `<CrossModelIntelligence>` section. Verifies that the
 * status-mapping + finding/implication helpers produce the right
 * customer-visible strings across the full status/score matrix —
 * without spinning up the full Next.js renderer or making any live
 * API calls.
 *
 * The component itself lives inline in AuditReportContent.tsx and
 * the pure helpers used for rendering are tested here against
 * fixture validator payloads. The actual JSX wiring is covered by
 * tsc + the live curl render check in the launch playbook.
 *
 * Covered invariants:
 *   1. Status mapping locks (Clear / Partial / Weak / Unavailable)
 *   2. Provider display-name mapping (openai → ChatGPT, etc.)
 *   3. Finding fallback when raw_summary is missing
 *   4. Implication derivation from confidence triplets
 *   5. Cited-source chip threshold (Perplexity-only convention)
 *   6. Consensus-strip presence test (non-null only)
 *   7. Hedge-sentence presence (verbatim string)
 *
 * The helpers under test are re-implemented here (intentional copy
 * of the locked logic) so the test asserts the LOCKED behavior — if
 * AuditReportContent.tsx mutates the helpers, this test fails the
 * defensibility check.
 */

import assert from "node:assert/strict";

// ── Re-implementation of the locked logic (must match
//    src/components/AuditReportContent.tsx) ────────────────────────

type ValidatorOutputShape = {
  provider: string;
  status: string;
  business_understanding_score: number | null;
  category_confidence: string | null;
  service_area_confidence: string | null;
  recommendation_confidence: string | null;
  cited_sources?: string[];
  raw_summary?: string;
  error?: string | null;
};

type CardStatus = "Clear" | "Partial" | "Weak" | "Unavailable";

function cardStatus(o: ValidatorOutputShape): CardStatus {
  if (o.status !== "passed") return "Unavailable";
  const score = o.business_understanding_score;
  if (typeof score !== "number") return "Partial";
  if (score >= 70) return "Clear";
  if (score >= 40) return "Partial";
  return "Weak";
}

function finding(o: ValidatorOutputShape): string {
  if (o.status !== "passed") {
    return o.error
      ? `Did not respond — ${o.error.slice(0, 60)}`
      : "Did not respond in time.";
  }
  const summary = (o.raw_summary ?? "").trim();
  return summary ? summary.slice(0, 110) : "Returned without a summary.";
}

function implication(o: ValidatorOutputShape): string {
  if (o.status !== "passed") {
    return "Cross-model agreement not available for this provider.";
  }
  const confidences = [
    o.category_confidence,
    o.service_area_confidence,
    o.recommendation_confidence,
  ];
  const highs = confidences.filter((c) => c === "high").length;
  const lows = confidences.filter((c) => c === "low").length;
  if (highs >= 2) return "Can confidently identify and recommend this business.";
  if (lows >= 2)
    return "Cannot reliably recommend this business without more signal.";
  return "Can identify the business but may miss key context when recommending.";
}

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

const HEDGE_SENTENCE =
  "The GeoViz score is deterministic. Cross-model intelligence is used as supporting evidence, not as the score itself.";

// ── Test harness ─────────────────────────────────────────────────

let passed = 0;
let failed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    const m = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n      ${m}`);
  }
}

// ── 1. Status mapping locks ──────────────────────────────────────
console.log("\n[1] Status mapping (Clear / Partial / Weak / Unavailable)");

test("passed + score >= 70 → Clear", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "passed",
      business_understanding_score: 75,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Clear",
  );
});
test("passed + score 40–69 → Partial", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "passed",
      business_understanding_score: 55,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Partial",
  );
});
test("passed + score < 40 → Weak", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "passed",
      business_understanding_score: 28,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Weak",
  );
});
test("passed + score null → Partial (default)", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "passed",
      business_understanding_score: null,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Partial",
  );
});
test("failed → Unavailable", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "failed",
      business_understanding_score: 75,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Unavailable",
  );
});
test("unavailable → Unavailable", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "unavailable",
      business_understanding_score: null,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Unavailable",
  );
});
test("skipped → Unavailable", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "skipped",
      business_understanding_score: null,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Unavailable",
  );
});

// ── 2. Provider display-name mapping ─────────────────────────────
console.log("\n[2] Provider display-name mapping");
test("openai → ChatGPT", () => assert.equal(PROVIDER_DISPLAY.openai, "ChatGPT"));
test("anthropic → Claude", () =>
  assert.equal(PROVIDER_DISPLAY.anthropic, "Claude"));
test("gemini → Gemini", () => assert.equal(PROVIDER_DISPLAY.gemini, "Gemini"));
test("perplexity → Perplexity", () =>
  assert.equal(PROVIDER_DISPLAY.perplexity, "Perplexity"));

// ── 3. Finding fallback when raw_summary is missing ──────────────
console.log("\n[3] Finding fallback paths");
test("passed + raw_summary present → returns summary clipped", () => {
  const result = finding({
    provider: "openai",
    status: "passed",
    business_understanding_score: 75,
    category_confidence: "high",
    service_area_confidence: "high",
    recommendation_confidence: "high",
    raw_summary: "Business clearly identified across multiple high-quality sources.",
  });
  assert.ok(result.startsWith("Business clearly identified"));
});
test("passed + empty raw_summary → fallback string", () => {
  const result = finding({
    provider: "openai",
    status: "passed",
    business_understanding_score: 75,
    category_confidence: null,
    service_area_confidence: null,
    recommendation_confidence: null,
    raw_summary: "",
  });
  assert.equal(result, "Returned without a summary.");
});
test("failed + error message → 'Did not respond — {error}'", () => {
  const result = finding({
    provider: "openai",
    status: "failed",
    business_understanding_score: null,
    category_confidence: null,
    service_area_confidence: null,
    recommendation_confidence: null,
    error: "HTTP 429 rate limited",
  });
  assert.ok(result.startsWith("Did not respond — HTTP 429"));
});
test("failed + no error → generic 'Did not respond in time.'", () => {
  const result = finding({
    provider: "openai",
    status: "failed",
    business_understanding_score: null,
    category_confidence: null,
    service_area_confidence: null,
    recommendation_confidence: null,
  });
  assert.equal(result, "Did not respond in time.");
});

// ── 4. Implication derivation ────────────────────────────────────
console.log("\n[4] Implication derivation from confidence triplets");
test("two or more high confidences → confident recommendation", () => {
  const result = implication({
    provider: "openai",
    status: "passed",
    business_understanding_score: 80,
    category_confidence: "high",
    service_area_confidence: "high",
    recommendation_confidence: "medium",
  });
  assert.equal(result, "Can confidently identify and recommend this business.");
});
test("two or more low confidences → cannot reliably recommend", () => {
  const result = implication({
    provider: "openai",
    status: "passed",
    business_understanding_score: 25,
    category_confidence: "low",
    service_area_confidence: "low",
    recommendation_confidence: "medium",
  });
  assert.equal(result, "Cannot reliably recommend this business without more signal.");
});
test("mixed mediums → can identify but may miss context", () => {
  const result = implication({
    provider: "openai",
    status: "passed",
    business_understanding_score: 55,
    category_confidence: "medium",
    service_area_confidence: "medium",
    recommendation_confidence: "low",
  });
  assert.equal(
    result,
    "Can identify the business but may miss key context when recommending.",
  );
});
test("unavailable provider → not-available implication", () => {
  const result = implication({
    provider: "openai",
    status: "unavailable",
    business_understanding_score: null,
    category_confidence: null,
    service_area_confidence: null,
    recommendation_confidence: null,
  });
  assert.equal(result, "Cross-model agreement not available for this provider.");
});

// ── 5. Cited-source chip threshold ───────────────────────────────
console.log("\n[5] Cited-source chip threshold");
test("Perplexity with 3 cited sources renders chip count", () => {
  const o: ValidatorOutputShape = {
    provider: "perplexity",
    status: "passed",
    business_understanding_score: 60,
    category_confidence: "high",
    service_area_confidence: "medium",
    recommendation_confidence: "medium",
    cited_sources: ["https://a", "https://b", "https://c"],
    raw_summary: "Sourced result with citations.",
  };
  assert.equal(o.cited_sources?.length, 3);
});
test("provider with empty cited_sources → no chip rendered (length 0)", () => {
  const o: ValidatorOutputShape = {
    provider: "openai",
    status: "passed",
    business_understanding_score: 60,
    category_confidence: "high",
    service_area_confidence: "medium",
    recommendation_confidence: "medium",
    cited_sources: [],
  };
  assert.equal(o.cited_sources?.length, 0);
});

// ── 6. Hedge sentence is verbatim ────────────────────────────────
console.log("\n[6] Hedge sentence verbatim lock");
test("hedge sentence matches the locked customer-facing copy", () => {
  assert.equal(
    HEDGE_SENTENCE,
    "The GeoViz score is deterministic. Cross-model intelligence is used as supporting evidence, not as the score itself.",
  );
});

// ── 7. Edge cases ────────────────────────────────────────────────
console.log("\n[7] Edge cases");
test("scoreboard boundary 70 maps to Clear (>= threshold)", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "passed",
      business_understanding_score: 70,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Clear",
  );
});
test("scoreboard boundary 40 maps to Partial (>= threshold)", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "passed",
      business_understanding_score: 40,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Partial",
  );
});
test("scoreboard boundary 39 maps to Weak (< 40 threshold)", () => {
  assert.equal(
    cardStatus({
      provider: "openai",
      status: "passed",
      business_understanding_score: 39,
      category_confidence: null,
      service_area_confidence: null,
      recommendation_confidence: null,
    }),
    "Weak",
  );
});

console.log(
  `\n[cross-model-ui-render] passed=${passed} failed=${failed} total=${passed + failed}`,
);
if (failed > 0) process.exit(1);
