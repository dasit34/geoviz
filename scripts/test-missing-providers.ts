/* eslint-disable no-console */
/**
 * scripts/test-missing-providers.ts
 *
 * Guards two failure modes around absent / partial cross-model data:
 *
 *   A. FourModelGrid must ALWAYS render exactly four provider cards
 *      (ChatGPT / Claude / Gemini / Perplexity) — a missing provider
 *      becomes a synthetic "unavailable" card, never a silently
 *      dropped column. A rename of a provider key would silently drop
 *      a card, so this asserts the canonical key set + the
 *      walk-PROVIDER_ORDER-with-syntheticMissing wiring at the source
 *      level.
 *
 *   B. The shared recommendation-confidence label degrades soundly as
 *      providers drop out: HIGH is unreachable below 3 passed
 *      providers, and "all providers agree the signal is weak" is LOW,
 *      not HIGH. Also asserts BOTH consumer components import the ONE
 *      shared helper (locks the Phase-5 dedupe so the anchor and the
 *      summary can't re-diverge).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { deriveConsensusConfidenceLabel } from "../src/lib/intelligence/derive-consensus-label";

const REPO_ROOT = process.cwd();
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

console.log("[missing-providers] running...");

// ── A. FourModelGrid four-card invariant (source guards) ────────────
const grid = readFileSync(
  join(REPO_ROOT, "src/components/FourModelGrid.tsx"),
  "utf8",
);

check("PROVIDER_ORDER lists exactly the four canonical providers", () => {
  assert.match(
    grid,
    /PROVIDER_ORDER\s*=\s*\[\s*"openai",\s*"claude",\s*"gemini",\s*"perplexity"\s*\]/,
    "the four canonical provider keys must be present and in order",
  );
});

check("absent providers become a synthetic 'unavailable' card", () => {
  assert.match(grid, /function syntheticMissing/);
  assert.match(grid, /status:\s*"unavailable"/);
  // The grid maps the FULL PROVIDER_ORDER, substituting syntheticMissing
  // for any provider missing from the payload — so the card count is
  // pinned to 4 regardless of how many providers responded.
  assert.match(
    grid,
    /PROVIDER_ORDER\.map\([\s\S]*?syntheticMissing\(/,
    "grid must walk PROVIDER_ORDER and fill gaps with syntheticMissing",
  );
});

// ── B. Confidence label degradation across the provider matrix ──────
// Strong agreement + high majority + healthy deterministic floors, but
// vary how many providers actually passed.
function label(
  passedCount: number,
  majority: "low" | "medium" | "high",
  trust = 80,
  reco = 80,
  agreement = "Strong",
) {
  return deriveConsensusConfidenceLabel(
    passedCount,
    agreement,
    majority,
    trust,
    reco,
  );
}

check("HIGH requires >= 3 passed providers", () => {
  assert.equal(label(4, "high"), "HIGH");
  assert.equal(label(3, "high"), "HIGH");
  // 2 providers can't reach HIGH even with otherwise-perfect signal.
  assert.equal(label(2, "high"), "MODERATE");
});

check("below 2 passed providers never yields HIGH or MODERATE", () => {
  assert.equal(label(1, "high"), "LOW");
  assert.equal(label(0, "high"), "LOW");
});

check("providers agreeing the signal is weak is LOW, not HIGH", () => {
  // All four agree, tight cluster, but the majority verdict is "low".
  assert.equal(label(4, "low", 90, 90), "LOW");
});

check("critically weak deterministic floors block HIGH", () => {
  // 4 providers, high majority, but Trust Signals = 10 → floor blocks.
  assert.equal(label(4, "high", 10, 80), "LOW");
});

// ── B. Dedupe lock — both consumers import the shared helper ─────────
const summary = readFileSync(
  join(REPO_ROOT, "src/components/ConsensusSummary.tsx"),
  "utf8",
);
const anchor = readFileSync(
  join(REPO_ROOT, "src/components/ConsensusActionAnchor.tsx"),
  "utf8",
);

check("ConsensusSummary imports the shared confidence-label helper", () => {
  assert.match(summary, /deriveConsensusConfidenceLabel/);
  assert.match(summary, /derive-consensus-label/);
});
check("ConsensusActionAnchor imports the shared confidence-label helper", () => {
  assert.match(anchor, /deriveConsensusConfidenceLabel/);
  assert.match(anchor, /derive-consensus-label/);
});
check("neither component re-declares a local label cascade", () => {
  assert.doesNotMatch(
    summary,
    /function deriveOverallConfidence/,
    "ConsensusSummary still has a local label function",
  );
  assert.doesNotMatch(
    anchor,
    /function deriveLabel\b/,
    "ConsensusActionAnchor still has a local label function",
  );
});

if (failed > 0) {
  console.log(`[missing-providers] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[missing-providers] passed=${passed} failed=0`);
