/* eslint-disable no-console */
/**
 * scripts/test-sample-audit.ts
 *
 * Guards `isSampleAudit` — the marker that lets public sample reports bypass the
 * report-view rate limiter without weakening protection on real paid orders.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { isSampleAudit, SAMPLE_SESSION_PREFIX } from "../src/lib/sample-audit";
import { findSampleEntryBySlug, getFeaturedSlug, listedSampleEntries, sampleRobots } from "../src/lib/sample-registry";

let passed = 0;
let failed = 0;
function check(label: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    console.log(`  ✗ ${label} — ${(err as Error).message}`);
  }
}

console.log("[sample-audit] running...");

check("seeded sample session ids are recognized", () => {
  assert.equal(isSampleAudit(`${SAMPLE_SESSION_PREFIX}ohio-roofing-siding_1700000000000`), true);
  assert.equal(isSampleAudit("self_audit_geoviz_1700000000000"), true);
});

check("real Stripe session ids are NOT samples (paid protection intact)", () => {
  assert.equal(isSampleAudit("cs_test_a1b2c3d4e5"), false);
  assert.equal(isSampleAudit("cs_live_9z8y7x"), false);
});

check("stale GeoViz self-audit is unlisted: not in listings, never featured", () => {
  assert.equal(findSampleEntryBySlug("geoviz")?.unlisted, true);
  const listed = listedSampleEntries().map((e) => e.slug);
  assert.ok(!listed.includes("geoviz"), listed.join(","));
  assert.deepEqual(listed.sort(), ["charles-boyk-law", "ohio-roofing-siding"]);
  const prev = process.env.GEO_VIZ_FEATURED_SAMPLE;
  try {
    process.env.GEO_VIZ_FEATURED_SAMPLE = "geoviz";
    assert.equal(getFeaturedSlug(), "ohio-roofing-siding", "an unlisted slug can't be featured via the env override");
    process.env.GEO_VIZ_FEATURED_SAMPLE = "charles-boyk-law";
    assert.equal(getFeaturedSlug(), "charles-boyk-law");
    delete process.env.GEO_VIZ_FEATURED_SAMPLE;
    assert.equal(getFeaturedSlug(), "ohio-roofing-siding");
  } finally {
    if (prev === undefined) delete process.env.GEO_VIZ_FEATURED_SAMPLE;
    else process.env.GEO_VIZ_FEATURED_SAMPLE = prev;
  }
});

check("null / undefined / empty are not samples", () => {
  assert.equal(isSampleAudit(null), false);
  assert.equal(isSampleAudit(undefined), false);
  assert.equal(isSampleAudit(""), false);
});

check("unlisted sample page is noindex,nofollow; listed sample pages stay indexable", () => {
  assert.deepEqual(sampleRobots(findSampleEntryBySlug("geoviz")!), { index: false, follow: false });
  assert.equal(sampleRobots(findSampleEntryBySlug("ohio-roofing-siding")!), undefined);
  assert.equal(sampleRobots(findSampleEntryBySlug("charles-boyk-law")!), undefined);
});

console.log(`[sample-audit] passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
