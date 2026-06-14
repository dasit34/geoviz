/* eslint-disable no-console */
/**
 * scripts/test-customer-questions.ts
 *
 * Guards the deterministic "Customer Questions Tested" generator: real
 * buyer-intent questions built from business name / industry / detected city +
 * services, NEVER inventing a city the audit didn't find, never leaking a
 * template placeholder, and never using the word "prompts".
 */
import assert from "node:assert/strict";

import {
  buildCustomerQuestions,
  type CustomerQuestionInput,
} from "../src/lib/report/customer-questions";

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

console.log("[customer-questions] running...");

const ok = (qs: string[]) => qs.join(" | ");

check("local + detected city → city-specific questions, 5 unique", () => {
  const qs = buildCustomerQuestions({
    businessName: "Rock Roofing",
    industrySlug: "roofing",
    city: "Toledo, OH",
    services: ["Roof repair"],
    businessType: "Roofing contractor",
    isLocal: true,
  });
  assert.equal(qs.length, 5, ok(qs));
  assert.equal(new Set(qs).size, 5, "questions must be unique");
  assert.ok(qs.some((q) => /best roofers near Toledo, OH\?/.test(q)), ok(qs));
  assert.ok(qs.some((q) => /Is Rock Roofing a trustworthy roofer\?/.test(q)), ok(qs));
  assert.ok(qs.some((q) => /roof leak/.test(q)), "urgent-problem question present");
});

check("local vertical but NO detected city → never invents a city", () => {
  const qs = buildCustomerQuestions({
    businessName: "Some HVAC Co",
    industrySlug: "hvac",
    city: null,
    services: [],
    businessType: null,
    isLocal: true,
  });
  assert.equal(qs.length, 5, ok(qs));
  assert.ok(/your area|nearby/i.test(ok(qs)), "uses area-neutral phrasing");
  // no real city names fabricated, no leftover "near null"
  assert.doesNotMatch(ok(qs), /near (null|undefined)|in null/i, ok(qs));
});

check("non-local business → category-neutral, no city, uses business type noun", () => {
  const qs = buildCustomerQuestions({
    businessName: "GeoViz",
    industrySlug: "nonprofit",
    city: null,
    services: [],
    businessType: "AI visibility intelligence service",
    isLocal: false,
  });
  assert.equal(qs.length, 5, ok(qs));
  assert.ok(/trustworthy and legitimate/i.test(ok(qs)), ok(qs));
  assert.doesNotMatch(ok(qs), /near |in your area|nearby/i, "non-local must not use local phrasing");
  assert.ok(/AI visibility intelligence service/i.test(ok(qs)), "derives noun from business type");
});

check("never leaks a template placeholder, 'undefined', or the word 'prompts'", () => {
  const cases: CustomerQuestionInput[] = [
    { businessName: "X", industrySlug: "dental", city: "Austin", services: ["cleaning"], businessType: "Dentist", isLocal: true },
    { businessName: "Y", industrySlug: "ecommerce", city: null, services: [], businessType: null, isLocal: false },
    { businessName: "Z", industrySlug: null, city: null, services: [], businessType: null, isLocal: false },
  ];
  for (const args of cases) {
    const blob = ok(buildCustomerQuestions(args));
    assert.doesNotMatch(blob, /[{}]|undefined|null|prompt/i, `${args.industrySlug}: ${blob}`);
    assert.ok(blob.length > 0);
  }
});

check("deterministic — same input yields identical output", () => {
  const args: CustomerQuestionInput = {
    businessName: "Acme Plumbing",
    industrySlug: "plumbing",
    city: "Dayton, OH",
    services: ["drain cleaning"],
    businessType: "Plumber",
    isLocal: true,
  };
  assert.equal(
    JSON.stringify(buildCustomerQuestions(args)),
    JSON.stringify(buildCustomerQuestions(args)),
  );
});

check("vowel-sound business noun → 'an AI …', never 'a AI …'", () => {
  const qs = buildCustomerQuestions({
    businessName: "GeoViz",
    industrySlug: null,
    city: null,
    services: [],
    businessType: "AI visibility intelligence service",
    isLocal: false,
  });
  const blob = ok(qs);
  assert.doesNotMatch(blob, /\ba AI\b/, blob); // the reported grammar bug
  assert.ok(/\ban AI visibility intelligence service\b/.test(blob), blob);
});

check("sentence-like detected service never leaks into a question", () => {
  const qs = buildCustomerQuestions({
    businessName: "GeoViz",
    industrySlug: null,
    city: null,
    // The exact garbage detection from the reviewed PDF.
    services: ["testing business visibility across major AI systems"],
    businessType: "AI visibility intelligence service",
    isLocal: false,
  });
  const blob = ok(qs);
  assert.doesNotMatch(blob, /testing business visibility across major AI systems/i, blob);
  // Falls back to the business-type noun → reads naturally.
  assert.ok(/recommend a reliable AI visibility intelligence service\?/i.test(blob), blob);
});

check("local + vowel service → 'recommend an …', grammatical", () => {
  const qs = buildCustomerQuestions({
    businessName: "Acme",
    industrySlug: null,
    city: "Toledo, OH",
    services: ["awning install"],
    businessType: "Awning company",
    isLocal: true,
  });
  const blob = ok(qs);
  assert.doesNotMatch(blob, /recommend a awning/i, blob);
  assert.ok(/recommend an awning install company/i.test(blob), blob);
});

console.log(`[customer-questions] passed=${passed} failed=${failed}`);
if (failed > 0) {
  for (const f of failures) console.log(f);
  process.exit(1);
}
