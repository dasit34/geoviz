/* eslint-disable no-console */
/**
 * scripts/test-audit-comparison.ts
 *
 *   npx tsx scripts/test-audit-comparison.ts
 *
 * Pure unit tests for the Re-Audit / Verification comparison engine
 * (`src/lib/audit-comparison/*`) — no DB, no network, synthetic
 * fixture data only. Covers:
 *   1. First-ever audit (no previous) is unaffected — handled by the
 *      caller routes 404ing when previousAuditOrderId is null; this
 *      script covers the engine itself, not routing (see
 *      test-re-audit-detection.ts for the DB-touching scenarios).
 *   5. Metric deltas calculate correctly.
 *   6. Improved/declined/unchanged classification thresholds.
 *   7. Query mismatch → NOT_COMPARABLE.
 *   8. Model-level mention/recommendation changes.
 *   9. Resolved issues detected correctly.
 *  10. Remaining (unchanged) issues shown correctly.
 */
import assert from "node:assert/strict";
import { classifyBooleanDelta, classifyScoreDelta, SCORE_DELTA_THRESHOLD } from "../src/lib/audit-comparison/classify";
import { computeDimensions } from "../src/lib/consensus/dimensions";
import { computeQueryConsistency } from "../src/lib/audit-comparison/queryConsistency";
import { buildAuditComparison } from "../src/lib/audit-comparison/buildAuditComparison";
import type { DeterministicScore } from "../src/lib/scoring/types";
import type { NormalizedValidationOutput } from "../src/lib/validators/types";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> | void {
  const onErr = (err: unknown) => {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n      ${message}`);
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => {
          passed += 1;
          console.log(`  ✓ ${name}`);
        })
        .catch(onErr);
    }
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    onErr(err);
  }
}

// ── Fixture builders ────────────────────────────────────────────────

function issue(id: string, severity: "critical" | "warning" | "info", message: string) {
  return { id, severity, category_key: "schema" as const, weight: 25, message };
}

function makeDeterministicScore(overrides: {
  overall?: number;
  schemaScore?: number;
  schemaIssues?: ReturnType<typeof issue>[];
  understandingScore?: number;
}): DeterministicScore {
  const schemaScore = overrides.schemaScore ?? 15;
  const understandingScore = overrides.understandingScore ?? 60;
  return {
    category_hash: "test",
    overall_score: overrides.overall ?? 50,
    band: "needs_work",
    category_scores: {
      schema: {
        score: schemaScore,
        max: 25,
        signals: [],
        issues: overrides.schemaIssues ?? [],
        reason: "",
        evidence_used: [],
        category_confidence: 1,
      },
      crawler: { score: 15, max: 20, signals: [], issues: [], reason: "", evidence_used: [], category_confidence: 1 },
      trust: { score: 10, max: 20, signals: [], issues: [], reason: "", evidence_used: [], category_confidence: 1 },
      content: { score: 8, max: 15, signals: [], issues: [], reason: "", evidence_used: [], category_confidence: 1 },
      brand: { score: 5, max: 10, signals: [], issues: [], reason: "", evidence_used: [], category_confidence: 1 },
      tech: { score: 7, max: 10, signals: [], issues: [], reason: "", evidence_used: [], category_confidence: 1 },
    },
    synergy_bonus_applied: 0,
    synergy_bonus_reason: null,
    synergy_bonus_tier: "none" as never,
    public_bucket_scores: {
      understanding: { score: understandingScore, max: 100, percentage: understandingScore },
      retrieval: { score: 50, max: 100, percentage: 50 },
      trust: { score: 50, max: 100, percentage: 50 },
      recommendation: { score: 40, max: 100, percentage: 40 },
    },
    recommendation_lift_applied: 0,
    recommendation_lift_reason: null,
    applied_caps: [],
    applied_penalties: [],
    top_3_findings: [],
    top_3_recommended_fixes: [],
    confidence_level: "medium",
    confidence_score: 70,
    confidence_inputs: {} as never,
    score_stability_index: null,
    score_stability_reason: "",
    evidence_summary: {} as never,
    trace: {} as never,
  } as unknown as DeterministicScore;
}

function makeValidatorOutput(overrides: {
  provider: string;
  status?: "passed" | "failed" | "unavailable";
  mentioned?: boolean;
  recommended?: boolean;
  queryText?: string;
  understandingScore?: number;
  citations?: string[];
}): NormalizedValidationOutput {
  return {
    provider: overrides.provider,
    status: overrides.status ?? "passed",
    business_understanding_score: overrides.understandingScore ?? 60,
    category_confidence: "medium",
    service_area_confidence: "medium",
    recommendation_confidence: "medium",
    missing_facts: [],
    cited_sources: overrides.citations ?? [],
    raw_summary: "",
    error: null,
    would_recommend: overrides.recommended ? "YES" : "NO",
    competitive: {
      query_text: overrides.queryText ?? "who are the best providers",
      prompt_version: "capture@1.0.0",
      raw_response: "",
      inferred_category: null,
      inferred_location: null,
      entities: overrides.mentioned ? ["Subject Business", "Competitor A"] : ["Competitor A"],
      business_named: overrides.mentioned ?? false,
      model: "test-model",
      model_version: null,
      retrieved_at: new Date().toISOString(),
      status: "passed",
      error: null,
    },
  };
}

async function run(): Promise<void> {
  console.log("\n[1] classifyScoreDelta — threshold-based classification");
  test("delta above threshold is IMPROVED", () => {
    const r = classifyScoreDelta(50, 55);
    assert.equal(r.classification, "IMPROVED");
    assert.equal(r.delta, 5);
  });
  test("delta below threshold is DECLINED", () => {
    const r = classifyScoreDelta(60, 50);
    assert.equal(r.classification, "DECLINED");
    assert.equal(r.delta, -10);
  });
  test(`delta within ±${SCORE_DELTA_THRESHOLD} is UNCHANGED (noise band)`, () => {
    const r = classifyScoreDelta(50, 51);
    assert.equal(r.classification, "UNCHANGED");
  });
  test("null previous/current is NOT_COMPARABLE", () => {
    const r = classifyScoreDelta(null, 50);
    assert.equal(r.classification, "NOT_COMPARABLE");
  });

  console.log("\n[2] classifyBooleanDelta");
  test("false → true is IMPROVED", () => {
    assert.equal(classifyBooleanDelta(false, true).classification, "IMPROVED");
  });
  test("true → false is DECLINED", () => {
    assert.equal(classifyBooleanDelta(true, false).classification, "DECLINED");
  });
  test("true → true is UNCHANGED", () => {
    assert.equal(classifyBooleanDelta(true, true).classification, "UNCHANGED");
  });

  console.log("\n[3] Query consistency");
  test("same category + same query text → consistent, match=true", () => {
    const r = computeQueryConsistency({
      previousCategory: "hvac",
      previousTaxonomyVersion: "v1",
      currentCategory: "hvac",
      currentTaxonomyVersion: "v1",
      previousOutputs: [makeValidatorOutput({ provider: "perplexity", queryText: "best HVAC company" })],
      currentOutputs: [makeValidatorOutput({ provider: "perplexity", queryText: "best HVAC company" })],
    });
    assert.equal(r.categoryConsistent, true);
    assert.equal(r.perProviderQueryMatch.perplexity, true);
  });
  test("different query text for same provider → match=false", () => {
    const r = computeQueryConsistency({
      previousCategory: "hvac",
      previousTaxonomyVersion: "v1",
      currentCategory: "hvac",
      currentTaxonomyVersion: "v1",
      previousOutputs: [makeValidatorOutput({ provider: "perplexity", queryText: "league management service" })],
      currentOutputs: [makeValidatorOutput({ provider: "perplexity", queryText: "management software provider" })],
    });
    assert.equal(r.perProviderQueryMatch.perplexity, false);
  });
  test("category changed between audits → categoryConsistent=false", () => {
    const r = computeQueryConsistency({
      previousCategory: "hvac",
      previousTaxonomyVersion: "v1",
      currentCategory: "plumbing",
      currentTaxonomyVersion: "v1",
      previousOutputs: [],
      currentOutputs: [],
    });
    assert.equal(r.categoryConsistent, false);
  });

  console.log("\n[4] buildAuditComparison — full engine, synthetic fixtures");
  await test("overall score delta calculates correctly", async () => {
    const previous = makeDeterministicScore({ overall: 49 });
    const current = makeDeterministicScore({ overall: 51 });
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date("2026-01-01"), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: previous, aiValidations: null },
      { auditOrderId: "curr", createdAt: new Date("2026-02-01"), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: current, aiValidations: null },
    );
    assert.equal(result.siteTechnical?.overall.previous, 49);
    assert.equal(result.siteTechnical?.overall.current, 51);
    assert.equal(result.siteTechnical?.overall.delta, 2);
  });

  await test("Recommendation Readiness dimension uses the real weighted composite, not public_bucket_scores.recommendation (regression: found via real FlagStat data)", async () => {
    // public_bucket_scores.recommendation is deliberately set to a
    // value nothing else matches, so this test fails loudly if the
    // engine ever reads it directly instead of computeDimensions().
    const previous = makeDeterministicScore({ overall: 49 });
    const current = makeDeterministicScore({ overall: 51 });
    previous.public_bucket_scores.recommendation = { score: 999, max: 100, percentage: 999 };
    current.public_bucket_scores.recommendation = { score: 999, max: 100, percentage: 999 };

    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: previous, aiValidations: null },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: current, aiValidations: null },
    );
    const dim = result.siteTechnical?.dimensions.find((d) => d.key === "recommendation");
    const expectedPrev = computeDimensions(previous).recommendation_readiness.score;
    const expectedCurr = computeDimensions(current).recommendation_readiness.score;
    assert.equal(dim?.previous, expectedPrev);
    assert.equal(dim?.current, expectedCurr);
    assert.notEqual(dim?.previous, 999);
  });

  await test("resolved issue is detected when it disappears between audits", async () => {
    const previous = makeDeterministicScore({
      schemaIssues: [issue("schema.no_phone", "critical", "Phone number not detected")],
    });
    const current = makeDeterministicScore({ schemaIssues: [] });
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: previous, aiValidations: null },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: current, aiValidations: null },
    );
    assert.equal(result.siteTechnical?.issues.resolved.length, 1);
    assert.equal(result.siteTechnical?.issues.resolved[0]?.id, "schema.no_phone");
  });

  await test("unchanged issue (still present) is reported as still-open, not resolved", async () => {
    const sameIssue = issue("schema.no_hours", "warning", "Business hours not detected");
    const previous = makeDeterministicScore({ schemaIssues: [sameIssue] });
    const current = makeDeterministicScore({ schemaIssues: [sameIssue] });
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: previous, aiValidations: null },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: current, aiValidations: null },
    );
    assert.equal(result.siteTechnical?.issues.unchanged.length, 1);
    assert.equal(result.siteTechnical?.issues.resolved.length, 0);
  });

  await test("new issue is detected when it appears only in the current audit", async () => {
    const previous = makeDeterministicScore({ schemaIssues: [] });
    const current = makeDeterministicScore({
      schemaIssues: [issue("schema.duplicate_nap", "warning", "Duplicate NAP detected")],
    });
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: previous, aiValidations: null },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: current, aiValidations: null },
    );
    assert.equal(result.siteTechnical?.issues.new.length, 1);
  });

  await test("model-level: gained a mention/recommendation classifies IMPROVED", async () => {
    const previousOutputs = [makeValidatorOutput({ provider: "openai", mentioned: false, recommended: false, queryText: "q" })];
    const currentOutputs = [makeValidatorOutput({ provider: "openai", mentioned: true, recommended: true, queryText: "q" })];
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: previousOutputs } },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: currentOutputs } },
    );
    const openai = result.liveModel?.providers.find((p) => p.provider === "openai");
    assert.equal(openai?.comparable, true);
    assert.equal(openai?.mentioned.classification, "IMPROVED");
    assert.equal(openai?.recommended.classification, "IMPROVED");
  });

  await test("model-level: query text mismatch marks provider NOT_COMPARABLE, not silently diffed", async () => {
    const previousOutputs = [makeValidatorOutput({ provider: "perplexity", mentioned: false, queryText: "league management service" })];
    const currentOutputs = [makeValidatorOutput({ provider: "perplexity", mentioned: true, queryText: "management software provider" })];
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: previousOutputs } },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: currentOutputs } },
    );
    const perplexity = result.liveModel?.providers.find((p) => p.provider === "perplexity");
    assert.equal(perplexity?.comparable, false);
    assert.ok(perplexity?.notComparableReason?.includes("query"));
    assert.equal(perplexity?.mentioned.classification, "NOT_COMPARABLE");
  });

  await test("model-level: provider not passed on one side is NOT_COMPARABLE", async () => {
    const previousOutputs = [makeValidatorOutput({ provider: "gemini", status: "unavailable" })];
    const currentOutputs = [makeValidatorOutput({ provider: "gemini", status: "passed" })];
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: previousOutputs } },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: currentOutputs } },
    );
    const gemini = result.liveModel?.providers.find((p) => p.provider === "gemini");
    assert.equal(gemini?.comparable, false);
  });

  await test("competitor new/gone detection", async () => {
    const previousOutputs = [
      makeValidatorOutput({ provider: "claude", queryText: "q" }),
    ];
    // Override entities directly for a precise fixture.
    previousOutputs[0]!.competitive!.entities = ["Old Competitor"];
    const currentOutputs = [makeValidatorOutput({ provider: "claude", queryText: "q" })];
    currentOutputs[0]!.competitive!.entities = ["New Competitor"];
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: previousOutputs } },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: null, aiValidations: { outputs: currentOutputs } },
    );
    assert.deepEqual(result.liveModel?.competitors.newlyAppearing, ["New Competitor"]);
    assert.deepEqual(result.liveModel?.competitors.noLongerAppearing, ["Old Competitor"]);
  });

  await test("missing deterministicScore on previous audit marks siteTechnical unavailable, never fabricated", async () => {
    const result = await buildAuditComparison(
      { auditOrderId: "prev", createdAt: new Date(), industryCategoryNormalized: null, industryTaxonomyVersion: null, deterministicScore: null, aiValidations: null },
      { auditOrderId: "curr", createdAt: new Date(), industryCategoryNormalized: "hvac", industryTaxonomyVersion: "v1", deterministicScore: makeDeterministicScore({}), aiValidations: null },
    );
    assert.equal(result.availability.siteTechnicalAvailable, false);
    assert.equal(result.siteTechnical, null);
  });

  console.log(
    `\n[audit-comparison] passed=${passed} failed=${failed} total=${passed + failed}`,
  );
  if (failed > 0) process.exit(1);
}

void run();
