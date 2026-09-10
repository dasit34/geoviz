/* eslint-disable no-console */
/**
 * scripts/test-market-study-view.ts
 *
 * Pure unit tests for the studyView rollup helpers used by both the
 * list route and the detail route. No DB.
 *
 *   npx tsx scripts/test-market-study-view.ts
 */
import assert from "node:assert/strict";

import {
  countEntryStatuses,
  scoreStats,
  toAggregateRows,
  type StudyEntryRow,
} from "../src/lib/market-studies/studyView";
import { computeStudyAggregate } from "../src/lib/market-studies/aggregates";

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

function entry(over: Partial<StudyEntryRow> = {}): StudyEntryRow {
  return {
    id: "e",
    leadId: "l",
    auditOrderId: "o",
    businessName: "Biz",
    websiteUrl: "https://biz.com",
    skipReason: null,
    createdAt: new Date(),
    auditOrder: {
      reportStatus: "generated",
      reportGeneratedAt: new Date(),
      intelligence: {
        overallScore: 50,
        deterministicScore: {
          overall_score: 50,
          top_3_findings: [{ id: "schema.no_jsonld" }],
          category_scores: {
            schema: { score: 10, max: 25 },
            crawler: { score: 10, max: 20 },
            trust: { score: 6, max: 20 },
            content: { score: 9, max: 15 },
            brand: { score: 7, max: 10 },
            tech: { score: 8, max: 10 },
          },
        } as never,
        industryCategoryNormalized: "roofing",
      },
    },
    lead: { id: "l", status: "QUALIFIED", outreach: [] },
    ...over,
  };
}

console.log("[market-study-view] running...");

check("countEntryStatuses tallies derived statuses", () => {
  const c = countEntryStatuses([
    entry(),
    entry({ auditOrder: { reportStatus: "queued" } as never }),
    entry({ auditOrder: { reportStatus: "running" } as never }),
    entry({ auditOrder: { reportStatus: "failed" } as never }),
    entry({ skipReason: "No website", auditOrder: null }),
  ]);
  assert.equal(c.total, 5);
  assert.equal(c.completed, 1);
  assert.equal(c.queued, 1);
  assert.equal(c.running, 1);
  assert.equal(c.failed, 1);
  assert.equal(c.skipped, 1);
});

check("scoreStats over completed entries only", () => {
  const s = scoreStats([
    entry({ auditOrder: { reportStatus: "generated", intelligence: { overallScore: 40 } } as never }),
    entry({ auditOrder: { reportStatus: "generated", intelligence: { overallScore: 60 } } as never }),
    entry({ auditOrder: { reportStatus: "queued", intelligence: { overallScore: 999 } } as never }),
    entry({ skipReason: "x", auditOrder: null }),
  ]);
  assert.equal(s.avg, 50);
  assert.equal(s.min, 40);
  assert.equal(s.max, 60);
  assert.equal(s.median, 50);
});

check("scoreStats → all null when nothing completed", () => {
  const s = scoreStats([entry({ auditOrder: { reportStatus: "queued" } as never })]);
  assert.deepEqual(s, { avg: null, median: null, min: null, max: null });
});

check("toAggregateRows → computeStudyAggregate composes end-to-end", () => {
  const entries = [
    entry(),
    entry(),
    entry(),
    entry({ auditOrder: { reportStatus: "failed" } as never }),
    entry({ skipReason: "No website", auditOrder: null }),
  ];
  const rows = toAggregateRows(entries);
  assert.equal(rows.length, 3, "only completed entries");
  const agg = computeStudyAggregate(rows);
  assert.equal(agg.auditedCount, 3);
  assert.equal(agg.insufficientData, false);
  assert.equal(agg.avgScore, 50);
  assert.equal(agg.topFindings[0].id, "schema.no_jsonld");
  assert.equal(agg.topFindings[0].pctAffected, 100);
});

if (failed > 0) {
  console.log(`[market-study-view] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[market-study-view] passed=${passed} failed=0`);
