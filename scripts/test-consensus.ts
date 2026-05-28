/* eslint-disable no-console */
/**
 * scripts/test-consensus.ts
 *
 * Hermetic test suite for the cross-model consensus layer.
 * No network. No DB. Pure-function assertions over fixtures.
 *
 *   npx tsx scripts/test-consensus.ts
 *
 * Exit code 0 on all pass; 1 on any fail.
 */

import { computeAgreement } from "../src/lib/consensus/agreement";
import { computeDimensions } from "../src/lib/consensus/dimensions";
import { deriveFindings } from "../src/lib/consensus/findings";
import {
  computeConfidenceIndex,
  computeConsensusConfidence,
  computeVerdict,
} from "../src/lib/consensus/index_compute";
import {
  CONSENSUS_VERSION,
  computeConsensusIndex,
} from "../src/lib/consensus/index";
import type { Dimensions } from "../src/lib/consensus/types";
import type {
  CategoryPublic,
  CategoryKey,
  DeterministicScore,
} from "../src/lib/scoring/types";
import type {
  NormalizedValidationOutput,
  ValidationLayerResult,
} from "../src/lib/validators/types";

// ── Fixture builders ────────────────────────────────────────────────

const CATEGORY_MAX: Record<CategoryKey, number> = {
  schema: 25,
  crawler: 20,
  trust: 20,
  content: 15,
  brand: 10,
  tech: 10,
};

function cat(score: number, max: number): CategoryPublic {
  return {
    score,
    max,
    signals: [],
    issues: [],
    reason: "fixture",
    evidence_used: [],
    category_confidence: 0.8,
  };
}

function fixtureScore(scores: Partial<Record<CategoryKey, number>>): DeterministicScore {
  return {
    scoring_version: "scoring@1.0.0",
    weight_hash: "test",
    category_hash: "test",
    overall_score: 50,
    band: "Needs Work",
    category_scores: {
      schema: cat(scores.schema ?? 0, CATEGORY_MAX.schema),
      crawler: cat(scores.crawler ?? 0, CATEGORY_MAX.crawler),
      trust: cat(scores.trust ?? 0, CATEGORY_MAX.trust),
      content: cat(scores.content ?? 0, CATEGORY_MAX.content),
      brand: cat(scores.brand ?? 0, CATEGORY_MAX.brand),
      tech: cat(scores.tech ?? 0, CATEGORY_MAX.tech),
    },
    synergy_bonus_applied: 0,
    synergy_bonus_reason: null,
    synergy_bonus_tier: "none",
    public_bucket_scores: {
      understanding: { score: 0, max: 35, percentage: 0 },
      retrieval: { score: 0, max: 30, percentage: 0 },
      trust: { score: 0, max: 20, percentage: 0 },
      recommendation: { score: 0, max: 15, percentage: 0 },
    },
    recommendation_lift_applied: 0,
    recommendation_lift_reason: null,
    applied_caps: [],
    applied_penalties: [],
    top_3_findings: [],
    top_3_recommended_fixes: [],
    confidence_level: "moderate",
    confidence_score: 75,
    confidence_inputs: {
      evidence_completeness: 100,
      preflight_success: 100,
      schema_certainty: 80,
      entity_certainty: 75,
      content_extraction_quality: 100,
      render_coverage: 50,
    },
    score_stability_index: null,
    score_stability_count: 0,
    trace: { stages: [] },
    computed_at: "2026-05-28T00:00:00.000Z",
  } as unknown as DeterministicScore;
}

function fixtureValidator(
  provider: string,
  overrides: Partial<NormalizedValidationOutput> = {},
): NormalizedValidationOutput {
  return {
    provider,
    status: "passed",
    business_understanding_score: 70,
    category_confidence: "medium",
    service_area_confidence: "medium",
    recommendation_confidence: "medium",
    missing_facts: [],
    cited_sources: [],
    raw_summary: `[fixture] ${provider}`,
    error: null,
    ...overrides,
  };
}

function fixtureResult(outputs: NormalizedValidationOutput[]): ValidationLayerResult {
  return {
    outputs,
    ran_at: "2026-05-28T00:00:00.000Z",
    enabled: true,
  };
}

// ── Test runner ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
    passed += 1;
  } else {
    const line = `  ✗ ${label}${detail ? ` — ${detail}` : ""}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

// ── Scenario 1: Dimension roll-up math ──────────────────────────────

function scenario1Dimensions(): void {
  console.log("[test-consensus] Scenario 1: dimension roll-up math");

  // All-zero deterministic → all-zero dimensions
  {
    const dims = computeDimensions(fixtureScore({}));
    check(
      "all-zero categories → all-zero dimensions",
      Object.values(dims).every((d) => d.score === 0),
    );
    check(
      "all-zero dimensions → level Invisible Risk",
      Object.values(dims).every((d) => d.level === "Invisible Risk"),
    );
  }

  // Full-max deterministic → all-100 dimensions
  {
    const dims = computeDimensions(
      fixtureScore({ schema: 25, crawler: 20, trust: 20, content: 15, brand: 10, tech: 10 }),
    );
    check(
      "max categories → all 100",
      Object.values(dims).every((d) => d.score === 100),
    );
    check(
      "max categories → all Exceptional",
      Object.values(dims).every((d) => d.level === "Exceptional"),
    );
  }

  // Schema-only → schema_quality high, others reflect their formulas
  {
    const dims = computeDimensions(fixtureScore({ schema: 25 }));
    check(
      "schema=25, others=0 → schema_quality 100",
      dims.schema_quality.score === 100,
    );
    check(
      "schema=25, brand=0 → business_identity 40 (brand 0.60 + schema 0.40)",
      dims.business_identity.score === 40,
    );
    check(
      "schema=25, trust=0 → trust_signals 0",
      dims.trust_signals.score === 0,
    );
  }

  // Crawler + content half → coverage_depth combination
  {
    const dims = computeDimensions(fixtureScore({ crawler: 10, content: 7.5 }));
    // crawler 50% × 0.60 + content 50% × 0.40 = 30 + 20 = 50
    check(
      "crawler 50% + content 50% → coverage_depth 50",
      dims.coverage_depth.score === 50,
    );
  }
}

// ── Scenario 2: Cross-model agreement math ──────────────────────────

function scenario2Agreement(): void {
  console.log("[test-consensus] Scenario 2: agreement math");

  // 0 passed
  {
    const a = computeAgreement(fixtureResult([]));
    check("0 providers → agreement Insufficient", a.agreement_label === "Insufficient");
    check("0 providers → stdev null", a.business_understanding_stdev === null);
    check("0 providers → category majority null", a.category_confidence_majority === null);
  }

  // 1 passed (still below N≥2 gate)
  {
    const a = computeAgreement(
      fixtureResult([fixtureValidator("openai", { business_understanding_score: 70 })]),
    );
    check("1 provider → still Insufficient (N≥2 gate)", a.agreement_label === "Insufficient");
    check("1 provider → providers_passed 1", a.providers_passed === 1);
  }

  // 2 passed, stdev = 5 → Strong
  {
    const a = computeAgreement(
      fixtureResult([
        fixtureValidator("openai", { business_understanding_score: 70 }),
        fixtureValidator("claude", { business_understanding_score: 80 }),
      ]),
    );
    check("2 providers, scores [70,80] → stdev 5", a.business_understanding_stdev === 5);
    check("2 providers, stdev 5 → agreement Strong", a.agreement_label === "Strong");
  }

  // 3 passed, wider stdev → Moderate
  {
    const a = computeAgreement(
      fixtureResult([
        fixtureValidator("openai", { business_understanding_score: 40 }),
        fixtureValidator("claude", { business_understanding_score: 70 }),
        fixtureValidator("gemini", { business_understanding_score: 60 }),
      ]),
    );
    // mean = 56.66..., variance ≈ (16.66²+13.33²+3.33²)/3 ≈ 155.5, stdev ≈ 12.47
    check("3 providers wider spread → agreement Moderate", a.agreement_label === "Moderate");
  }

  // 3 passed, very wide stdev → Divergent
  {
    const a = computeAgreement(
      fixtureResult([
        fixtureValidator("openai", { business_understanding_score: 20 }),
        fixtureValidator("claude", { business_understanding_score: 70 }),
        fixtureValidator("gemini", { business_understanding_score: 95 }),
      ]),
    );
    check("3 providers very wide spread → agreement Divergent", a.agreement_label === "Divergent");
  }

  // Majority math: 2 high + 1 low → high
  {
    const a = computeAgreement(
      fixtureResult([
        fixtureValidator("openai", { category_confidence: "high", business_understanding_score: 70 }),
        fixtureValidator("claude", { category_confidence: "high", business_understanding_score: 75 }),
        fixtureValidator("gemini", { category_confidence: "low", business_understanding_score: 72 }),
      ]),
    );
    check("majority math: 2 high + 1 low → high", a.category_confidence_majority === "high");
  }

  // Ties favor higher level
  {
    const a = computeAgreement(
      fixtureResult([
        fixtureValidator("openai", { service_area_confidence: "high", business_understanding_score: 70 }),
        fixtureValidator("claude", { service_area_confidence: "medium", business_understanding_score: 75 }),
      ]),
    );
    check("tie high/medium → favors high", a.service_area_confidence_majority === "high");
  }
}

// ── Scenario 3: Confidence Index + label thresholds ─────────────────

function scenario3IndexAndLabels(): void {
  console.log("[test-consensus] Scenario 3: index + label thresholds");

  // All dimensions 50 → confidence_index 50 (weights sum to 1.00)
  {
    const dims: Dimensions = {
      business_identity: { score: 50, level: "Limited", contributing_categories: [] },
      schema_quality: { score: 50, level: "Limited", contributing_categories: [] },
      trust_signals: { score: 50, level: "Limited", contributing_categories: [] },
      service_clarity: { score: 50, level: "Limited", contributing_categories: [] },
      coverage_depth: { score: 50, level: "Limited", contributing_categories: [] },
      recommendation_readiness: { score: 50, level: "Limited", contributing_categories: [] },
    };
    const { confidence_index, confidence_band } = computeConfidenceIndex(dims);
    check("all-50 dims → index 50", confidence_index === 50);
    check("index 50 → band Limited", confidence_band === "Limited");
  }

  // All dimensions 100 → confidence_index 100
  {
    const dims: Dimensions = {
      business_identity: { score: 100, level: "Exceptional", contributing_categories: [] },
      schema_quality: { score: 100, level: "Exceptional", contributing_categories: [] },
      trust_signals: { score: 100, level: "Exceptional", contributing_categories: [] },
      service_clarity: { score: 100, level: "Exceptional", contributing_categories: [] },
      coverage_depth: { score: 100, level: "Exceptional", contributing_categories: [] },
      recommendation_readiness: { score: 100, level: "Exceptional", contributing_categories: [] },
    };
    const { confidence_index, confidence_band } = computeConfidenceIndex(dims);
    check("all-100 dims → index 100", confidence_index === 100);
    check("index 100 → band Exceptional", confidence_band === "Exceptional");
  }

  // Verdict thresholds
  check("verdict 39 → Weak Visibility", computeVerdict(39) === "Weak Visibility");
  check("verdict 40 → Moderate Visibility", computeVerdict(40) === "Moderate Visibility");
  check("verdict 74 → Moderate Visibility", computeVerdict(74) === "Moderate Visibility");
  check("verdict 75 → Strong Visibility", computeVerdict(75) === "Strong Visibility");
  check("verdict 100 → Strong Visibility", computeVerdict(100) === "Strong Visibility");

  // Consensus Confidence labels
  const insufficientAgreement = computeAgreement(fixtureResult([]));
  check(
    "consensus_confidence: Insufficient when N<2",
    computeConsensusConfidence(insufficientAgreement) === "Insufficient",
  );
}

// ── Scenario 4: Findings derivation ─────────────────────────────────

function scenario4Findings(): void {
  console.log("[test-consensus] Scenario 4: findings derivation");

  const allMax = fixtureScore({ schema: 25, crawler: 20, trust: 20, content: 15, brand: 10 });
  const dimsMax = computeDimensions(allMax);
  const findingsMax = deriveFindings({
    deterministicScore: allMax,
    dimensions: dimsMax,
    validatorOutputs: [],
  });
  check(
    "all-strong dimensions → strong_signals populated (up to 5)",
    findingsMax.strong_signals.length > 0 && findingsMax.strong_signals.length <= 5,
  );
  check("all-strong dimensions → visibility_gaps empty", findingsMax.visibility_gaps.length === 0);

  const allZero = fixtureScore({});
  const dimsZero = computeDimensions(allZero);
  const findingsZero = deriveFindings({
    deterministicScore: allZero,
    dimensions: dimsZero,
    validatorOutputs: [],
  });
  check("all-zero dimensions → strong_signals empty", findingsZero.strong_signals.length === 0);
  check(
    "all-zero dimensions → visibility_gaps populated (up to 5)",
    findingsZero.visibility_gaps.length > 0 && findingsZero.visibility_gaps.length <= 5,
  );

  // Cross-model missing facts: ≥2 providers agree → surfaced as action
  const findingsWithThemes = deriveFindings({
    deterministicScore: allZero,
    dimensions: dimsZero,
    validatorOutputs: [
      fixtureValidator("openai", { missing_facts: ["Service area not stated"] }),
      fixtureValidator("claude", { missing_facts: ["Service area not stated"] }),
    ],
  });
  check(
    "≥2 providers agree on missing fact → surfaced as cross-model action",
    findingsWithThemes.immediate_actions.some((a) => a.startsWith("Cross-model concern:")),
  );

  // Single provider's missing fact → NOT surfaced
  const findingsSingleProvider = deriveFindings({
    deterministicScore: allZero,
    dimensions: dimsZero,
    validatorOutputs: [
      fixtureValidator("openai", { missing_facts: ["Service area not stated"] }),
    ],
  });
  check(
    "1 provider missing fact → NOT surfaced (N≥2 required)",
    !findingsSingleProvider.immediate_actions.some((a) => a.startsWith("Cross-model concern:")),
  );
}

// ── Scenario 5: Public entry + replay determinism ───────────────────

function scenario5PublicEntryAndReplay(): void {
  console.log("[test-consensus] Scenario 5: public entry + replay determinism");

  const score = fixtureScore({ schema: 18, crawler: 14, trust: 12, content: 9, brand: 7 });
  const validatorResult = fixtureResult([
    fixtureValidator("openai", { business_understanding_score: 60 }),
    fixtureValidator("claude", { business_understanding_score: 70 }),
    fixtureValidator("gemini", { business_understanding_score: 65 }),
  ]);
  const fixedNow = "2026-05-28T12:34:56.000Z";

  const first = computeConsensusIndex({
    deterministicScore: score,
    validatorResult,
    nowIso: fixedNow,
  });
  check("public entry returns ConsensusIndex with all fields", typeof first.confidence_index === "number");
  check("consensus_version stamped", first.consensus_version === CONSENSUS_VERSION);
  check("computed_at echoes injected nowIso", first.computed_at === fixedNow);

  // Replay determinism: 100 trials with same inputs → byte-equal JSON
  const firstJson = JSON.stringify(first);
  let allByteEqual = true;
  for (let i = 0; i < 100; i++) {
    const next = computeConsensusIndex({
      deterministicScore: score,
      validatorResult,
      nowIso: fixedNow,
    });
    if (JSON.stringify(next) !== firstJson) {
      allByteEqual = false;
      break;
    }
  }
  check("100 replays with same inputs → byte-equal", allByteEqual);

  // N<2 → consensus_confidence Insufficient, but confidence_index still computed
  const sparseResult = fixtureResult([fixtureValidator("openai")]);
  const sparse = computeConsensusIndex({
    deterministicScore: score,
    validatorResult: sparseResult,
    nowIso: fixedNow,
  });
  check(
    "N=1 → consensus_confidence Insufficient",
    sparse.consensus_confidence === "Insufficient",
  );
  check(
    "N=1 → confidence_index still computed (deterministic-derived)",
    typeof sparse.confidence_index === "number" && sparse.confidence_index >= 0,
  );

  // validatorResult: null → still works
  const noValidators = computeConsensusIndex({
    deterministicScore: score,
    validatorResult: null,
    nowIso: fixedNow,
  });
  check("validatorResult: null → consensus_confidence Insufficient", noValidators.consensus_confidence === "Insufficient");
  check("validatorResult: null → confidence_index still computed", typeof noValidators.confidence_index === "number");
}

// ── Main ────────────────────────────────────────────────────────────

function main(): void {
  console.log("[test-consensus] starting");
  console.log("");
  scenario1Dimensions();
  scenario2Agreement();
  scenario3IndexAndLabels();
  scenario4Findings();
  scenario5PublicEntryAndReplay();
  console.log("");
  console.log(`[test-consensus] passed=${passed} failed=${failed} total=${passed + failed}`);
  if (failed > 0) {
    console.log("\n[test-consensus] FAILURES:");
    for (const f of failures) console.log(f);
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
