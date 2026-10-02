/* eslint-disable no-console */
/**
 * scripts/test-tracking-metrics.ts — mention/citation rates, share of voice,
 * average position, provider breakdown, historical comparison, citation
 * intelligence, and evidence-backed recommendations.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { buildCitationIntel } from "../src/lib/monitoring/tracking/citation-intel";
import { compareCycles, computeCycleMetrics } from "../src/lib/monitoring/tracking/metrics";
import { buildRecommendations, issuesFromDeterministicScore } from "../src/lib/monitoring/tracking/recommendations";
import type { CompetitorRef, ResultForMetrics } from "../src/lib/monitoring/tracking/types";

const h = harness("tracking-metrics");
const comps: CompetitorRef[] = [
  { id: "c1", name: "Acme Roofing", normalizedName: "acme roofing", domain: "acmeroof.com" },
  { id: "c2", name: "Best Roofs", normalizedName: "best roofs", domain: null },
];
function r(over: Partial<ResultForMetrics>): ResultForMetrics {
  return { trackedPromptId: "p1", provider: "openai", status: "measured", mentioned: false, position: null, citedDomains: [], namedBusinesses: [], competitorIdsMentioned: [], ...over };
}

(async () => {
  console.log("[tracking-metrics] running...");

  const results = [
    r({ trackedPromptId: "p1", provider: "openai", mentioned: true, position: 2, citedDomains: ["rockroofing.com", "yelp.com"], competitorIdsMentioned: ["c1"] }),
    r({ trackedPromptId: "p1", provider: "gemini", mentioned: false, citedDomains: ["yelp.com", "angi.com"], competitorIdsMentioned: ["c1", "c2"] }),
    r({ trackedPromptId: "p2", provider: "openai", mentioned: true, position: 1, citedDomains: ["yelp.com"] }),
    r({ trackedPromptId: "p2", provider: "gemini", status: "not_measured", mentioned: null }),
  ];

  await h.check("rates use measured answers only; failures are excluded, never counted as 'no'", () => {
    const m = computeCycleMetrics(results, "rockroofing.com", comps);
    assert.equal(m.answers, 4);
    assert.equal(m.measured, 3);
    assert.equal(m.notMeasured, 1);
    assert.equal(m.customerMentions, 2);
    assert.equal(m.mentionRate, 2 / 3);
    assert.equal(m.citationRate, 1 / 3);
    assert.equal(m.averagePosition, 1.5);
  });

  await h.check("share of voice = you ÷ (you + tracked competitor mentions)", () => {
    const m = computeCycleMetrics(results, "rockroofing.com", comps);
    // customer 2, Acme 2, Best Roofs 1
    assert.equal(m.shareOfVoice, 2 / 5);
    assert.equal(m.competitors.find((c) => c.id === "c1")?.mentionRate, 2 / 3);
    assert.equal(m.competitors.find((c) => c.id === "c2")?.citationRate, null, "no website → citation rate not measurable");
  });

  await h.check("provider-by-provider breakdown", () => {
    const m = computeCycleMetrics(results, "rockroofing.com", comps);
    assert.equal(m.byProvider.openai?.mentionRate, 1);
    assert.equal(m.byProvider.gemini?.mentionRate, 0);
    assert.equal(m.byProvider.gemini?.notMeasured, 1);
  });

  await h.check("nothing measured → every rate null (not 0)", () => {
    const m = computeCycleMetrics([r({ status: "not_measured", mentioned: null })], "rockroofing.com", comps);
    assert.equal(m.mentionRate, null);
    assert.equal(m.citationRate, null);
    assert.equal(m.shareOfVoice, null);
    assert.equal(m.averagePosition, null);
  });

  await h.check("history: comparison uses only (question, AI system) pairs measured in BOTH runs", () => {
    const prev = [
      r({ trackedPromptId: "p1", provider: "openai", mentioned: false }),
      r({ trackedPromptId: "p1", provider: "gemini", mentioned: true }),
      r({ trackedPromptId: "p2", provider: "openai", status: "not_measured", mentioned: null }),
    ];
    const curr = [
      r({ trackedPromptId: "p1", provider: "openai", mentioned: true }),
      r({ trackedPromptId: "p1", provider: "gemini", mentioned: true }),
      r({ trackedPromptId: "p2", provider: "openai", mentioned: true }), // not measured before → excluded
      r({ trackedPromptId: "p3", provider: "openai", mentioned: true }), // new question → excluded
    ];
    const c = compareCycles(prev, curr, "rockroofing.com", comps);
    assert.equal(c.comparable, true);
    assert.equal(c.comparablePairs, 2);
    assert.deepEqual(c.mentionRate, { previous: 0.5, current: 1, change: 0.5 });
    assert.deepEqual(c.gainedMentions, [{ trackedPromptId: "p1", provider: "openai" }]);
    assert.deepEqual(c.lostMentions, []);
  });

  await h.check("history: no overlapping measured pairs → not comparable, no fabricated change", () => {
    const c = compareCycles([r({ trackedPromptId: "p1" })], [r({ trackedPromptId: "p9" })], "rockroofing.com", comps);
    assert.equal(c.comparable, false);
    assert.equal(c.mentionRate.change, null);
  });

  await h.check("citation intel: frequent domains, who they support, and gaps (≥2 competitor answers, 0 customer)", () => {
    const set = [
      r({ mentioned: false, citedDomains: ["angi.com", "yelp.com"], competitorIdsMentioned: ["c1"] }),
      r({ trackedPromptId: "p2", mentioned: false, citedDomains: ["angi.com", "acmeroof.com"], competitorIdsMentioned: ["c1"] }),
      r({ trackedPromptId: "p3", mentioned: true, citedDomains: ["yelp.com", "rockroofing.com"] }),
    ];
    const ci = buildCitationIntel(set, "rockroofing.com", comps);
    assert.equal(ci.frequentDomains[0]?.domain, "angi.com");
    assert.deepEqual(ci.opportunities.map((o) => o.domain), ["angi.com"]);
    assert.ok(ci.supportingCustomer.some((d) => d.domain === "yelp.com"));
    assert.equal(ci.frequentDomains.find((d) => d.domain === "acmeroof.com")?.competitorSite, "Acme Roofing");
    assert.equal(ci.customerSiteCitedCount, 1);
    assert.ok(!ci.opportunities.some((o) => o.domain === "acmeroof.com"), "competitor's own site is never an 'opportunity'");
  });

  await h.check("recommendations: every action states its evidence, grouped into the 5 categories, prioritized", () => {
    const det = { category_scores: {
      schema: { issues: [{ id: "schema.no_localbusiness", severity: "critical", category_key: "schema", message: "No LocalBusiness schema" }] },
      trust: { issues: [{ id: "trust.nap_inconsistent", severity: "warning", category_key: "trust", message: "Name/address/phone don't match" }] },
    } };
    const metrics = computeCycleMetrics(Array.from({ length: 4 }, (_, i) => r({ trackedPromptId: `p${i}`, mentioned: false, competitorIdsMentioned: ["c1"] })), "rockroofing.com", comps);
    const recs = buildRecommendations({
      audit: { completedAt: new Date("2026-09-01T00:00:00Z"), issues: issuesFromDeterministicScore(det) },
      metrics,
      citations: buildCitationIntel([
        r({ citedDomains: ["angi.com"], competitorIdsMentioned: ["c1"] }),
        r({ trackedPromptId: "p2", citedDomains: ["angi.com"], competitorIdsMentioned: ["c1"] }),
      ], "rockroofing.com", comps),
      detectedCompetitors: [],
      customerName: "Rock Roofing",
    });
    const byId = new Map(recs.map((x) => [x.id, x]));
    assert.equal(byId.get("audit:schema.no_localbusiness")?.category, "structured_data");
    assert.equal(byId.get("audit:trust.nap_inconsistent")?.category, "business_identity");
    assert.equal(byId.get("tracking:not_named")?.category, "local_visibility");
    assert.equal(byId.get("tracking:not_named")?.priority, 1);
    assert.match(byId.get("tracking:not_named")!.evidence, /0 of 4/);
    assert.equal(byId.get("tracking:citation_gaps")?.category, "citations_authority");
    assert.match(byId.get("tracking:citation_gaps")!.action, /does not guarantee/);
    assert.ok(recs.every((x) => x.evidence.length > 10), "every recommendation explains its evidence");
    assert.ok(recs.every((x, i) => i === 0 || recs[i - 1]!.priority <= x.priority), "sorted by priority");
  });

  await h.check("recommendations: no evidence → no invented actions", () => {
    assert.deepEqual(buildRecommendations({ audit: null, metrics: null, citations: null, detectedCompetitors: [], customerName: "X" }), []);
  });

  h.done();
})();
