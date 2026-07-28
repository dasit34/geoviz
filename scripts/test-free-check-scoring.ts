/* eslint-disable no-console */
/**
 * scripts/test-free-check-scoring.ts
 *
 * Deterministic unit test for the /check "Free AI Visibility Check"
 * scoring logic (src/lib/free-check/deriveChecks.ts). No network calls
 * — feeds synthetic preflight-analyzer fixtures straight in, mirroring
 * the shapes src/lib/intelligence/preflight actually produces.
 *
 * Guards:
 *   1. A strong site (full schema, consistent entity, deep content)
 *      scores high and every check reads "strong".
 *   2. A weak site (no schema, no entity match, thin content) scores
 *      low and surfaces problems + fixes.
 *   3. overallScore always lands in [0, 100].
 *   4. strengths/problems/fixes are capped at 3 each.
 */

import assert from "node:assert/strict";
import { deriveChecks } from "../src/lib/free-check/deriveChecks";
import type { DeriveChecksInput } from "../src/lib/free-check/deriveChecks";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void): void {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed += 1;
  } catch (err) {
    const line = `  ✗ ${label} — ${(err as Error).message}`;
    console.log(line);
    failures.push(line);
    failed += 1;
  }
}

console.log("[free-check-scoring] running...");

const BASE_INPUT: DeriveChecksInput["input"] = {
  websiteUrl: "https://acme-roofing.com",
  businessName: "Acme Roofing",
  city: "Phoenix",
  state: "Arizona",
  category: "Roofing",
};

const STRONG_FIXTURE: DeriveChecksInput = {
  input: BASE_INPUT,
  plainText:
    "acme roofing is a roofing company serving phoenix arizona with over 20 years of experience installing and repairing roofs for local homeowners and businesses across the phoenix arizona metro area",
  readability: {
    textLength: 1200,
    parsedByReadability: true,
    fallbackUsed: false,
    articleTitle: "Acme Roofing — Phoenix, Arizona",
    wordCount: 400,
    preview: "Acme Roofing is a roofing company serving Phoenix, Arizona…",
  },
  schema: {
    score: 100,
    presentFields: ["name", "address", "telephone", "url", "geo", "openingHours"],
    missingFields: [],
    malformedFields: [],
    detectedTypes: ["RoofingContractor"],
    rawJsonLdCount: 1,
    notes: [],
  },
  crawlability: {
    score: 100,
    findings: [],
    warnings: [],
    passedChecks: ["homepage_not_noindex", "canonical_present", "robots_txt_exists", "sitemap_xml_present"],
    failedChecks: [],
  },
  entityConsistency: {
    score: 100,
    extractedEntities: {
      name: { schema: "Acme Roofing", homepage: "Acme Roofing", footer: "Acme Roofing" },
      phone: { schema: "6025550100", homepage: "6025550100", footer: "6025550100" },
      address: { schema: "1500 E Camelback Rd, Phoenix, AZ", homepage: "1500 E Camelback Rd", footer: "1500 E Camelback Rd" },
    },
    inconsistencies: [],
    confidence: 1,
  },
};

const WEAK_FIXTURE: DeriveChecksInput = {
  input: BASE_INPUT,
  plainText: "welcome to our site click here to learn more",
  readability: {
    textLength: 60,
    parsedByReadability: false,
    fallbackUsed: true,
    articleTitle: null,
    wordCount: 10,
    preview: "welcome to our site",
  },
  schema: {
    score: 0,
    presentFields: [],
    missingFields: ["name", "address", "telephone", "url", "geo", "openingHours"],
    malformedFields: [],
    detectedTypes: [],
    rawJsonLdCount: 0,
    notes: ["no JSON-LD blocks found"],
  },
  crawlability: {
    score: 0,
    findings: ["robots.txt fetch failed"],
    warnings: [],
    passedChecks: [],
    failedChecks: ["robots_txt_exists", "sitemap_xml_present"],
  },
  entityConsistency: {
    score: 0,
    extractedEntities: {
      name: { schema: null, homepage: null, footer: null },
      phone: { schema: null, homepage: null, footer: null },
      address: { schema: null, homepage: null, footer: null },
    },
    inconsistencies: ["no schema reference for name/phone/address"],
    confidence: 0,
  },
};

check("strong fixture scores high and every check reads strong", () => {
  const result = deriveChecks(STRONG_FIXTURE);
  assert.ok(result.overallScore >= 80, `expected >=80, got ${result.overallScore}`);
  for (const c of result.checks) {
    assert.equal(c.status, "strong", `${c.id} expected strong, got ${c.status}`);
  }
  assert.equal(result.strengths.length, 3);
  assert.equal(result.problems.length, 0);
  assert.equal(result.fixes.length, 0);
});

check("weak fixture scores low and surfaces problems + fixes", () => {
  const result = deriveChecks(WEAK_FIXTURE);
  assert.ok(result.overallScore <= 20, `expected <=20, got ${result.overallScore}`);
  assert.ok(result.problems.length > 0, "expected at least one problem");
  assert.ok(result.fixes.length > 0, "expected at least one fix");
  assert.ok(result.problems.length <= 3, "problems capped at 3");
  assert.ok(result.fixes.length <= 3, "fixes capped at 3");
});

check("overallScore always in [0, 100]", () => {
  for (const fixture of [STRONG_FIXTURE, WEAK_FIXTURE]) {
    const result = deriveChecks(fixture);
    assert.ok(result.overallScore >= 0 && result.overallScore <= 100);
  }
});

check("null analyzer results degrade to missing, never throw", () => {
  const nulled: DeriveChecksInput = {
    input: BASE_INPUT,
    plainText: "",
    readability: null,
    schema: null,
    crawlability: null,
    entityConsistency: null,
  };
  const result = deriveChecks(nulled);
  assert.equal(result.overallScore, 0);
  assert.ok(result.checks.every((c) => c.status === "missing"));
});

if (failed > 0) {
  console.log(`[free-check-scoring] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[free-check-scoring] passed=${passed} failed=0`);
