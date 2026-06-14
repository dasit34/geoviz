/* eslint-disable no-console */
/**
 * scripts/test-sample-audit.ts
 *
 * Guards `isSampleAudit` — the marker that lets public sample reports bypass the
 * report-view rate limiter without weakening protection on real paid orders.
 */
import assert from "node:assert/strict";

import { isSampleAudit, SAMPLE_SESSION_PREFIX } from "../src/lib/sample-audit";

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

check("null / undefined / empty are not samples", () => {
  assert.equal(isSampleAudit(null), false);
  assert.equal(isSampleAudit(undefined), false);
  assert.equal(isSampleAudit(""), false);
});

console.log(`[sample-audit] passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
