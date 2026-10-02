/* eslint-disable no-console */
/**
 * scripts/test-tracking-normalize.ts — answer normalization: mentioned /
 * not mentioned / NOT_MEASURED, position only from a clear ordered list,
 * citations, fingerprint, cost.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { extractUrlsFromText, mergeCitations, normalizeCitationUrl } from "../src/lib/monitoring/tracking/citations";
import { buildEntityMatcher, normalizeEntityName } from "../src/lib/monitoring/tracking/detector";
import { configFingerprint, normalizeProviderAnswer } from "../src/lib/monitoring/tracking/normalize";
import type { ProviderAnswer } from "../src/lib/monitoring/tracking/types";

const h = harness("tracking-normalize");
const customer = buildEntityMatcher({ id: "customer", name: "Rock Roofing LLC", websiteUrl: "https://www.rockroofing.com" });
const comp = buildEntityMatcher({ id: "c1", name: "Acme Roofing", websiteUrl: "https://acmeroof.com" });
const PV = "tracking-prompt@2.0.0";
const ok = (text: string, over: Partial<Extract<ProviderAnswer, { ok: true }>> = {}): ProviderAnswer => ({
  ok: true, provider: "perplexity", model: "sonar", searchSettings: { grounding: "web_search", tool: "sonar-native" }, answerText: text,
  nativeCitationUrls: [], raw: { text, citations: [], searchQueries: [], finishReason: "stop", responseId: "r1", usage: null },
  usage: { inputTokens: 100, outputTokens: 400, searchCalls: 1 }, providerRequestId: null, latencyMs: 10, ...over,
});
const norm = (a: ProviderAnswer) => normalizeProviderAnswer(a, customer, [comp], PV);

(async () => {
  console.log("[tracking-normalize] running...");

  await h.check("entity names normalize away case, punctuation, legal suffixes, leading 'the'", () => {
    assert.equal(normalizeEntityName("The Rock Roofing, L.L.C."), "rock roofing");
    assert.equal(normalizeEntityName("Smith & Sons Inc."), "smith and sons");
  });

  await h.check("clear numbered list containing the customer → ranked position", () => {
    const r = norm(ok("Best roofers:\n1. **Acme Roofing** – reviews\n2. **Rock Roofing** – family owned\n3. **Other Co**"));
    assert.equal(r.status, "measured");
    assert.equal(r.mentioned, true);
    assert.equal(r.positionStatus, "ranked");
    assert.equal(r.position, 2);
    assert.deepEqual(r.competitorIdsMentioned, ["c1"]);
  });

  await h.check("numbered list without the customer → not_in_list, position null (even if mentioned in prose)", () => {
    const r = norm(ok("1. **Acme Roofing**\n2. **Other Co**\n\nRock Roofing is another option some people use."));
    assert.equal(r.mentioned, true);
    assert.equal(r.positionStatus, "not_in_list");
    assert.equal(r.position, null);
  });

  await h.check("bullets / prose order → no_ordered_list, position null — never inferred, never 0", () => {
    const r = norm(ok("- **Rock Roofing** – great\n- **Acme Roofing** – also great"));
    assert.equal(r.mentioned, true);
    assert.equal(r.positionStatus, "no_ordered_list");
    assert.equal(r.position, null);
  });

  await h.check("mentioned via cited domain (subdomain-aware)", () => {
    const r = norm(ok("See local options.", { nativeCitationUrls: ["https://blog.rockroofing.com/post"] }));
    assert.equal(r.mentioned, true);
    assert.ok(r.matchEvidence?.matchedBy.includes("cited_domain"));
  });

  await h.check("measured answer naming only others → mentioned=false", () => {
    const r = norm(ok("Try **Acme Roofing**."));
    assert.equal(r.mentioned, false);
  });

  await h.check("no false positive on a substring of a longer word", () => {
    const short = buildEntityMatcher({ id: "x", name: "Ace", websiteUrl: null });
    assert.equal(normalizeProviderAnswer(ok("We replaced the surface of the roof."), short, [], PV).mentioned, false);
  });

  await h.check("known failure → NOT_MEASURED, callState failed, all measurements null/empty", () => {
    const r = norm({ ok: false, provider: "gemini", model: "g", outcome: "failed", errorCode: "provider_error", errorMessage: "HTTP 503", latencyMs: 5 });
    assert.equal(r.status, "not_measured");
    assert.equal(r.callState, "failed");
    assert.equal(r.mentioned, null);
    assert.equal(r.positionStatus, "not_measured");
    assert.equal(r.costUsd, null);
  });

  await h.check("timeout → NOT_MEASURED with callState unknown (may have been billed)", () => {
    const r = norm({ ok: false, provider: "claude", model: "c", outcome: "unknown", errorCode: "timeout", errorMessage: "No answer", latencyMs: 60000 });
    assert.equal(r.callState, "unknown");
    assert.equal(r.status, "not_measured");
  });

  await h.check("raw response, fingerprint, and estimated cost are recorded", () => {
    const r = norm(ok("Answer"));
    assert.equal(r.rawResponse?.responseId, "r1");
    assert.equal(r.configFingerprint, configFingerprint({ promptVersion: PV, provider: "perplexity", model: "sonar", searchSettings: { grounding: "web_search", tool: "sonar-native" } }));
    assert.equal(r.costSource, "estimated");
    assert.ok((r.costUsd ?? 0) > 0);
  });

  await h.check("citations: native first, text URLs merged, tracking params stripped, deduped", () => {
    assert.deepEqual(extractUrlsFromText("See https://yelp.com/biz/rock). Also (https://bbb.org/x?utm_source=a)."), ["https://yelp.com/biz/rock", "https://bbb.org/x?utm_source=a"]);
    assert.equal(normalizeCitationUrl("HTTPS://WWW.Yelp.com/a?utm_medium=x#frag"), "https://www.yelp.com/a");
    assert.deepEqual(mergeCitations(["https://www.yelp.com/a"], ["https://www.yelp.com/a?utm_source=z"]).urls, ["https://www.yelp.com/a"]);
  });

  h.done();
})();
