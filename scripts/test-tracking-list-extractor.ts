/* eslint-disable no-console */
/**
 * scripts/test-tracking-list-extractor.ts — position only from a clear
 * ordered recommendation list; names from lists, bullets, and bold text.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import { extractRecommendationList, looksLikeBusinessName, nameFromItem } from "../src/lib/monitoring/tracking/list-extractor";

const h = harness("tracking-list-extractor");

(async () => {
  console.log("[tracking-list-extractor] running...");

  await h.check("numbered list 1..n → ordered list with names from bold text", () => {
    const r = extractRecommendationList("Top picks:\n1. **Acme Heating** – great reviews\n2. **Columbus Heating & Cooling**: family owned\n3. **Best Air** (since 1990)\n");
    assert.deepEqual(r.orderedList, ["Acme Heating", "Columbus Heating & Cooling", "Best Air"]);
  });

  await h.check("numbered markdown headings and link names count as an ordered list", () => {
    const r = extractRecommendationList("### 1. [Acme Heating](https://acme.com)\nText\n### 2. [Best Air](https://best.com)\nText");
    assert.deepEqual(r.orderedList, ["Acme Heating", "Best Air"]);
  });

  await h.check("bullet lists name businesses but give NO ordered list (no rank inferred)", () => {
    const r = extractRecommendationList("Options:\n- **Acme Heating** - good\n- **Best Air** - also good\n");
    assert.equal(r.orderedList, null);
    assert.deepEqual(r.namedBusinesses, ["Acme Heating", "Best Air"]);
  });

  await h.check("businesses mentioned in prose order are never ranked", () => {
    const r = extractRecommendationList("Many people like Acme Heating, and Columbus Heating & Cooling is also popular.");
    assert.equal(r.orderedList, null);
  });

  await h.check("a single numbered item or broken numbering is not a clear list", () => {
    assert.equal(extractRecommendationList("1. **Acme Heating**\nThat's the one.").orderedList, null);
    assert.equal(extractRecommendationList("2. **Acme**\n3. **Best Air**\n5. **Other**").orderedList, null);
  });

  await h.check("numbered steps that aren't names (long sentences) don't form a business list", () => {
    const r = extractRecommendationList("1. Check that the company is licensed and insured in Ohio before you call\n2. Read several recent reviews on independent sites to compare\n");
    assert.equal(r.orderedList, null);
  });

  await h.check("the longest sequential run wins when an answer restarts numbering", () => {
    const r = extractRecommendationList("Tips:\n1. Ask questions\n\nCompanies:\n1. **Acme Heating**\n2. **Best Air**\n3. **Cool Co**");
    assert.deepEqual(r.orderedList, ["Acme Heating", "Best Air", "Cool Co"]);
  });

  await h.check("bold phrases in prose only count when they read like a business name", () => {
    assert.equal(looksLikeBusinessName("Acme Heating"), true);
    assert.equal(looksLikeBusinessName("best-rated roofing companies in Toledo"), false);
    assert.equal(looksLikeBusinessName("Best overall"), false);
    const r = extractRecommendationList("Some of the **best-rated HVAC companies in Columbus** include **Acme Heating** and **Best Air**.");
    assert.deepEqual(r.namedBusinesses, ["Acme Heating", "Best Air"]);
  });

  await h.check("item name parsing: bold > link > text before separator", () => {
    assert.equal(nameFromItem("**Acme** – the best"), "Acme");
    assert.equal(nameFromItem("[Best Air](https://x.com) - reviews"), "Best Air");
    assert.equal(nameFromItem("Cool Co: family owned"), "Cool Co");
  });

  h.done();
})();
