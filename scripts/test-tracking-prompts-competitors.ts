/* eslint-disable no-console */
/**
 * scripts/test-tracking-prompts-competitors.ts — prompt creation + limits,
 * custom and suggested prompts, competitor limits, detected competitors,
 * and plan entitlements.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { EARLY_ACCESS_ENTITLEMENTS, entitlementsForPlan, findPlan, type PlanEntitlements } from "../src/lib/monitoring/plans";
import { decideCompetitorAdd, detectCompetitors } from "../src/lib/monitoring/tracking/competitors";
import { buildEntityMatcher } from "../src/lib/monitoring/tracking/detector";
import { decidePromptAdd, extractSuggestionContext, normalizePromptText, suggestPrompts } from "../src/lib/monitoring/tracking/prompts";

const h = harness("tracking-prompts-competitors");
const ent = EARLY_ACCESS_ENTITLEMENTS;
const customer = buildEntityMatcher({ id: "customer", name: "Rock Roofing LLC", websiteUrl: "https://rockroofing.com" });

(async () => {
  console.log("[tracking-prompts-competitors] running...");

  await h.check("Early Access monthly plan grants 1 re-audit/cycle, 10 prompts, 3 competitors, 4 providers, 2 samples", () => {
    const e = entitlementsForPlan("monthly");
    assert.equal(e.fullReauditsPerCycle, 1);
    assert.equal(e.maxActivePrompts, 10);
    assert.equal(e.maxCompetitors, 3);
    assert.equal(e.samplesPerPrompt, 2);
    assert.deepEqual([...e.providers].sort(), ["claude", "gemini", "openai", "perplexity"]);
    assert.ok(e.historicalScoreTracking && e.citationTracking && e.reportHistory);
    assert.ok(!("price" in (findPlan("monthly") ?? {})), "entitlements carry no pricing");
  });

  await h.check("unknown plan key keeps Early Access limits (never strips a paying customer)", () => {
    assert.deepEqual(entitlementsForPlan("retired-plan"), EARLY_ACCESS_ENTITLEMENTS);
  });

  await h.check("custom prompt accepted, cleaned, and normalized for dedup", () => {
    const d = decidePromptAdd({ text: "  Who is the  best roofer in Toledo?  ", activeNormalized: [], entitlements: ent });
    assert.equal(d.ok, true);
    if (d.ok) {
      assert.equal(d.text, "Who is the best roofer in Toledo?");
      assert.equal(d.normalizedText, "who is the best roofer in toledo");
    }
  });

  await h.check("duplicate (case/punctuation-insensitive), too short, and too long are rejected", () => {
    const active = [normalizePromptText("Who is the best roofer in Toledo?")];
    const dup = decidePromptAdd({ text: "WHO IS THE BEST ROOFER IN TOLEDO", activeNormalized: active, entitlements: ent });
    assert.equal(!dup.ok && dup.reason, "duplicate");
    assert.equal((decidePromptAdd({ text: "roofer?", activeNormalized: [], entitlements: ent }) as { reason?: string }).reason, "too_short");
    assert.equal((decidePromptAdd({ text: "x".repeat(301), activeNormalized: [], entitlements: ent }) as { reason?: string }).reason, "too_long");
  });

  await h.check("prompt limit comes from entitlements (10 Early Access; configurable per plan)", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `question number ${i}`);
    const full = decidePromptAdd({ text: "one more question please", activeNormalized: ten, entitlements: ent });
    assert.equal(!full.ok && full.reason, "limit_reached");
    const bigger: PlanEntitlements = { ...ent, maxActivePrompts: 25 };
    assert.equal(decidePromptAdd({ text: "one more question please", activeNormalized: ten, entitlements: bigger }).ok, true);
    const none: PlanEntitlements = { ...ent, maxActivePrompts: 0 };
    assert.equal((decidePromptAdd({ text: "one more question please", activeNormalized: [], entitlements: none }) as { reason?: string }).reason, "not_entitled");
  });

  await h.check("suggested prompts come from category/services/location and exclude branded + already-tracked", () => {
    const ctx = extractSuggestionContext({
      businessName: "Rock Roofing",
      industrySlug: "roofing",
      aiValidations: { outputs: [
        { location_identified: "Toledo, OH", services_identified: ["Roof repair", "Gutters"], industry_identified: "Roofing contractor" },
        { location_identified: "unknown", services_identified: ["Roof repair"] },
      ] },
    });
    assert.equal(ctx.city, "Toledo, OH");
    assert.deepEqual(ctx.services, ["Roof repair", "Gutters"]);
    const s = suggestPrompts(ctx);
    assert.ok(s.length >= 2, s.join(" | "));
    assert.ok(s.some((q) => /Toledo/.test(q)), "location-aware");
    assert.ok(s.every((q) => !/rock roofing/i.test(q)), "branded questions excluded");
    const tracked = [normalizePromptText(s[0]!)];
    assert.ok(!suggestPrompts(ctx, tracked).includes(s[0]!), "already-tracked suggestion hidden");
  });

  await h.check("suggestions never invent a city when none was detected", () => {
    const s = suggestPrompts(extractSuggestionContext({ businessName: "Rock Roofing", industrySlug: "roofing", aiValidations: null }));
    assert.ok(s.length > 0);
    assert.ok(s.every((q) => !/Toledo/.test(q)));
  });

  await h.check("competitor add: normalized, URL normalized to domain, limit 3, own business rejected", () => {
    const ok = decideCompetitorAdd({ name: "Other Roofing Co.", websiteUrl: "otherroofing.com", activeNormalized: [], entitlements: ent, customer });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.normalizedName, "other roofing");
      assert.equal(ok.domain, "otherroofing.com");
      assert.equal(ok.websiteUrl, "https://otherroofing.com");
    }
    const full = decideCompetitorAdd({ name: "Fourth Co", activeNormalized: ["a", "b", "c"], entitlements: ent, customer });
    assert.equal(!full.ok && full.reason, "limit_reached");
    const self = decideCompetitorAdd({ name: "Rock Roofing", activeNormalized: [], entitlements: ent, customer });
    assert.equal(!self.ok && self.reason, "is_customer");
    const dup = decideCompetitorAdd({ name: "OTHER ROOFING", activeNormalized: ["other roofing"], entitlements: ent, customer });
    assert.equal(!dup.ok && dup.reason, "duplicate");
  });

  await h.check("detected competitors: aggregated from measured answers, excluding the customer and tracked ones", () => {
    const base = { provider: "openai", sampleIndex: 0, callState: "completed", mentioned: false, position: null, positionStatus: "no_ordered_list", configFingerprint: "fp", citedDomains: [], competitorIdsMentioned: [], costUsd: null };
    const d = detectCompetitors([
      { ...base, trackedPromptId: "p1", status: "measured", namedBusinesses: ["Acme Roofing", "Rock Roofing", "Best Roofs"] },
      { ...base, trackedPromptId: "p2", status: "measured", provider: "gemini", namedBusinesses: ["Acme Roofing LLC"] },
      { ...base, trackedPromptId: "p3", status: "not_measured", namedBusinesses: ["Ghost Co"] },
    ], customer, ["best roofs"]);
    assert.deepEqual(d.map((x) => [x.normalizedName, x.answers]), [["acme roofing", 2]]);
    assert.deepEqual(d[0]!.providers.sort(), ["gemini", "openai"]);
  });

  h.done();
})();
