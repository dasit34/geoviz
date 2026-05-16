/* eslint-disable no-console */
/**
 * scripts/test-preflight-intelligence.ts
 *
 * V2 Preflight intelligence smoke test. Follows the same plain-tsx +
 * node:assert style as the other test scripts in this directory.
 * No live network — every test uses inline HTML fixtures and the
 * crawlability test that needs robots.txt/sitemap.xml is exercised
 * via the homepage-meta checks only (which doesn't fetch).
 *
 *   npm run test:preflight-intelligence
 *
 * Asserts (block-by-block):
 *   1. extractReadableContent — Readability path + body-fallback path
 *      + empty input handling.
 *   2. validateSchema — valid LocalBusiness fixture scores high, a
 *      degraded fixture scores low, missing/malformed fields are
 *      enumerated.
 *   3. crawlabilityAudit (homepage portion only) — noindex meta
 *      detected, missing canonical detected.
 *   4. checkEntityConsistency — name/phone/address pulled out of
 *      schema vs prose; mismatch detected.
 *   5. runPreflight orchestrator — never throws on degenerate input.
 */

import assert from "node:assert/strict";
import { extractReadableContent } from "../src/lib/intelligence/preflight/extractReadableContent";
import { validateSchema } from "../src/lib/intelligence/preflight/schemaValidation";
import { auditCrawlability } from "../src/lib/intelligence/preflight/crawlabilityAudit";
import { checkEntityConsistency } from "../src/lib/intelligence/preflight/entityConsistency";
import { runPreflight } from "../src/lib/intelligence/preflight/runPreflight";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      passed += 1;
      console.log(`  ✓ ${name}`);
    })
    .catch((err: unknown) => {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ ${name}\n      ${message}`);
    });
}

// ─── Fixtures ──────────────────────────────────────────────────

const ARTICLE_HTML = `<!doctype html><html><head>
  <title>Acme Roofing — Trusted roofer in Phoenix</title>
  <link rel="canonical" href="https://acmeroofing.example/">
</head><body>
  <nav>Home Services Reviews Contact</nav>
  <header><h1>Acme Roofing</h1></header>
  <main>
    <article>
      <h2>Trusted roofer in Phoenix since 1998</h2>
      <p>Acme Roofing has served the Phoenix Valley for over 25 years. We
      handle re-roofs, repairs, and storm damage. Our crew is licensed,
      bonded, and insured. Call us at (602) 555-0188 for a free estimate.
      Located at 1500 E Camelback Rd, Phoenix, AZ 85014.</p>
      <p>We work on tile, shingle, and flat roofs. Every job comes with a
      ten-year warranty and same-week scheduling for emergencies.</p>
    </article>
  </main>
  <footer>
    <p>Acme Roofing · 1500 E Camelback Rd, Phoenix, AZ 85014 · (602) 555-0188</p>
  </footer>
</body></html>`;

const VALID_SCHEMA_HTML = `<!doctype html><html><head>
  <title>Acme</title>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "RoofingContractor",
    name: "Acme Roofing",
    url: "https://acmeroofing.example",
    telephone: "+1-602-555-0188",
    address: {
      "@type": "PostalAddress",
      streetAddress: "1500 E Camelback Rd",
      addressLocality: "Phoenix",
      addressRegion: "AZ",
      postalCode: "85014",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 33.5092,
      longitude: -112.0734,
    },
    openingHours: ["Mo-Fr 08:00-17:00", "Sa 09:00-12:00"],
  })}</script>
</head><body><h1>Acme Roofing</h1></body></html>`;

const PARTIAL_SCHEMA_HTML = `<!doctype html><html><head>
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Acme",
    // missing telephone, url, geo, openingHours
    address: { "@type": "PostalAddress", addressLocality: "Phoenix" },
  })}</script>
</head><body></body></html>`;

const MALFORMED_SCHEMA_HTML = `<!doctype html><html><head>
  <script type="application/ld+json">{ "@type": "LocalBusiness", broken</script>
</head><body></body></html>`;

const NOINDEX_HTML = `<!doctype html><html><head>
  <meta name="robots" content="noindex,nofollow">
</head><body></body></html>`;

const ENTITY_MATCH_HTML = `<!doctype html><html><head>
  <title>Acme Roofing — Phoenix AZ</title>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "RoofingContractor",
    name: "Acme Roofing",
    telephone: "(602) 555-0188",
    address: { "@type": "PostalAddress", streetAddress: "1500 E Camelback Rd", addressLocality: "Phoenix" },
  })}</script>
</head><body>
  <h1>Acme Roofing</h1>
  <p>Reach us at (602) 555-0188. 1500 E Camelback Rd, Phoenix.</p>
  <footer>(602) 555-0188 · 1500 E Camelback Rd</footer>
</body></html>`;

const ENTITY_MISMATCH_HTML = `<!doctype html><html><head>
  <script type="application/ld+json">${JSON.stringify({
    "@type": "RoofingContractor",
    name: "Acme Roofing",
    telephone: "(602) 555-0188",
  })}</script>
</head><body>
  <h1>Acme Roofing</h1>
  <p>Call us at (480) 555-9999.</p>
  <footer>(480) 555-9999</footer>
</body></html>`;

// ─── Tests ─────────────────────────────────────────────────────

async function main() {
  console.log("\n[1] extractReadableContent");
  await test("Readability extracts clean text from article HTML", () => {
    const r = extractReadableContent(ARTICLE_HTML, "https://acmeroofing.example/");
    assert.ok(r.textLength > 0, "expected non-empty extracted text");
    assert.ok(r.wordCount > 30, `expected substantive word count, got ${r.wordCount}`);
    // Nav line should be dropped or de-emphasized — preview shouldn't open with "Home Services".
    assert.ok(
      !r.preview.toLowerCase().startsWith("home services"),
      `unexpected nav noise in preview: "${r.preview.slice(0, 80)}"`,
    );
  });
  await test("Readability returns parseable=true on article-shaped page", () => {
    const r = extractReadableContent(ARTICLE_HTML, "https://acmeroofing.example/");
    assert.ok(
      r.parsedByReadability || r.fallbackUsed,
      "must report either Readability or fallback parse",
    );
  });
  await test("extractReadableContent handles empty input", () => {
    const r = extractReadableContent("", "https://example.com");
    assert.equal(r.textLength, 0);
    assert.equal(r.wordCount, 0);
  });

  console.log("\n[2] validateSchema");
  await test("valid LocalBusiness fixture scores 100", () => {
    const r = validateSchema(VALID_SCHEMA_HTML, "https://acmeroofing.example/");
    assert.equal(r.rawJsonLdCount, 1);
    assert.equal(r.score, 100, `expected 100, got ${r.score}; missing=${r.missingFields.join(",")}`);
    assert.deepEqual(r.missingFields, []);
    assert.ok(r.detectedTypes.includes("RoofingContractor"));
  });
  await test("partial fixture reports the correct missing fields", () => {
    const r = validateSchema(PARTIAL_SCHEMA_HTML, "https://acmeroofing.example/");
    assert.equal(r.rawJsonLdCount, 1);
    assert.ok(r.score < 50, `expected score <50 for partial fixture, got ${r.score}`);
    assert.ok(r.missingFields.includes("telephone"));
    assert.ok(r.missingFields.includes("geo"));
    assert.ok(r.missingFields.includes("openingHours"));
  });
  await test("malformed JSON-LD does not throw, returns notes", () => {
    const r = validateSchema(MALFORMED_SCHEMA_HTML, "https://acmeroofing.example/");
    assert.equal(r.rawJsonLdCount, 1);
    assert.equal(r.score, 0);
    assert.ok(r.notes.some((n) => /parse/i.test(n)), `expected parse note, got ${r.notes.join(";")}`);
  });

  console.log("\n[3] auditCrawlability (homepage-meta portion)");
  await test("noindex meta tag is detected as a failed check", async () => {
    // We can't easily mock the robots.txt / sitemap.xml fetches without a
    // live origin — accept whatever happens there (likely both fail because
    // example.com routes don't exist). Just assert the homepage-meta check
    // fired correctly.
    const r = await auditCrawlability({
      url: "https://example.invalid/",
      homepageHtml: NOINDEX_HTML,
    });
    assert.ok(
      r.failedChecks.includes("homepage_not_noindex"),
      `expected noindex detection, got passed=${r.passedChecks.join(",")} failed=${r.failedChecks.join(",")}`,
    );
  });
  await test("missing canonical is detected as a failed check", async () => {
    const r = await auditCrawlability({
      url: "https://example.invalid/",
      homepageHtml: NOINDEX_HTML, // also missing canonical
    });
    assert.ok(
      r.failedChecks.includes("canonical_present"),
      `expected canonical fail, got failed=${r.failedChecks.join(",")}`,
    );
  });

  console.log("\n[4] checkEntityConsistency");
  await test("matching entity returns high confidence + score", () => {
    const r = checkEntityConsistency({
      url: "https://acmeroofing.example/",
      html: ENTITY_MATCH_HTML,
    });
    assert.ok(r.score >= 80, `expected score>=80 for matching fixture, got ${r.score}`);
    assert.equal(r.extractedEntities.phone.schema, "(602) 555-0188");
  });
  await test("phone mismatch is reported", () => {
    const r = checkEntityConsistency({
      url: "https://acmeroofing.example/",
      html: ENTITY_MISMATCH_HTML,
    });
    assert.ok(
      r.inconsistencies.some((s) => /phone/i.test(s)),
      `expected phone inconsistency in ${JSON.stringify(r.inconsistencies)}`,
    );
    assert.ok(r.score < 100, `expected score<100 for mismatch, got ${r.score}`);
  });

  console.log("\n[5] runPreflight orchestrator");
  await test("orchestrator returns ok=false on unreachable URL (no throw)", async () => {
    // example.invalid is a guaranteed-unreachable TLD per RFC 6761 — the
    // fetch will fail, the orchestrator should fold the error into the
    // result rather than throwing.
    const r = await runPreflight("https://example.invalid/");
    assert.equal(r.fetchOk, false);
    assert.equal(r.ok, false);
    assert.ok(r.fetchError && r.fetchError.length > 0, "expected fetchError populated");
  });

  console.log(
    `\n[preflight-intelligence] passed=${passed} failed=${failed} total=${passed + failed}`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("[preflight-intelligence] fatal:", err);
  process.exit(1);
});
