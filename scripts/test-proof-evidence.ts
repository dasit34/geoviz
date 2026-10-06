/* eslint-disable no-console */
/** Proof Engine — measurement evidence: provider citations only, explicit sentiment only, failures (DB-free). */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { buildRunEvidence, detectExplicitSentiment, NO_SOURCE_LABEL, providerSources, type RunRow } from "../src/lib/monitoring/proof/evidence";

let passed = 0, failed = 0;
function check(label: string, fn: () => void) {
  try { fn(); passed += 1; console.log(`  ✓ ${label}`); } catch (e) { failed += 1; console.log(`  ✗ ${label} — ${(e as Error).message}`); }
}
const T = new Date("2026-10-07T12:00:00Z");
const row = (o: Partial<RunRow> = {}): RunRow => ({
  id: "r1", trackedPromptId: "p1", provider: "openai", sampleIndex: 0, model: "gpt-4.1-mini", status: "measured", callState: "completed",
  errorCode: null, errorMessage: null, groundingMode: "web_search", answerText: "Example Roofing is highly rated in Toledo. See https://reviews.example/roofers.",
  mentioned: true, position: null, positionStatus: "no_ordered_list", namedBusinesses: ["Example Roofing"], competitorIdsMentioned: ["comp_a"],
  citedUrls: ["https://reviews.example/roofers"], rawResponse: { text: "", citations: [], searchQueries: [], finishReason: null, responseId: null, usage: null },
  matchEvidence: null, claimedAt: T, completedAt: T, ...o,
});
const opts = { businessTerms: ["Example Roofing"], competitorNames: { comp_a: "Rival Roofing" } };

console.log("[proof-evidence] running...");

check("no provider citations → 'No source returned by this provider'; URL in the answer is NOT listed as a source", () => {
  const e = buildRunEvidence(row(), "Who are the best roofers?", opts);
  assert.deepEqual(e.sources, []);
  assert.equal(e.sourcesNote, NO_SOURCE_LABEL);
  assert.deepEqual(e.urlsInAnswer, ["https://reviews.example/roofers"]);
});

check("sources are exactly the provider-returned citations (title/quote kept, de-duplicated)", () => {
  const raw = { citations: [{ url: "https://www.bbb.example/x?utm_source=a", title: "BBB", citedText: "A+ rating" }, { url: "https://www.bbb.example/x" }, { url: "not a url" }] };
  const e = buildRunEvidence(row({ rawResponse: raw, answerText: "Example Roofing is listed. https://www.bbb.example/x" }), "q", opts);
  assert.equal(e.sources.length, 1);
  assert.deepEqual(e.sources[0], { url: "https://www.bbb.example/x", domain: "bbb.example", title: "BBB", citedText: "A+ rating" });
  assert.equal(e.sourcesNote, null);
  assert.deepEqual(e.urlsInAnswer, [], "a URL the provider also cited isn't repeated as answer-only");
});

check("citations are never invented from rawResponse shapes without a citations array", () => {
  assert.deepEqual(providerSources(null), []);
  assert.deepEqual(providerSources({ text: "https://made-up.example" }), []);
  assert.deepEqual(providerSources({ citations: "https://x.example" }), []);
});

check("failed / unknown provider run: not measured, error shown, no sources, no sentiment", () => {
  const e = buildRunEvidence(row({ status: "not_measured", callState: "failed", errorCode: "timeout", errorMessage: "no response", answerText: null, mentioned: null, rawResponse: null }), "q", opts);
  assert.equal(e.status, "not_measured");
  assert.deepEqual(e.error, { code: "timeout", message: "no response" });
  assert.equal(e.mentioned, null);
  assert.deepEqual(e.sources, []);
  assert.equal(e.sourcesNote, null, "no 'no source' claim for an answer that was never measured");
  assert.equal(e.sentiment, null);
});

check("sentiment only from explicit language in a sentence naming the business", () => {
  assert.equal(detectExplicitSentiment("Example Roofing is highly rated.", ["Example Roofing"])?.label, "positive");
  assert.equal(detectExplicitSentiment("Some customers report complaints about Example Roofing.", ["Example Roofing"])?.label, "negative");
  assert.equal(detectExplicitSentiment("Example Roofing serves Toledo. Rival Roofing is highly rated.", ["Example Roofing"]), null, "praise of another business isn't attributed");
  assert.equal(detectExplicitSentiment("Example Roofing is a roofing company.", ["Example Roofing"]), null, "neutral → not stated");
});

check("positions only from numbered lists; competitors resolved to names; API label present", () => {
  const ranked = buildRunEvidence(row({ positionStatus: "ranked", position: 2 }), "q", opts);
  assert.equal(ranked.position, 2);
  assert.equal(buildRunEvidence(row(), "q", opts).position, null);
  assert.deepEqual(ranked.competitorsMentioned, ["Rival Roofing"]);
  assert.match(ranked.accessLabel, /not identical to the consumer ChatGPT, Claude, Gemini or Perplexity apps/);
  assert.match(ranked.accessLabel, /gpt-4\.1-mini, web search on/);
});

console.log(`[proof-evidence] passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
