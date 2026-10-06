/* eslint-disable no-console */
/** Proof Engine — comparable vs non-comparable measurements, partial runs (DB-free). */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { compareMeasurements, type CycleSnapshot } from "../src/lib/monitoring/proof/compare";
import { results } from "./lib/proof-fakes";

let passed = 0, failed = 0;
function check(label: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✓ ${label}`); } catch (e) { failed += 1; console.log(`  ✗ ${label} — ${(e as Error).message}`); }
}
const P = ["p1", "p2", "p3"];
const PROV = ["openai", "claude"];
const snap = (o: Partial<CycleSnapshot> & { results: CycleSnapshot["results"] }): CycleSnapshot => ({
  id: "c", startedAt: new Date("2026-10-01T00:00:00Z"), status: "completed", questionSetId: "qs1", questionSetVersion: 1,
  providers: PROV, samplesPerPrompt: 2, competitors: [{ id: "comp_a", name: "Rival", normalizedName: "rival", domain: null }], ...o,
});

console.log("[proof-compare] running...");

check("same set, providers, sampling and configuration → comparable, with deltas", () => {
  const b = snap({ id: "b", results: results(P, PROV, 2, { mentionedCount: 3, nativeDomains: ["yelp.example"] }) });
  const f = snap({ id: "f", results: results(P, PROV, 2, { mentionedCount: 7, nativeDomains: ["yelp.example", "bbb.example"] }) });
  const c = compareMeasurements(b, f, "example.com");
  assert.equal(c.comparable, true, c.reasons.join("; "));
  assert.equal(c.comparablePairs, 6);
  assert.equal(c.mentionRate.baseline, 3 / 12);
  assert.equal(c.mentionRate.followUp, 7 / 12);
  assert.deepEqual(c.citationDomains, { gained: ["bbb.example"], lost: [], kept: ["yelp.example"] });
});

const base = snap({ id: "b", results: results(P, PROV, 2, { mentionedCount: 3 }) });
for (const [label, follow] of [
  ["question set changed (different version)", snap({ id: "f", questionSetVersion: 2, results: results(P, PROV, 2, { mentionedCount: 3 }) })],
  ["question set changed (different set)", snap({ id: "f", questionSetId: "qs2", results: results(P, PROV, 2, { mentionedCount: 3 }) })],
  ["follow-up not measured against a fixed set", snap({ id: "f", questionSetId: null, questionSetVersion: null, results: results(P, PROV, 2, { mentionedCount: 3 }) })],
  ["different AI systems", snap({ id: "f", providers: ["openai"], results: results(P, ["openai"], 2, { mentionedCount: 3 }) })],
  ["different samples per question", snap({ id: "f", samplesPerPrompt: 1, results: results(P, PROV, 1, { mentionedCount: 3 }) })],
  ["model / search configuration changed (fingerprint)", snap({ id: "f", results: results(P, PROV, 2, { mentionedCount: 3, fingerprint: "fp-new-model" }) })],
] as const) {
  check(`not comparable: ${label} — with a reason, and no deltas`, () => {
    const c = compareMeasurements(base, follow, "example.com");
    assert.equal(c.comparable, false);
    assert.ok(c.reasons.length > 0);
    assert.equal(c.mentionRate.change, null);
    assert.equal(c.competitorShare.change, null);
  });
}

check("competitor share alone is non-comparable when tracked competitors changed", () => {
  const f = snap({ id: "f", competitors: [], results: results(P, PROV, 2, { mentionedCount: 4 }) });
  const c = compareMeasurements(base, f, "example.com");
  assert.equal(c.comparable, true);
  assert.equal(c.competitorShareComparable, false);
  assert.match(c.competitorShareReason ?? "", /competitors changed/);
  assert.notEqual(c.mentionRate.change, null);
});

check("partial runs: failed samples are excluded from rates (never counted as 'not named')", () => {
  const b = snap({ id: "b", results: results(P, PROV, 2, { mentionedCount: 6 }) });
  const f = snap({ id: "f", status: "partial", results: results(P, PROV, 2, { mentionedCount: 6, failEvery: 4 }) });
  const c = compareMeasurements(b, f, "example.com");
  assert.equal(c.comparable, true);
  assert.equal(c.comparableSamples.followUp, 9, "3 of 12 samples failed and are excluded");
  const followMeasured = f.results.filter((r) => r.status === "measured");
  assert.equal(c.mentionRate.followUp, followMeasured.filter((r) => r.mentioned).length / followMeasured.length);
});

console.log(`[proof-compare] passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
