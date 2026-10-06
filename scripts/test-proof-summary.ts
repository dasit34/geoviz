/* eslint-disable no-console */
/** Proof Engine — monthly owner summary: counted facts only, limitations, failures (DB-free). */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { results } from "./lib/proof-fakes";
import { buildOwnerSummary, ownerSummaryText } from "../src/lib/monitoring/proof/owner-summary";
import type { CycleSnapshot } from "../src/lib/monitoring/proof/compare";

let passed = 0, failed = 0;
function check(label: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✓ ${label}`); } catch (e) { failed += 1; console.log(`  ✗ ${label} — ${(e as Error).message}`); }
}
const D = (s: string) => new Date(`2026-${s}T00:00:00Z`);
const PROV = ["openai", "claude"];
const snap = (id: string, at: string, rs: CycleSnapshot["results"], o: Partial<CycleSnapshot> = {}): CycleSnapshot => ({
  id, startedAt: D(at), status: "completed", questionSetId: "qs1", questionSetVersion: 1, providers: PROV, samplesPerPrompt: 2,
  competitors: [{ id: "comp_a", name: "Rival Roofing", normalizedName: "rival roofing", domain: null }], results: rs, ...o,
});
const questions = [
  { trackedPromptId: "p1", text: "What does Example Co do, and who is it for?", intent: "branded_accuracy" as const },
  { trackedPromptId: "p2", text: "Who are the best plumbers in Toledo?", intent: "unbranded_discovery" as const },
];
const base = {
  businessName: "Example Co", customerDomain: "example.com", period: { from: D("09-01"), to: D("10-01") }, questions,
  competitorNames: { comp_a: "Rival Roofing" },
  recommendations: [{ title: "Add LocalBusiness schema", action: "Add JSON-LD" }, { title: "Fix NAP", action: "Match phone" }, { title: "Add FAQ", action: "Write FAQ" }, { title: "Fourth", action: "x" }],
  tasks: [{ id: "t1", title: "Add LocalBusiness schema", status: "verified" }, { id: "t2", title: "Ignored suggestion", status: "suggested" }],
  experiments: [{ improvementTaskId: "t1", outcome: "improvement_observed" as const }],
};

console.log("[proof-summary] running...");

check("improved/declined come only from comparable pairs, named by AI system and question", () => {
  const prev = snap("c1", "09-01", results(["p1", "p2"], PROV, 2, { mentionedCount: 0 }));
  const curr = snap("c2", "10-01", results(["p1", "p2"], PROV, 2, { mentionedCount: 2, competitorIds: ["comp_a"], nativeDomains: ["yelp.example"] }));
  const s = buildOwnerSummary({ ...base, previous: prev, current: curr });
  assert.ok(s.improved.length > 0);
  assert.match(s.improved[0]!, /^Now named by OpenAI for "What does Example Co do/);
  assert.deepEqual(s.topCompetitors, [{ name: "Rival Roofing", answers: 8 }]);
  assert.equal(s.priorityActions.length, 3);
  assert.deepEqual(s.previousActions, [{ title: "Add LocalBusiness schema", status: "Verified on the website", outcome: "Improvement observed after implementation" }]);
});

check("non-comparable previous measurement → nothing claimed as improved/declined, reason given", () => {
  const prev = snap("c1", "09-01", results(["p1", "p2"], PROV, 2, { mentionedCount: 0 }), { questionSetVersion: 2 });
  const curr = snap("c2", "10-01", results(["p1", "p2"], PROV, 2, { mentionedCount: 6 }));
  const s = buildOwnerSummary({ ...base, previous: prev, current: curr });
  assert.deepEqual([s.improved, s.declined], [[], []]);
  assert.match(s.comparisonNote ?? "", /Not compared with the previous measurement: the question set changed/);
});

check("branded-accuracy failures, citation gaps and provider failures are reported; failures never counted as 'not named'", () => {
  const curr = snap("c2", "10-01", results(["p1", "p2"], PROV, 2, { mentionedCount: 0, failEvery: 4 }));
  const s = buildOwnerSummary({ ...base, previous: null, current: curr });
  assert.ok(s.accuracyIssues.length > 0 && s.accuracyIssues.every((x) => /without identifying the business/.test(x)));
  assert.ok(s.sources.gaps.some((g) => /wasn't returned as a source/.test(g)));
  assert.ok(s.limitations.some((l) => /couldn't be measured/.test(l) && /never counted as "not named"/.test(l)));
  assert.equal(s.measuredAnswers, 6);
  assert.match(s.comparisonNote ?? "", /first measurement/);
});

check("no fabricated statistics: no percentile, ranking, industry-average or benchmark language", () => {
  const curr = snap("c2", "10-01", results(["p1", "p2"], PROV, 2, { mentionedCount: 3, competitorIds: ["comp_a"], nativeDomains: ["example.com", "bbb.example"] }));
  const text = ownerSummaryText(buildOwnerSummary({ ...base, previous: snap("c1", "09-01", results(["p1", "p2"], PROV, 2, { mentionedCount: 1 })), current: curr }));
  assert.ok(!/percentile|industry average|average business|ranked #|rank \d|top \d+%|benchmark|guarantee/i.test(text), text);
  assert.match(text, /Limitations/);
  assert.match(text, /not identical to the consumer ChatGPT, Claude, Gemini or Perplexity apps/);
  assert.match(text, /Your website was returned as a source in \d+ answer/);
});

check("no measurement yet → honest empty summary", () => {
  const s = buildOwnerSummary({ ...base, previous: null, current: null });
  assert.equal(s.measuredAnswers, 0);
  assert.equal(s.comparisonNote, "No measurement has been taken yet.");
});

console.log(`[proof-summary] passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
