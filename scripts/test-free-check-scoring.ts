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
import { checkIdForFix, deriveChecks } from "../src/lib/free-check/deriveChecks";
import { analyzeOnlineSchema } from "../src/lib/free-check/onlineSchema";
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
  assert.ok(result.overallScore! >= 80, `expected >=80, got ${result.overallScore}`);
  for (const c of result.checks) {
    assert.equal(c.status, "strong", `${c.id} expected strong, got ${c.status}`);
  }
  assert.equal(result.strengths.length, 3);
  assert.equal(result.problems.length, 0);
  assert.equal(result.fixes.length, 0);
});

check("weak fixture scores low and surfaces problems + fixes", () => {
  const result = deriveChecks(WEAK_FIXTURE);
  assert.ok(result.overallScore! <= 20, `expected <=20, got ${result.overallScore}`);
  assert.ok(result.problems.length > 0, "expected at least one problem");
  assert.ok(result.fixes.length > 0, "expected at least one fix");
  assert.ok(result.problems.length <= 3, "problems capped at 3");
  assert.ok(result.fixes.length <= 3, "fixes capped at 3");
});

check("overallScore always in [0, 100]", () => {
  for (const fixture of [STRONG_FIXTURE, WEAK_FIXTURE]) {
    const result = deriveChecks(fixture);
    assert.ok(result.overallScore! >= 0 && result.overallScore! <= 100);
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

// v1.0 fix text → check id (wording changed in v1.2; the checks they point at must not).
const V10_FIX_TO_CHECK: Record<string, string> = {
  "Strengthen your business identity clarity.": "business_identity",
  "Strengthen your location signals.": "location_clarity",
  "Improve service and offering clarity.": "service_clarity",
  "Improve business identity consistency.": "contact_consistency",
  "Increase AI-readable website signals.": "structured_data",
  "Strengthen your overall AI recommendation readiness.": "ai_recommendation_readiness",
};
const v10 = (r: ReturnType<typeof deriveChecks>) => ({ ok: r.ok, overallScore: r.overallScore, checks: r.checks, strengths: r.strengths, problems: r.problems, fixes: r.fixes.map(checkIdForFix) });
const baselineOf = (name: string) => {
  const b = (BASELINE as unknown as Record<string, ReturnType<typeof deriveChecks>>)[name]!;
  return { ...b, fixes: b.fixes.map((f) => V10_FIX_TO_CHECK[f]) };
};

// NO_SIGNALS (Organization/WebSite, no address, no city, no cues) was scored
// as local by v1.0–v1.2's silent default; v1.3 re-pins it as uncertain below.
for (const [name, fx] of [
  ["ROOFER_NO_ADDRESS_OR_HOURS", F.ROOFER_NO_ADDRESS_OR_HOURS],
  ["ROOFER_WITH_ONLINE_CUES", F.ROOFER_WITH_ONLINE_CUES],
  ["ADDR_ONLY", ADDR_ONLY],
] as const) {
  check(`local business unchanged from v1.0: ${name}`, () => {
    const r = deriveChecks(fx);
    assert.equal(r.businessType, "local");
    assert.equal(r.scoringVersion, "free-check-v1.3");
    assert.equal(r.scored, true);
    assert.equal(r.scopeNote, null);
    // Score, statuses, labels, explanations, strengths, problems: exactly v1.0. Fixes: same checks, same order.
    assert.deepEqual(v10(r), baselineOf(name));
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
  assert.ok(r.fixes.includes("State your city, state, and street address on your homepage."));
  assert.equal(sd.label, "Structured data / LocalBusiness schema");
  assert.ok(r.fixes.includes("Add LocalBusiness structured data with your address, phone, and opening hours."));
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
  assert.ok(!r.fixes.some((f) => checkIdForFix(f) === "location_clarity"));
  assert.equal(byId.structured_data!.label, "Structured data / Organization & product schema");
  assert.ok(!/LocalBusiness|opening hours|street address/i.test(JSON.stringify(r)), "no LocalBusiness wording for an online business");
  assert.ok(!r.strengths.includes("Location clarity"));
});

check("online overall score = weighted average over the five applicable checks", () => {
  const r = deriveChecks(F.SAAS);
  // Sub-scores: identity 100 (name found + >50 words), service 40 (no category; 420 words → depth 100 × 0.4),
  // contact 100, structured 83 (5 of 6 online-schema items), readiness round(0.3·100 + 0.25·83 + 0.2·100 + 0.25·100) = 96.
  const expected = Math.round((100 * 20 + 40 * 15 + 100 * 15 + 83 * 20 + 96 * 15) / 85);
  assert.equal(r.overallScore, expected);
  assert.ok(r.overallScore > (BASELINE as { SAAS_AS_LOCAL: { overallScore: number } }).SAAS_AS_LOCAL.overallScore, "online scoring no longer penalizes the SaaS site");
});

check("online structured data follows the Organization / WebSite / product checklist", () => {
  const status = (present: Parameters<typeof F.onlineSchema>[0]) => {
    const r = deriveChecks(F.fixture(F.SAAS, { onlineSchema: F.onlineSchema(present) }));
    return { check: r.checks.find((c) => c.id === "structured_data")!, fixes: r.fixes };
  };
  const full = status({ organization_name: true, organization_url: true, organization_logo_or_sameas: true, website: true, product_name: true, product_details: true });
  assert.equal(full.check.status, "strong");
  assert.ok(!full.fixes.some((f) => checkIdForFix(f) === "structured_data"));
  const half = status({ organization_name: true, organization_url: true, website: true });
  assert.equal(F.onlineSchema({ organization_name: true, organization_url: true, website: true }).score, 50);
  assert.equal(half.check.status, "needs_improvement");
  assert.ok(half.fixes.includes("Add Organization, WebSite, and SoftwareApplication (or Product) structured data."));
  const none = deriveChecks(F.fixture(F.SAAS, { onlineSchema: null })).checks.find((c) => c.id === "structured_data")!;
  assert.equal(none.status, "missing");
});

check("local structured data still uses the LocalBusiness validator score", () => {
  const r = deriveChecks(F.fixture(F.ROOFER_NO_ADDRESS_OR_HOURS, { onlineSchema: F.onlineSchema({ organization_name: true, organization_url: true, website: true, product_name: true, product_details: true, organization_logo_or_sameas: true }) }));
  const sd = r.checks.find((c) => c.id === "structured_data")!;
  assert.equal(r.businessType, "local");
  assert.equal(sd.status, "needs_improvement", "online schema never lifts a local business");
  assert.equal(sd.label, "Structured data / LocalBusiness schema");
});

check("no top improvement contradicts a Strong (or not-applicable) finding", () => {
  const fixtures = [STRONG_FIXTURE, WEAK_FIXTURE, F.ROOFER_NO_ADDRESS_OR_HOURS, F.NO_SIGNALS, F.ROOFER_WITH_ONLINE_CUES, ADDR_ONLY, F.SAAS,
    F.fixture(F.SAAS, { onlineSchema: null }), F.fixture(F.SAAS, { entityConsistency: { ...F.SAAS.entityConsistency!, score: 40 } }),
    // Structured data Strong but readiness weak (thin content, poor crawl): the readiness fix must not mention structured data.
    F.fixture(F.SAAS, { readability: { ...F.SAAS.readability!, wordCount: 30 }, crawlability: { ...F.SAAS.crawlability!, score: 25 }, entityConsistency: { ...F.SAAS.entityConsistency!, score: 0 } })];
  const KEYWORDS: Record<string, RegExp> = {
    business_identity: /identity/i,
    location_clarity: /location|city|street address/i,
    service_clarity: /services|product and what it does/i,
    contact_consistency: /consistent|contact/i,
    structured_data: /structured data/i,
    ai_recommendation_readiness: /AI recommendation/i,
  };
  for (const fx of fixtures) {
    const r = deriveChecks(fx);
    const done = r.checks.filter((c) => c.status === "strong" || c.status === "not_applicable").map((c) => c.id);
    for (const fix of r.fixes) {
      const id = checkIdForFix(fix);
      assert.ok(id, `fix maps to a check: ${fix}`);
      assert.ok(!done.includes(id!), `"${fix}" comes from ${id}, which is ${r.checks.find((c) => c.id === id)!.status}`);
      for (const strongId of done) {
        if (strongId === id) continue;
        assert.ok(!KEYWORDS[strongId]?.test(fix), `"${fix}" restates ${strongId}, which is ${r.checks.find((c) => c.id === strongId)!.status}`);
      }
    }
  }
});

check("readiness fix lists only its weak inputs", () => {
  const r = deriveChecks(F.fixture(F.SAAS, { readability: { ...F.SAAS.readability!, wordCount: 30 }, crawlability: { ...F.SAAS.crawlability!, score: 25 }, entityConsistency: { ...F.SAAS.entityConsistency!, score: 0 } }));
  assert.equal(r.checks.find((c) => c.id === "structured_data")!.status, "strong");
  const fix = r.fixes.find((f) => checkIdForFix(f) === "ai_recommendation_readiness");
  assert.equal(fix, "Improve these AI recommendation inputs together: crawl access, contact consistency, content depth.");
});

check("analyzeOnlineSchema: @graph, array @type, empty strings, malformed blocks", () => {
  const html = (...blocks: string[]) => `<html><head>${blocks.map((b) => `<script type="application/ld+json">${b}</script>`).join("")}</head><body></body></html>`;
  const graph = analyzeOnlineSchema(html(JSON.stringify({ "@context": "https://schema.org", "@graph": [
    { "@type": ["Organization", "Brand"], name: "Ledgerly", url: "https://ledgerly.app", sameAs: ["https://x.com/ledgerly"] },
    { "@type": "WebSite", url: "https://ledgerly.app" },
    { "@type": "SoftwareApplication", name: "Ledgerly", applicationCategory: "BusinessApplication" },
  ] })));
  assert.equal(graph.score, 100);
  assert.equal(graph.productType, "SoftwareApplication");
  const empty = analyzeOnlineSchema(html('{"@type":"Organization","name":"  ","url":""}', "{not json", JSON.stringify({ "@type": "WebSite", name: "" })));
  assert.equal(empty.score, 0);
  assert.equal(analyzeOnlineSchema("").score, 0);
});

check("online by category alone (no local signals)", () => {
  const fx = F.fixture(F.NO_SIGNALS, { input: { category: "SaaS" } });
  const c = classifyBusinessType({ category: fx.input.category, plainText: fx.plainText, schema: fx.schema, entityConsistency: fx.entityConsistency });
  assert.deepEqual(c, { type: "online", reasons: ['the business category "SaaS"'] });
});

check("online text cues: 3 cues → online, 2 cues → uncertain (no silent local default)", () => {
  const base = { category: "", schema: F.NO_SIGNALS.schema, entityConsistency: F.NO_SIGNALS.entityConsistency };
  assert.equal(classifyBusinessType({ ...base, plainText: "see pricing and sign up or log in" }).type, "online");
  assert.equal(classifyBusinessType({ ...base, plainText: "see pricing and sign up today" }).type, "uncertain");
});

check("cues still match when the page text runs elements together, but not inside other words", () => {
  const base = { category: "", schema: F.NO_SIGNALS.schema, entityConsistency: F.NO_SIGNALS.entityConsistency };
  // Real shape of the free check's plain text: "06pricingstart", "$99per month".
  assert.equal(classifyBusinessType({ ...base, plainText: "06pricingstart with the audit $99per month sign in to monitoring" }).type, "online");
  // "design in", "catalog in", "rapid" must not count as cues.
  assert.equal(classifyBusinessType({ ...base, plainText: "custom design in our catalog in a rapid turnaround" }).type, "uncertain");
});

check("v1.3 order: a LocalBusiness type wins; declared software beats schema address fields; page address beats text cues", () => {
  const online = { category: "", plainText: "free trial pricing sign up log in", entityConsistency: null };
  const schema = F.SAAS.schema!;
  assert.equal(classifyBusinessType({ ...online, schema: { ...schema, detectedTypes: ["SoftwareApplication", "LocalBusiness"] } }).type, "local");
  // A software company's Organization node with an HQ address / hours is not a storefront.
  assert.equal(classifyBusinessType({ ...online, schema: { ...schema, presentFields: [...schema.presentFields, "openingHours"] } }).type, "online");
  assert.equal(classifyBusinessType({ ...online, schema, entityConsistency: ADDR_ONLY.entityConsistency }).type, "online");
  // Without a declared type, a street address on the page beats online text cues.
  const plain = { ...schema, detectedTypes: ["Organization"] };
  assert.equal(classifyBusinessType({ ...online, schema: plain, entityConsistency: ADDR_ONLY.entityConsistency }).type, "local");
  assert.equal(classifyBusinessType({ ...online, schema: plain }).type, "online");
});

check("NO_SIGNALS is re-pinned as uncertain and NOT scored (v1.0–v1.2 scored it as local by default)", () => {
  const r = deriveChecks(F.NO_SIGNALS);
  const v10 = (BASELINE as unknown as Record<string, ReturnType<typeof deriveChecks>>).NO_SIGNALS!;
  assert.equal(v10.checks.find((c) => c.id === "location_clarity")!.status, "missing", "v1.0 penalized missing location");
  assert.equal(r.businessType, "uncertain");
  assert.equal(r.scored, false);
  assert.equal(r.overallScore, null);
  assert.equal(r.unscoredReason, "type_undetermined");
  assert.match(r.scopeNote ?? "", /^Not scored — website type could not be determined reliably\./);
  assert.match(r.scopeNote ?? "", /city and state or its business category/);
  assert.deepEqual(r.fixes, [], "no normal fixes for an unscored result");
  const byId = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  for (const id of ["location_clarity", "service_clarity", "ai_recommendation_readiness"]) assert.equal(byId[id]!.status, "not_applicable");
  assert.equal(byId.structured_data!.label, "Structured data / business schema");
});

check("only local and online results are ever scored", () => {
  for (const fx of [STRONG_FIXTURE, WEAK_FIXTURE, F.ROOFER_NO_ADDRESS_OR_HOURS, F.NO_SIGNALS, F.ROOFER_WITH_ONLINE_CUES, ADDR_ONLY, F.SAAS]) {
    const r = deriveChecks(fx);
    assert.equal(r.scored, r.businessType === "local" || r.businessType === "online", r.businessType);
    assert.equal(r.overallScore === null, !r.scored);
    if (!r.scored) assert.deepEqual(r.fixes, []);
  }
});

if (failed > 0) {
  console.log(`[free-check-scoring] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[free-check-scoring] passed=${passed} failed=0`);
