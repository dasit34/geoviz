/* eslint-disable no-console */
/**
 * scripts/test-tracking-metrics.ts — rates, share of voice, citation
 * intelligence, recommendations (evidence-backed).
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { makeResult as r } from "./lib/tracking-fakes";
import { buildCitationIntel } from "../src/lib/monitoring/tracking/citation-intel";
import { computeCycleMetrics } from "../src/lib/monitoring/tracking/metrics";
import { buildRecommendations, issuesFromDeterministicScore } from "../src/lib/monitoring/tracking/recommendations";
import type { CompetitorRef } from "../src/lib/monitoring/tracking/types";

const h = harness("tracking-metrics");
const comps: CompetitorRef[] = [
  { id: "c1", name: "Acme Roofing", normalizedName: "acme roofing", domain: "acmeroof.com" },
  { id: "c2", name: "Best Roofs", normalizedName: "best roofs", domain: null },
];

(async () => {
  console.log("[tracking-metrics] running...");
  const results = [
    r({ trackedPromptId: "p1", provider: "openai", mentioned: true, positionStatus: "ranked", position: 2, citedDomains: ["rockroofing.com", "yelp.com"], competitorIdsMentioned: ["c1"] }),
    r({ trackedPromptId: "p1", provider: "gemini", mentioned: false, citedDomains: ["yelp.com", "angi.com"], competitorIdsMentioned: ["c1", "c2"] }),
    r({ trackedPromptId: "p2", provider: "openai", mentioned: true, positionStatus: "ranked", position: 1, citedDomains: ["yelp.com"] }),
    r({ trackedPromptId: "p2", provider: "gemini", status: "not_measured", callState: "failed", mentioned: null, positionStatus: "not_measured" }),
  ];

  await h.check("rates use measured samples only; coverage reported; failures never count as 'no'", () => {
    const m = computeCycleMetrics(results, "rockroofing.com", comps);
    assert.equal(m.answers, 4);
    assert.equal(m.measured, 3);
    assert.equal(m.coverage, 0.75);
    assert.equal(m.mentionRate, 2 / 3);
    assert.equal(m.citationRate, 1 / 3);
    assert.equal(m.averagePosition, 1.5);
    assert.equal(m.rankedSamples, 2);
  });

  await h.check("average position ignores mentions without a clear ordered list", () => {
    const m = computeCycleMetrics([r({ mentioned: true, positionStatus: "no_ordered_list", position: null })], "rockroofing.com", comps);
    assert.equal(m.averagePosition, null);
    assert.equal(m.rankedSamples, 0);
  });

  await h.check("share of voice = you ÷ (you + tracked competitor mentions)", () => {
    const m = computeCycleMetrics(results, "rockroofing.com", comps);
    assert.equal(m.shareOfVoice, 2 / 5);
    assert.equal(m.competitors.find((c) => c.id === "c2")?.citationRate, null);
  });

  await h.check("share of voice is NOT measured when no competitors are tracked (never a default 100%)", () => {
    const m = computeCycleMetrics([r({ mentioned: true }), r({ trackedPromptId: "p2", mentioned: false })], "rockroofing.com", []);
    assert.equal(m.mentionRate, 0.5);
    assert.equal(m.shareOfVoice, null);
  });

  await h.check("nothing measured → every rate null, coverage 0", () => {
    const m = computeCycleMetrics([r({ status: "not_measured", callState: "unknown", mentioned: null })], "rockroofing.com", comps);
    assert.equal(m.mentionRate, null);
    assert.equal(m.shareOfVoice, null);
    assert.equal(m.coverage, 0);
    assert.equal(m.unknownOutcomes, 1);
  });

  await h.check("citation intel: gaps = ≥2 competitor answers, 0 customer; competitor's own site never a gap", () => {
    const ci = buildCitationIntel([
      r({ citedDomains: ["angi.com", "yelp.com"], competitorIdsMentioned: ["c1"] }),
      r({ trackedPromptId: "p2", citedDomains: ["angi.com", "acmeroof.com"], competitorIdsMentioned: ["c1"] }),
      r({ trackedPromptId: "p3", mentioned: true, citedDomains: ["yelp.com", "rockroofing.com"] }),
    ], "rockroofing.com", comps);
    assert.deepEqual(ci.opportunities.map((o) => o.domain), ["angi.com"]);
    assert.equal(ci.customerSiteCitedCount, 1);
  });

  await h.check("recommendations cite their evidence, use the 5 categories, sorted by priority", () => {
    const det = { category_scores: {
      schema: { issues: [{ id: "schema.no_localbusiness", severity: "critical", category_key: "schema", message: "No LocalBusiness schema" }] },
      trust: { issues: [{ id: "trust.nap_inconsistent", severity: "warning", category_key: "trust", message: "NAP mismatch" }] },
    } };
    const metrics = computeCycleMetrics(Array.from({ length: 4 }, (_, i) => r({ trackedPromptId: `p${i}`, competitorIdsMentioned: ["c1"] })), "rockroofing.com", comps);
    const recs = buildRecommendations({
      audit: { completedAt: new Date("2026-09-01T00:00:00Z"), issues: issuesFromDeterministicScore(det) },
      metrics,
      citations: buildCitationIntel([r({ citedDomains: ["angi.com"], competitorIdsMentioned: ["c1"] }), r({ trackedPromptId: "p2", citedDomains: ["angi.com"], competitorIdsMentioned: ["c1"] })], "rockroofing.com", comps),
      detectedCompetitors: [],
      customerName: "Rock Roofing",
    });
    const byId = new Map(recs.map((x) => [x.id, x]));
    assert.equal(byId.get("audit:schema.no_localbusiness")?.category, "structured_data");
    assert.equal(byId.get("audit:trust.nap_inconsistent")?.category, "business_identity");
    assert.match(byId.get("tracking:not_named")!.evidence, /0 of 4/);
    assert.match(byId.get("tracking:citation_gaps")!.action, /does not guarantee/);
    assert.ok(recs.every((x, i) => i === 0 || recs[i - 1]!.priority <= x.priority));
  });

  await h.check("no evidence → no invented recommendations", () => {
    assert.deepEqual(buildRecommendations({ audit: null, metrics: null, citations: null, detectedCompetitors: [], customerName: "X" }), []);
  });

  h.done();
})();
