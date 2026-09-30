/* eslint-disable no-console */
/**
 * scripts/test-normalize-domain.ts
 *
 * Pure-function regression test for `normalizeDomain()`
 * (src/lib/business/normalize-domain.ts) — the canonical identity key
 * every business-linking lookup/create is keyed on. No DB, no I/O.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { normalizeDomain } from "../src/lib/business/normalize-domain";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(label: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${label} — ${msg}`);
    console.log(`  ✗ ${label} — ${msg}`);
  }
}

function main(): void {
  console.log("[normalize-domain] running...");

  check("protocol: https vs http vs no protocol all match", () => {
    assert.equal(normalizeDomain("https://example.com"), "example.com");
    assert.equal(normalizeDomain("http://example.com"), "example.com");
    assert.equal(normalizeDomain("example.com"), "example.com");
  });

  check("www vs non-www match", () => {
    assert.equal(normalizeDomain("https://www.example.com"), "example.com");
    assert.equal(normalizeDomain("https://example.com"), "example.com");
  });

  check("trailing slash is irrelevant", () => {
    assert.equal(normalizeDomain("https://example.com/"), "example.com");
    assert.equal(normalizeDomain("https://example.com"), "example.com");
  });

  check("case is normalized", () => {
    assert.equal(normalizeDomain("https://EXAMPLE.com"), "example.com");
    assert.equal(normalizeDomain("https://Www.Example.COM"), "example.com");
  });

  check("path is stripped", () => {
    assert.equal(normalizeDomain("https://example.com/services"), "example.com");
    assert.equal(normalizeDomain("https://example.com/a/b/c"), "example.com");
  });

  check("query string is stripped", () => {
    assert.equal(
      normalizeDomain("https://example.com/services?utm_source=test"),
      "example.com",
    );
    assert.equal(normalizeDomain("https://example.com?a=1&b=2"), "example.com");
  });

  check("fragment is stripped", () => {
    assert.equal(normalizeDomain("https://example.com#pricing"), "example.com");
    assert.equal(normalizeDomain("https://example.com/services#faq"), "example.com");
  });

  check("the exact combined example from the spec", () => {
    const expected = "example.com";
    assert.equal(normalizeDomain("https://www.example.com"), expected);
    assert.equal(normalizeDomain("https://example.com/"), expected);
    assert.equal(normalizeDomain("http://example.com"), expected);
    assert.equal(
      normalizeDomain("https://example.com/services?utm_source=test"),
      expected,
    );
  });

  check("invalid URLs return null, never a guess", () => {
    assert.equal(normalizeDomain(""), null);
    assert.equal(normalizeDomain("   "), null);
    assert.equal(normalizeDomain(null), null);
    assert.equal(normalizeDomain(undefined), null);
    assert.equal(normalizeDomain("not a url at all"), null);
    assert.equal(normalizeDomain("localhost"), null);
    assert.equal(normalizeDomain("ftp://example.com"), "example.com"); // any URL-parseable protocol still yields a domain
  });

  check("meaningful subdomains are preserved as distinct, not merged", () => {
    assert.equal(normalizeDomain("https://shop.example.com"), "shop.example.com");
    assert.notEqual(
      normalizeDomain("https://shop.example.com"),
      normalizeDomain("https://example.com"),
    );
    // ...but www specifically remains the one recognized alias
    assert.equal(
      normalizeDomain("https://www.example.com"),
      normalizeDomain("https://example.com"),
    );
  });

  console.log(`[normalize-domain] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main();
