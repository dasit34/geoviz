/* eslint-disable no-console */
/**
 * scripts/test-market-study-aggregates.ts
 *
 * Pure unit tests for computeStudyAggregate + buildCaseStudySummary.
 * Fixture rows only — no DB.
 *
 *   npx tsx scripts/test-market-study-aggregates.ts
 */
import assert from "node:assert/strict";

import {
  computeStudyAggregate,
  MIN_STUDY_AUDITS,
} from "../src/lib/market-studies/aggregates";
import { buildCaseStudySummary } from "../src/lib/market-studies/caseStudySummary";
import type {
  StudyAuditRow,
} from "../src/lib/market-studies/types";
import type { DeterministicScore } from "../src/lib/scoring/types";

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

/** Minimal DeterministicScore — only the fields the aggregator reads. */
function det(
  overall: number,
  findingIds: string[],
  catRatios?: Partial<Record<string, number>>,
): DeterministicScore {
  const ratios = {
    schema: 0.4,
    crawler: 0.5,
    trust: 0.3,
    content: 0.6,
    brand: 0.7,
    tech: 0.8,
    ...catRatios,
  };
  const max: Record<string, number> = {
    schema: 25,
    crawler: 20,
    trust: 20,
    content: 15,
    brand: 10,
    tech: 10,
  };
  const category_scores = Object.fromEntries(
    Object.entries(ratios).map(([k, r]) => [
      k,
      { score: (r ?? 0) * max[k], max: max[k] },
    ]),
  );
  return {
    overall_score: overall,
    top_3_findings: findingIds.map((id) => ({
      id,
      severity: "warning",
      category: id.split(".")[0],
      message: id,
    })),
    category_scores,
  } as unknown as DeterministicScore;
}

function row(
  overall: number | null,
  score: DeterministicScore | null,
  industry: string | null = "roofing",
): StudyAuditRow {
  return { overallScore: overall, deterministicScore: score, industry };
}

console.log("[market-study-aggregates] running...");

check("empty → auditedCount 0, insufficientData true", () => {
  const a = computeStudyAggregate([]);
  assert.equal(a.auditedCount, 0);
  assert.equal(a.insufficientData, true);
  assert.equal(a.avgScore, null);
  assert.equal(a.topFindings.length, 0);
});

check(`< ${MIN_STUDY_AUDITS} completed → insufficientData true`, () => {
  const a = computeStudyAggregate([
    row(40, det(40, ["schema.no_jsonld"])),
    row(60, det(60, ["trust.nap_inconsistent"])),
  ]);
  assert.equal(a.auditedCount, 2);
  assert.equal(a.insufficientData, true);
  assert.equal(a.avgScore, 50);
});

check("avg / median / min / max over overall scores", () => {
  const a = computeStudyAggregate([
    row(20, det(20, [])),
    row(40, det(40, [])),
    row(60, det(60, [])),
    row(90, det(90, [])),
  ]);
  assert.equal(a.auditedCount, 4);
  assert.equal(a.insufficientData, false);
  assert.equal(a.avgScore, 52.5);
  assert.equal(a.minScore, 20);
  assert.equal(a.maxScore, 90);
  assert.equal(a.medianScore, 40); // floor-index percentile(0.5) of 4 → idx 1
});

check("score distribution uses the 5 frozen bands", () => {
  const a = computeStudyAggregate([
    row(10, det(10, [])), // Invisible
    row(35, det(35, [])), // At Risk
    row(55, det(55, [])), // Needs Work
    row(75, det(75, [])), // Competitive
    row(95, det(95, [])), // AI-Ready
  ]);
  const byBand = Object.fromEntries(
    a.scoreDistribution.map((b) => [b.band, b.count]),
  );
  assert.deepEqual(byBand, {
    Invisible: 1,
    "At Risk": 1,
    "Needs Work": 1,
    Competitive: 1,
    "AI-Ready": 1,
  });
  assert.equal(a.scoreDistribution[0].pct, 20);
});

check("top findings ranked with % affected", () => {
  const a = computeStudyAggregate([
    row(40, det(40, ["schema.no_jsonld", "trust.nap_inconsistent"])),
    row(45, det(45, ["schema.no_jsonld"])),
    row(50, det(50, ["schema.no_jsonld", "content.thin_content"])),
    row(55, det(55, ["trust.nap_inconsistent"])),
  ]);
  assert.equal(a.topFindings[0].id, "schema.no_jsonld");
  assert.equal(a.topFindings[0].count, 3);
  assert.equal(a.topFindings[0].pctAffected, 75);
  assert.ok(
    a.topFindings[0].label.length > 3 &&
      !a.topFindings[0].label.includes("schema.no_jsonld"),
    "label is human-readable",
  );
});

check("legacy rows (null deterministicScore) counted separately", () => {
  const a = computeStudyAggregate([
    row(40, det(40, ["schema.no_jsonld"])),
    row(50, det(50, ["schema.no_jsonld"])),
    row(30, null), // legacy — still in avg/min/max, NOT in findings
    row(70, null),
  ]);
  assert.equal(a.auditedCount, 4);
  assert.equal(a.legacyCount, 2);
  assert.equal(a.avgScore, 47.5);
  assert.equal(a.minScore, 30);
  // findings computed over 2 deterministic rows only → 100%
  assert.equal(a.topFindings[0].pctAffected, 100);
});

check("category averages are 0–100 means, deterministic rows only", () => {
  const a = computeStudyAggregate([
    row(40, det(40, [], { schema: 0.2 })),
    row(60, det(60, [], { schema: 0.6 })),
    row(80, det(80, [], { schema: 1.0 })),
  ]);
  assert.equal(a.categoryAverages.schema, 60); // mean(20,60,100)
});

check("rows with null overallScore are excluded entirely", () => {
  const a = computeStudyAggregate([
    row(null, det(0, ["schema.no_jsonld"])),
    row(40, det(40, ["schema.no_jsonld"])),
    row(50, det(50, ["schema.no_jsonld"])),
    row(60, det(60, ["schema.no_jsonld"])),
  ]);
  assert.equal(a.auditedCount, 3);
  assert.equal(a.avgScore, 50);
});

// ── case study summary ──
check("case study summary is factual + carries no company names", () => {
  const a = computeStudyAggregate([
    row(40, det(40, ["schema.no_jsonld"])),
    row(55, det(55, ["schema.no_jsonld", "trust.nap_inconsistent"])),
    row(60, det(60, ["schema.no_jsonld"])),
    row(70, det(70, ["content.thin_content"])),
  ]);
  const lines = buildCaseStudySummary(
    { category: "roofing", city: "Columbus", state: "OH" },
    a,
  );
  const text = lines.join(" ");
  assert.match(text, /We audited 4 roofing companies in Columbus, OH\./);
  assert.match(text, /Average GeoViz score: 56.3\/100\./);
  assert.match(text, /75% had no machine-readable business profile/);
  assert.ok(!/Rick|Acme|LLC/.test(text), "no individual business names");
});

check("case study summary degrades without city/state/category", () => {
  const a = computeStudyAggregate([
    row(40, det(40, [])),
    row(50, det(50, [])),
    row(60, det(60, [])),
  ]);
  const lines = buildCaseStudySummary(
    { category: null, city: null, state: null },
    a,
  );
  assert.match(lines[0], /We audited 3 local businesses\./);
});

check("case study summary says so when data is thin", () => {
  const lines = buildCaseStudySummary(
    { category: "hvac", city: null, state: "TX" },
    computeStudyAggregate([row(40, det(40, []))]),
  );
  assert.match(lines[0], /collecting more results/i);
});

if (failed > 0) {
  console.log(`[market-study-aggregates] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[market-study-aggregates] passed=${passed} failed=0`);
