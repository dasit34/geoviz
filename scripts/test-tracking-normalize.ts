/* eslint-disable no-console */
/**
 * scripts/test-tracking-normalize.ts — provider answer normalization,
 * mentioned / not-mentioned / NOT_MEASURED, position, citation extraction.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { extractUrlsFromText, mergeCitations, normalizeCitationUrl } from "../src/lib/monitoring/tracking/citations";
import { buildEntityMatcher, normalizeEntityName } from "../src/lib/monitoring/tracking/detector";
import { normalizeProviderAnswer } from "../src/lib/monitoring/tracking/normalize";
import { parseAnswerPayload } from "../src/lib/monitoring/tracking/providers";
import type { ProviderAnswer } from "../src/lib/monitoring/tracking/types";

const h = harness("tracking-normalize");
const customer = buildEntityMatcher({ id: "customer", name: "Rock Roofing LLC", websiteUrl: "https://www.rockroofing.com" });
const comp = buildEntityMatcher({ id: "c1", name: "Acme Roofing", websiteUrl: "https://acmeroof.com" });
const ok = (over: Partial<Extract<ProviderAnswer, { ok: true }>>): ProviderAnswer => ({
  ok: true, provider: "perplexity", model: "sonar", groundingMode: "web_search", answerText: "", namedBusinesses: [], nativeCitationUrls: [], latencyMs: 10, ...over,
});

(async () => {
  console.log("[tracking-normalize] running...");

  await h.check("entity names normalize away case, punctuation, legal suffixes, leading 'the'", () => {
    assert.equal(normalizeEntityName("The Rock Roofing, L.L.C."), "rock roofing");
    assert.equal(normalizeEntityName("Smith & Sons Inc."), "smith and sons");
  });

  await h.check("mentioned: name in the ordered list → position recorded (1-based)", () => {
    const r = normalizeProviderAnswer(ok({ answerText: "Top picks: Acme Roofing and Rock Roofing.", namedBusinesses: ["Acme Roofing", "Rock Roofing"] }), customer, [comp]);
    assert.equal(r.status, "measured");
    assert.equal(r.mentioned, true);
    assert.equal(r.position, 2);
    assert.deepEqual(r.competitorIdsMentioned, ["c1"]);
    assert.ok(r.matchEvidence?.matchedBy.includes("named_business"));
  });

  await h.check("mentioned via answer text only → position null (not measurable), not 0", () => {
    const r = normalizeProviderAnswer(ok({ answerText: "Many homeowners like rock roofing for repairs.", namedBusinesses: [] }), customer, []);
    assert.equal(r.mentioned, true);
    assert.equal(r.position, null);
  });

  await h.check("mentioned via cited domain (subdomain-aware)", () => {
    const r = normalizeProviderAnswer(ok({ answerText: "See local options.", nativeCitationUrls: ["https://blog.rockroofing.com/post"] }), customer, []);
    assert.equal(r.mentioned, true);
    assert.ok(r.matchEvidence?.matchedBy.includes("cited_domain"));
  });

  await h.check("not mentioned: a measured answer naming only others → mentioned=false", () => {
    const r = normalizeProviderAnswer(ok({ answerText: "Try Acme Roofing.", namedBusinesses: ["Acme Roofing"] }), customer, [comp]);
    assert.equal(r.status, "measured");
    assert.equal(r.mentioned, false);
    assert.equal(r.position, null);
  });

  await h.check("no false positive on a substring of a longer unrelated word", () => {
    const short = buildEntityMatcher({ id: "x", name: "Ace", websiteUrl: null });
    const r = normalizeProviderAnswer(ok({ answerText: "We replaced the surface of the roof." }), short, []);
    assert.equal(r.mentioned, false);
  });

  await h.check("provider failure → NOT_MEASURED: mentioned null, no citations, never a zero", () => {
    const r = normalizeProviderAnswer({ ok: false, provider: "gemini", model: "gemini-2.5-flash", errorCode: "timeout", errorMessage: "Timed out after 45s", latencyMs: 45000 }, customer, [comp]);
    assert.equal(r.status, "not_measured");
    assert.equal(r.mentioned, null);
    assert.equal(r.position, null);
    assert.equal(r.errorCode, "timeout");
    assert.deepEqual(r.citedUrls, []);
    assert.equal(r.answerText, null);
  });

  await h.check("citations: native first, text URLs merged, tracking params/fragments stripped, de-duplicated", () => {
    assert.deepEqual(extractUrlsFromText("See https://yelp.com/biz/rock-roofing). Also (https://bbb.org/x?utm_source=a)."), [
      "https://yelp.com/biz/rock-roofing",
      "https://bbb.org/x?utm_source=a",
    ]);
    assert.equal(normalizeCitationUrl("HTTPS://WWW.Yelp.com/a?utm_medium=x#frag"), "https://www.yelp.com/a");
    const m = mergeCitations(["https://www.yelp.com/a", "https://angi.com/"], ["https://yelp.com/a?utm_source=z", "https://www.yelp.com/a"]);
    assert.deepEqual(m.urls, ["https://www.yelp.com/a", "https://angi.com", "https://yelp.com/a"]);
    assert.deepEqual(m.domains, ["yelp.com", "angi.com"]);
  });

  await h.check("answer payload: JSON contract parsed; prose fallback keeps the answer measurable", () => {
    assert.deepEqual(parseAnswerPayload('Sure! {"answer":"Try Rock Roofing.","businesses":["Rock Roofing"]}'), {
      answerText: "Try Rock Roofing.",
      namedBusinesses: ["Rock Roofing"],
    });
    assert.deepEqual(parseAnswerPayload("I recommend Rock Roofing."), { answerText: "I recommend Rock Roofing.", namedBusinesses: [] });
  });

  h.done();
})();
