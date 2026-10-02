/* eslint-disable no-console */
/**
 * scripts/test-tracking-samples.ts — repeated measurement: per-sample rows,
 * "k of n", measured-only rates, and compatibility-aware comparisons.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { T0, harness } from "./lib/monitoring-fakes";
import { createFakeClient, createFakeTrackingStore, makeResult as r } from "./lib/tracking-fakes";
import { runMonitoringCycle } from "../src/lib/monitoring/tracking/cycle";
import { compareCycles, computeCycleMetrics, fingerprintDifference } from "../src/lib/monitoring/tracking/metrics";
import { configFingerprint } from "../src/lib/monitoring/tracking/normalize";

const h = harness("tracking-samples");
const subject = { subscriptionId: "msub_1", businessName: "Rock Roofing", websiteUrl: "https://rockroofing.com", customerDomain: "rockroofing.com" };

(async () => {
  console.log("[tracking-samples] running...");

  await h.check("2 samples per (question, AI system) → independent rows, each with fingerprint + cost", async () => {
    const { store, rows } = createFakeTrackingStore([{ id: "p1", text: "best roofer in Toledo?" }]);
    let i = 0;
    const { client, calls } = createFakeClient(() => ({ text: ++i % 2 ? "1. **Rock Roofing**\n2. **Acme**" : "Try **Acme**.", usage: { inputTokens: 100, outputTokens: 200, searchCalls: 1 } }));
    const res = await runMonitoringCycle({ store, client, subject, activePrompts: [{ id: "p1" }], activeCompetitors: [], providers: ["openai", "perplexity"], samplesPerPrompt: 2, cycleKey: "k", trigger: "manual", now: () => T0 });
    assert.equal(calls.length, 4);
    assert.deepEqual(rows.map((x) => `${x.provider}#${x.sampleIndex}`).sort(), ["openai#0", "openai#1", "perplexity#0", "perplexity#1"]);
    assert.ok(rows.every((x) => x.configFingerprint && typeof x.costUsd === "number"));
    assert.equal(res.outcome === "ran" && res.metrics?.answers, 4);
    assert.ok(res.outcome === "ran" && typeof res.estimatedCostUsd === "number" && res.estimatedCostUsd > 0);
  });

  await h.check("pair stats report 'named in k of n measured samples'", () => {
    const m = computeCycleMetrics([
      r({ sampleIndex: 0, mentioned: true }),
      r({ sampleIndex: 1, mentioned: false }),
      r({ provider: "gemini", sampleIndex: 0, status: "not_measured", callState: "failed", mentioned: null }),
      r({ provider: "gemini", sampleIndex: 1, mentioned: true }),
    ], null, []);
    const openai = m.pairs.find((p) => p.provider === "openai")!;
    const gemini = m.pairs.find((p) => p.provider === "gemini")!;
    assert.deepEqual([openai.named, openai.measured, openai.samples], [1, 2, 2]);
    assert.deepEqual([gemini.named, gemini.measured, gemini.samples], [1, 1, 2]);
    assert.equal(m.mentionRate, 2 / 3);
    assert.equal(m.coverage, 3 / 4);
  });

  await h.check("comparison uses only pairs measured in both runs under the SAME configuration", () => {
    const prev = [r({ mentioned: false, configFingerprint: "A" }), r({ sampleIndex: 1, mentioned: false, configFingerprint: "A" }), r({ provider: "gemini", mentioned: true, configFingerprint: "G" })];
    const curr = [r({ mentioned: true, configFingerprint: "A" }), r({ sampleIndex: 1, mentioned: true, configFingerprint: "A" }), r({ provider: "gemini", mentioned: true, configFingerprint: "G2" })];
    const c = compareCycles(prev, curr, null, []);
    assert.equal(c.comparable, true);
    assert.equal(c.comparablePairs, 1);
    assert.equal(c.incompatiblePairs.length, 1);
    assert.equal(c.incompatiblePairs[0]!.provider, "gemini");
    assert.deepEqual(c.mentionRate, { previous: 0, current: 1, change: 1 });
    assert.deepEqual(c.gainedMentions, [{ trackedPromptId: "p1", provider: "openai" }]);
  });

  await h.check("all pairs incompatible → not comparable, with a plain-language reason, no delta", () => {
    const fp1 = configFingerprint({ promptVersion: "tracking-prompt@1.0.0", provider: "openai", model: "gpt-4.1-mini", searchSettings: { grounding: "web_search", tool: "web_search_preview" } });
    const fp2 = configFingerprint({ promptVersion: "tracking-prompt@2.0.0", provider: "openai", model: "gpt-4.1-mini", searchSettings: { grounding: "web_search", tool: "web_search_preview" } });
    const c = compareCycles([r({ configFingerprint: fp1 })], [r({ configFingerprint: fp2, mentioned: true })], null, []);
    assert.equal(c.comparable, false);
    assert.equal(c.mentionRate.change, null);
    assert.match(c.reason ?? "", /question format version changed/);
  });

  await h.check("fingerprint differences are explained (model, search, method)", () => {
    assert.match(fingerprintDifference("v|p|m1|web:a|e|d", "v|p|m2|web:a|e|d"), /AI model changed/);
    assert.match(fingerprintDifference("v|p|m|web:a|e|d", "v|p|m|none:none|e|d"), /search settings changed/);
    assert.match(fingerprintDifference("v|p|m|s|e1|d", "v|p|m|s|e2|d"), /measurement method changed/);
  });

  h.done();
})();
