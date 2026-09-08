/* eslint-disable no-console */
/**
 * scripts/test-fabrication-guard.ts
 *
 * Guards stripFabricatedGeography() — the render-layer safety net that
 * replaces model-fabricated city names in customer prose with "your
 * service area". Root-caused on the Twinsburg Dental report, where the
 * narration named a nearby city (Akron) the validators never
 * confirmed; an unverified place name reads as a hallucination and
 * breaks trust.
 *
 * Pins the contract:
 *   - validated locations (from passed validators) survive;
 *   - the business name's own city token survives;
 *   - unverified Title-Case city phrases are replaced;
 *   - brand/product/day/month tokens are never mistaken for places;
 *   - with NO validated locations, prose is returned untouched
 *     (legacy audits keep their behavior — fail-soft, no over-strip).
 */

import assert from "node:assert/strict";

import {
  stripFabricatedGeography,
  swapTechnicalTerms,
} from "../src/lib/parse-report";

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

// One passed validator that identified "Twinsburg, Ohio".
const VALIDATIONS = {
  outputs: [
    { status: "passed", location_identified: "Twinsburg, Ohio" },
    { status: "failed", location_identified: "Cleveland" }, // failed → not allowed
  ],
};

console.log("[fabrication-guard] running...");

check("validated city survives, fabricated city is stripped", () => {
  const prose =
    "We reviewed your presence across Twinsburg and the surrounding area, " +
    "but found weak signals in Akron where customers also search.";
  const out = stripFabricatedGeography(prose, VALIDATIONS, "Twinsburg Dental");
  assert.ok(out.includes("Twinsburg"), "validated Twinsburg should survive");
  assert.ok(!out.includes("Akron"), "fabricated Akron should be stripped");
  assert.ok(
    out.includes("your service area"),
    "stripped place should become 'your service area'",
  );
});

// ── Precision gate: ordinary capitalized words are NOT places ────────
// Regression for the launch defect where the guard mangled evidence
// labels + sentence-leading words into "your service area" the moment
// validators agreed on any location. A Title-Case word only strips when
// it sits in a locative context — never otherwise.
check("ordinary Title-Case words survive (no locative context)", () => {
  const prose =
    "What We Found — Your homepage ships no schema. Why It Matters — When a " +
    "customer asks an AI assistant who to hire, the model needs structure. " +
    "Deploy a LocalBusiness block. Standardize your Name, Address, and Phone. " +
    "Add a FAQ. Strong readability without identity reads as ambiguous.";
  const out = stripFabricatedGeography(prose, VALIDATIONS, "Twinsburg Dental");
  for (const word of [
    "What We Found",
    "Why It Matters",
    "When a customer",
    "Deploy",
    "Standardize",
    "Name",
    "Address",
    "Phone",
    "Add",
    "Strong",
  ]) {
    assert.ok(out.includes(word), `"${word}" must NOT be stripped`);
  }
  assert.ok(
    !out.includes("your service area"),
    "no ordinary word should have been replaced",
  );
});

check("'to'/'from' are NOT locative cues (Moore issue-title defect)", () => {
  // Production defect: "AI Has No Way to Verify Business Identity" became
  // "...to your service area Business Identity" because "to" was treated
  // as a locative preposition. Capitalized verbs after to/from/for must
  // survive.
  const prose =
    "AI Has No Way to Verify Business Identity. The Homepage Has Almost " +
    "Nothing for AI to Read. Customers want to Schedule a service from " +
    "Reliable contractors.";
  const out = stripFabricatedGeography(prose, VALIDATIONS, "Twinsburg Dental");
  for (const word of ["Verify", "Read", "Schedule", "Reliable"]) {
    assert.ok(out.includes(word), `"${word}" must NOT be stripped after to/for/from`);
  }
  assert.ok(!out.includes("your service area"), "nothing should be replaced");
});

check("fabricated city in a locative slot IS still stripped", () => {
  // preposition-before, locative-noun-after, and City,State forms.
  const out = stripFabricatedGeography(
    "Customers near Cleveland and in the Springfield area will not find you. " +
      "Akron, Ohio also searches for roofers.",
    VALIDATIONS,
    "Twinsburg Dental",
  );
  for (const city of ["Cleveland", "Springfield", "Akron"]) {
    assert.ok(!out.includes(city), `${city} should be stripped in a locative slot`);
  }
  assert.ok(!/area\s+area/i.test(out), "must not leave a doubled 'area area' seam");
});

check("a city in the business name survives even if not validated", () => {
  // "Independence" is in the business name → survives even in a
  // locative slot. "Maple Heights" is neither validated nor in the
  // name AND sits in a locative slot ("in Maple Heights") → stripped.
  const prose =
    "Customers in Independence find you, but signals in Maple Heights are weak.";
  const out = stripFabricatedGeography(
    prose,
    VALIDATIONS,
    "Independence Realty Group",
  );
  assert.ok(out.includes("Independence"), "business-name city should survive");
  assert.ok(!out.includes("Maple Heights"), "unverified locative city should be stripped");
});

check("brand / model / day tokens are not treated as places", () => {
  const prose =
    "Google and ChatGPT both read your Monday hours, but Perplexity did not.";
  const out = stripFabricatedGeography(prose, VALIDATIONS, "Twinsburg Dental");
  for (const safe of ["Google", "ChatGPT", "Monday", "Perplexity"]) {
    assert.ok(out.includes(safe), `${safe} must not be stripped`);
  }
});

check("the validated state token survives standalone", () => {
  const prose = "Your business serves the broader Ohio market well.";
  const out = stripFabricatedGeography(prose, VALIDATIONS, "Twinsburg Dental");
  assert.ok(out.includes("Ohio"), "state token Ohio should survive");
});

check("no validated locations → prose returned untouched", () => {
  const prose = "We see strong signals in Akron and Cleveland and Dayton.";
  const out = stripFabricatedGeography(
    prose,
    { outputs: [] }, // no passed validators → empty allow-set
    null,
  );
  assert.equal(out, prose, "legacy/no-validation path must not strip");
});

check("null validator layer → prose returned untouched", () => {
  const prose = "We see strong signals in Akron.";
  const out = stripFabricatedGeography(prose, null, null);
  assert.equal(out, prose, "null validations must not strip");
});

check("legacy audit + business-name tokens → prose still untouched", () => {
  // Regression: a non-empty business name ("Ohio Roofing & Siding")
  // used to make the allow-set non-empty and re-enable stripping even
  // with NO validator layer, mangling real model-authored cities on
  // legacy sample reports.
  const prose =
    "Family-owned contractor serving Toledo, Ohio since the 1950s, " +
    "covering Perrysburg and Oregon, OH.";
  const out = stripFabricatedGeography(prose, null, "Ohio Roofing & Siding");
  assert.equal(out, prose, "no validated locations → never strip");
  const out2 = stripFabricatedGeography(
    prose,
    { outputs: [{ status: "failed", location_identified: "Toledo" }] },
    "Ohio Roofing & Siding",
  );
  assert.equal(out2, prose, "only failed validators → never strip");
});

check("stripFabricatedGeography never rewrites inside a code fence", () => {
  const prose =
    "Customers near Cleveland cannot find you.\n\n" +
    "```json\n" +
    '{ "areaServed": ["Toledo, OH", "Perrysburg, OH", "Oregon, OH"] }\n' +
    "```\n\n" +
    "Signals in Springfield are weak.";
  const out = stripFabricatedGeography(prose, VALIDATIONS, "Twinsburg Dental");
  assert.ok(
    out.includes('["Toledo, OH", "Perrysburg, OH", "Oregon, OH"]'),
    "the JSON areaServed array must survive verbatim",
  );
  // prose OUTSIDE the fence still gets the guard
  assert.ok(!out.includes("Cleveland"), "prose city outside the fence is stripped");
  assert.ok(!out.includes("Springfield"), "prose city outside the fence is stripped");
});

// ── swapTechnicalTerms: jargon plain-Englishing skips code ───────────
check("swapTechnicalTerms leaves fenced code verbatim", () => {
  const md =
    "Your homepage ships no schema markup.\n\n" +
    "```json\n" +
    '{ "@context": "https://schema.org", "@type": "RoofingContractor" }\n' +
    "```\n";
  const out = swapTechnicalTerms(md);
  assert.ok(
    out.includes('"@context": "https://schema.org"'),
    "schema.org URL inside the fence must not become 'structured business details'",
  );
  assert.ok(
    /no .* structured business details|business details AI systems can verify/i.test(
      out,
    ),
    "prose outside the fence is still plain-Englished",
  );
});

check("swapTechnicalTerms leaves inline code verbatim", () => {
  const out = swapTechnicalTerms(
    "Add the `robots.txt` file — robots.txt controls AI reader access.",
  );
  assert.ok(out.includes("`robots.txt`"), "inline code span survives");
  assert.ok(
    out.includes("AI access rules") && !out.split("`robots.txt`")[1]?.includes("robots.txt"),
    "prose occurrence outside the backticks is still swapped",
  );
});

if (failed > 0) {
  console.log(`[fabrication-guard] FAILED — passed=${passed} failed=${failed}`);
  for (const f of failures) console.log(f);
  process.exit(1);
}
console.log(`[fabrication-guard] passed=${passed} failed=0`);
