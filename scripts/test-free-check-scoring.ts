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

import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { deriveChecks } from "../src/lib/free-check/deriveChecks";
import type { DeriveChecksInput } from "../src/lib/free-check/deriveChecks";
import { classifyBusinessType } from "../src/lib/free-check/classifyBusinessType";
import * as F from "./lib/free-check-fixtures";
import BASELINE from "./lib/free-check-v1-0-baseline.json";

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

// ── Scoring v1.1: local vs. online ─────────────────────────────────────

const ADDR_ONLY = F.fixture(F.NO_SIGNALS, {
  plainText: `${F.NO_SIGNALS.plainText} pricing sign up log in free trial`,
  entityConsistency: {
    ...F.NO_SIGNALS.entityConsistency!,
    extractedEntities: { ...F.NO_SIGNALS.entityConsistency!.extractedEntities, address: { schema: null, homepage: "22 Elm St, Austin, TX", footer: null } },
  },
});

const v10 = (r: ReturnType<typeof deriveChecks>) => ({ ok: r.ok, overallScore: r.overallScore, checks: r.checks, strengths: r.strengths, problems: r.problems, fixes: r.fixes });

for (const [name, fx] of [
  ["ROOFER_NO_ADDRESS_OR_HOURS", F.ROOFER_NO_ADDRESS_OR_HOURS],
  ["NO_SIGNALS", F.NO_SIGNALS],
  ["ROOFER_WITH_ONLINE_CUES", F.ROOFER_WITH_ONLINE_CUES],
  ["ADDR_ONLY", ADDR_ONLY],
] as const) {
  check(`local business unchanged from v1.0: ${name}`, () => {
    const r = deriveChecks(fx);
    assert.equal(r.businessType, "local");
    assert.equal(r.scoringVersion, "free-check-v1.1");
    assert.deepEqual(v10(r), (BASELINE as Record<string, unknown>)[name]);
  });
}

check("strong and weak local fixtures stay local", () => {
  assert.equal(deriveChecks(STRONG_FIXTURE).businessType, "local");
  assert.equal(deriveChecks(WEAK_FIXTURE).businessType, "local");
});

check("local roofer missing address and hours still loses location + schema points", () => {
  const r = deriveChecks(F.ROOFER_NO_ADDRESS_OR_HOURS);
  const loc = r.checks.find((c) => c.id === "location_clarity")!;
  const sd = r.checks.find((c) => c.id === "structured_data")!;
  assert.equal(loc.status, "needs_improvement");
  assert.equal(sd.status, "needs_improvement");
  assert.ok(r.fixes.includes("Strengthen your location signals."));
});

check("online SaaS: location not applicable, schema scored without address/geo/hours", () => {
  const r = deriveChecks(F.SAAS);
  assert.equal(r.businessType, "online");
  assert.deepEqual(r.businessTypeReasons[0], "SoftwareApplication structured data");
  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(byId.location_clarity!.status, "not_applicable");
  assert.match(byId.location_clarity!.explanation, /online business/);
  assert.equal(byId.structured_data!.status, "strong");
  assert.ok(!r.problems.includes("Location clarity"));
  assert.ok(!r.fixes.includes("Strengthen your location signals."));
  assert.ok(!r.strengths.includes("Location clarity"));
});

check("online overall score = weighted average over the five applicable checks", () => {
  const r = deriveChecks(F.SAAS);
  // Sub-scores: identity 100 (name found + >50 words), service 40 (no category; 420 words → depth 100 × 0.4),
  // contact 100, structured 100 (name/url/telephone), readiness round(0.3·100 + 0.25·100 + 0.2·100 + 0.25·100) = 100.
  const expected = Math.round((100 * 20 + 40 * 15 + 100 * 15 + 100 * 20 + 100 * 15) / 85);
  assert.equal(r.overallScore, expected);
  assert.ok(r.overallScore > (BASELINE as { SAAS_AS_LOCAL: { overallScore: number } }).SAAS_AS_LOCAL.overallScore, "online scoring no longer penalizes the SaaS site");
});

check("online by category alone (no local signals)", () => {
  const fx = F.fixture(F.NO_SIGNALS, { input: { category: "SaaS" } });
  const c = classifyBusinessType({ category: fx.input.category, plainText: fx.plainText, schema: fx.schema, entityConsistency: fx.entityConsistency });
  assert.deepEqual(c, { type: "online", reasons: ["an online business category"] });
});

check("online text cues: 3 cues → online, 2 cues → stays local", () => {
  const base = { category: "", schema: F.NO_SIGNALS.schema, entityConsistency: F.NO_SIGNALS.entityConsistency };
  assert.equal(classifyBusinessType({ ...base, plainText: "see pricing and sign up or log in" }).type, "online");
  assert.equal(classifyBusinessType({ ...base, plainText: "see pricing and sign up today" }).type, "local");
});

check("cues still match when the page text runs elements together, but not inside other words", () => {
  const base = { category: "", schema: F.NO_SIGNALS.schema, entityConsistency: F.NO_SIGNALS.entityConsistency };
  // Real shape of the free check's plain text: "06pricingstart", "$99per month".
  assert.equal(classifyBusinessType({ ...base, plainText: "06pricingstart with the audit $99per month sign in to monitoring" }).type, "online");
  // "design in", "catalog in", "rapid" must not count as cues.
  assert.equal(classifyBusinessType({ ...base, plainText: "custom design in our catalog in a rapid turnaround" }).type, "local");
});

check("any local signal beats online signals (type, field, or street address)", () => {
  const online = { category: "software", plainText: "free trial pricing sign up log in", entityConsistency: null };
  const schema = F.SAAS.schema!;
  assert.equal(classifyBusinessType({ ...online, schema: { ...schema, detectedTypes: ["SoftwareApplication", "LocalBusiness"] } }).type, "local");
  assert.equal(classifyBusinessType({ ...online, schema: { ...schema, presentFields: [...schema.presentFields, "openingHours"] } }).type, "local");
  assert.equal(classifyBusinessType({ ...online, schema, entityConsistency: ADDR_ONLY.entityConsistency }).type, "local");
  assert.equal(classifyBusinessType({ ...online, schema }).type, "online");
});

if (failed > 0) {
  console.log(`[free-check-scoring] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[free-check-scoring] passed=${passed} failed=0`);
