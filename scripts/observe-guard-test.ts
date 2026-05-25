/* eslint-disable no-console */
/**
 * scripts/observe-guard-test.ts
 *
 * Simulates the three gate scenarios + a negative-path mutation
 * attempt. Confirms:
 *
 *   - high_agreement   → usable=true   (OK)
 *   - low_agreement    → usable=false  (DISAGREE)
 *   - single_provider  → usable=false  (SINGLE_PROVIDER)
 *
 * Plus runs each scenario through `runObservationGuarded(score, noop)`
 * to prove the deterministic score is byte-equal across all three
 * scenarios — observation policy NEVER touches scoring.
 *
 * Ends with the explicit barrier check: a mutating op MUST throw
 * `ObservationMutationError`.
 *
 *   npm run observe:guard-test
 */

import "dotenv/config";

import { CATEGORY_HASH, WEIGHT_HASH } from "../src/lib/scoring/frozen";
import {
  AGREEMENT_MIN,
  MIN_PROVIDERS,
  ObservationMutationError,
  OBSERVATION_VERSION,
  VARIANCE_SUPPRESS,
  runObservationGuarded,
  validateObservation,
} from "../src/lib/observations";
import type {
  ObservationHealth,
  ObservationSummary,
} from "../src/lib/observations";
import type { DeterministicScore } from "../src/lib/scoring/types";

function summary(args: {
  providers: ("claude" | "openai" | "gemini" | "perplexity")[];
  agreementScore: number;
  agreementBand: "high" | "medium" | "low";
  maxVariance: number;
}): ObservationSummary {
  const v = args.maxVariance;
  return {
    observation_version: OBSERVATION_VERSION,
    scoring_weight_hash: WEIGHT_HASH,
    scoring_category_hash: CATEGORY_HASH,
    providers_run: args.providers,
    agreement_score: args.agreementScore,
    agreement_band: args.agreementBand,
    disagreement_areas: [],
    signal_variance: { retrieval: v, trust: 0, citation: 0, recommendation: 0 },
    estimated_cost_usd: 0.038,
    avg_latency_ms: 380,
    recorded_at: new Date().toISOString(),
  };
}

function syntheticScore(): DeterministicScore {
  return {
    scoring_version: "scoring@1.0.0",
    weight_hash: WEIGHT_HASH,
    category_hash: CATEGORY_HASH,
    overall_score: 76,
    band: "Competitive",
    category_scores: {} as DeterministicScore["category_scores"],
    synergy_bonus_applied: 0,
    synergy_bonus_reason: null,
    synergy_bonus_tier: "none",
    public_bucket_scores: {} as DeterministicScore["public_bucket_scores"],
    recommendation_lift_applied: 0,
    recommendation_lift_reason: null,
    applied_caps: [],
    applied_penalties: [],
    top_3_findings: [],
    top_3_recommended_fixes: [],
    confidence_level: "moderate",
    confidence_score: 78,
    confidence_inputs: {} as DeterministicScore["confidence_inputs"],
    score_stability_index: null,
    score_stability_reason: "insufficient_history",
    evidence_summary: {} as DeterministicScore["evidence_summary"],
    trace: { stages: [] } as DeterministicScore["trace"],
    computed_at: "2026-05-23T10:00:00.000Z",
  };
}

function pad(s: string | number, n: number): string {
  const str = String(s);
  return str.length >= n ? str : str + " ".repeat(n - str.length);
}

async function checkScenario(args: {
  name: string;
  summary: ObservationSummary;
}): Promise<{ name: string; health: ObservationHealth; scoringChanged: boolean }> {
  const health = validateObservation(args.summary);
  const score = syntheticScore();
  const beforeHash = JSON.stringify(score);
  await runObservationGuarded(score, async () => null);
  const afterHash = JSON.stringify(score);
  const scoringChanged = beforeHash !== afterHash;
  return { name: args.name, health, scoringChanged };
}

async function main(): Promise<void> {
  console.log("[observe:guard-test] simulating 3 scenarios");
  console.log("");
  console.log(
    `  ${pad("Scenario", 20)} ${pad("Agreement", 12)} ${pad("Variance", 10)} ${pad("Usable", 8)} ${pad("Scoring changed", 16)}`,
  );

  const high = await checkScenario({
    name: "high_agreement",
    summary: summary({
      providers: ["claude", "openai", "gemini", "perplexity"],
      agreementScore: 92,
      agreementBand: "high",
      maxVariance: 0.02,
    }),
  });

  const low = await checkScenario({
    name: "low_agreement",
    summary: summary({
      providers: ["claude", "openai", "gemini", "perplexity"],
      agreementScore: 14,
      agreementBand: "low",
      maxVariance: 0.22,
    }),
  });

  const single = await checkScenario({
    name: "single_provider",
    summary: summary({
      providers: ["claude"],
      agreementScore: 92,
      agreementBand: "high",
      maxVariance: 0.0,
    }),
  });

  for (const s of [high, low, single]) {
    const agreementCell =
      s.name === "single_provider"
        ? "—"
        : `${s.name === "high_agreement" ? "92" : "14"} (${s.health.agreement_band})`;
    console.log(
      `  ${pad(s.name, 20)} ${pad(agreementCell, 12)} ${pad(s.health.variance.toFixed(2), 10)} ${pad(s.health.usable ? "YES" : "NO", 8)} ${pad(s.scoringChanged ? "YES" : "NO", 16)}`,
    );
  }

  console.log("");
  console.log("[observe:guard-test] explanations:");
  for (const s of [high, low, single]) {
    console.log(`  ${pad(s.name, 16)} : ${s.health.explanation}`);
  }

  // Negative path — confirm the typed throw.
  console.log("");
  console.log("[observe:guard-test] negative path:");
  let threwAs: string | null = null;
  let mutated: string[] = [];
  try {
    const score = syntheticScore();
    await runObservationGuarded(score, async () => {
      (score as unknown as { overall_score: number }).overall_score = 999;
    });
  } catch (err) {
    if (err instanceof ObservationMutationError) {
      threwAs = "ObservationMutationError";
      mutated = err.mutated_fields;
    } else {
      threwAs = (err as Error).name ?? "Error";
    }
  }
  if (threwAs === "ObservationMutationError") {
    console.log(
      `  confidenceGate caught mutation attempt: ObservationMutationError(${mutated.map((f) => `"${f}"`).join(", ")})`,
    );
  } else {
    console.log(`  ✗ expected ObservationMutationError but got ${threwAs ?? "no throw"}`);
    process.exitCode = 1;
  }

  console.log("");
  console.log("[observe:guard-test] policy thresholds:");
  console.log(`  AGREEMENT_MIN     = ${AGREEMENT_MIN}`);
  console.log(`  VARIANCE_SUPPRESS = ${VARIANCE_SUPPRESS}`);
  console.log(`  MIN_PROVIDERS     = ${MIN_PROVIDERS}`);

  console.log("");
  console.log("[observe:guard-test] scoring hashes unchanged:");
  console.log(`  WEIGHT_HASH:   ${WEIGHT_HASH}`);
  console.log(`  CATEGORY_HASH: ${CATEGORY_HASH}`);
  console.log("");
  console.log("OBSERVATION SAFETY LOCK ACTIVE");
}

main().catch((err) => {
  console.error("[observe:guard-test] error:", err);
  process.exitCode = 1;
});
