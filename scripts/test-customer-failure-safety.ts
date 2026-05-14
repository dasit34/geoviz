/* eslint-disable no-console */
/**
 * scripts/test-customer-failure-safety.ts
 *
 *   npm run test:customer-failure-safety
 *
 * Asserts every claim the customer-facing failure safety layer must
 * uphold before paid launch:
 *
 *   1. classifyWrapperFailure detects spending_cap_reached from the
 *      exact 400 message Anthropic returns (seen in production logs
 *      on 2026-05-14).
 *   2. classifyWrapperFailure detects temporary_provider_outage from
 *      5xx / overloaded signatures.
 *   3. shouldRetry: spending_cap_reached is NOT transient (no retry).
 *   4. shouldRetry: temporary_provider_outage IS transient (retry up
 *      to MAX_AUTO_RETRIES).
 *   5. shouldRetry: timeout / fetch_failed still transient (no
 *      regression).
 *   6. shouldRetry: generation_failed / db_save_failed / worker_exception
 *      still non-transient (no regression).
 *   7. mapToCustomerCategory translates every internal reason to a
 *      customer-safe category.
 *   8. deriveCustomerStatus: spending_cap_reached + failed → "delayed".
 *   9. deriveCustomerStatus: temporary_provider_outage + failed →
 *      "delayed".
 *  10. deriveCustomerStatus: robots_blocked + failed → "failed" (not
 *      delayed — site-side, not infra).
 *  11. deriveCustomerStatus: queued + retryCount > 0 → "retrying".
 *  12. deriveCustomerStatus: running → "processing".
 *  13. customerCopyFor: zero copy strings mention provider names,
 *      model names, billing/cap/quota language, or technical jargon.
 *  14. isLaunchRiskFailure: paid spending-cap = launch risk.
 *  15. isLaunchRiskFailure: calibration spending-cap = NOT launch
 *      risk.
 *  16. isCalibrationOrder: detects the synthetic email pattern.
 */

import assert from "node:assert/strict";
import {
  classifyWrapperFailure,
  shouldRetry,
  MAX_AUTO_RETRIES,
  type FailureReason,
} from "../src/lib/processing-status";
import {
  customerCopyFor,
  deriveCustomerStatus,
  isCalibrationOrder,
  isLaunchRiskFailure,
  mapToCustomerCategory,
  type CustomerStatus,
} from "../src/lib/customer-failure-mapping";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ ${name}\n      ${message}`);
  }
}

// ── 1-2. classifyWrapperFailure detector upgrades ─────────────────
console.log("\n[1-2] classifyWrapperFailure — spending-cap + provider-outage detection");

// The exact production error string captured in Railway logs on
// 2026-05-14. Verbatim from `req_011Cb2sSNRrpxNLkv5wZYd7X`.
const PROD_SPENDING_CAP_400 =
  `Anthropic API error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-06-01 at 00:00 UTC."}}`;

test("detects spending_cap_reached from exact production 400 message", () => {
  assert.equal(
    classifyWrapperFailure("non-zero-exit", PROD_SPENDING_CAP_400),
    "spending_cap_reached",
  );
});
test("detects spending_cap_reached from 'spending limit' phrasing", () => {
  assert.equal(
    classifyWrapperFailure("non-zero-exit", "We've exceeded the spending limit for this month."),
    "spending_cap_reached",
  );
});
test("detects temporary_provider_outage from 503 service unavailable", () => {
  assert.equal(
    classifyWrapperFailure("non-zero-exit", "Anthropic API error: 503 service unavailable"),
    "temporary_provider_outage",
  );
});
test("detects temporary_provider_outage from 'overloaded' signature", () => {
  assert.equal(
    classifyWrapperFailure("non-zero-exit", "Server overloaded, try again later."),
    "temporary_provider_outage",
  );
});
test("falls through to generation_failed when no specific signature matches", () => {
  assert.equal(
    classifyWrapperFailure("non-zero-exit", "Unknown 400 error with no recognized text."),
    "generation_failed",
  );
});

// ── 3-6. Retry policy ──────────────────────────────────────────────
console.log("\n[3-6] Retry policy — only transient reasons retry");

test("spending_cap_reached is NOT retryable (would never succeed)", () => {
  assert.equal(shouldRetry("spending_cap_reached", 0), false);
  assert.equal(shouldRetry("spending_cap_reached", 1), false);
});
test("temporary_provider_outage IS retryable up to MAX_AUTO_RETRIES", () => {
  assert.equal(shouldRetry("temporary_provider_outage", 0), true);
  assert.equal(shouldRetry("temporary_provider_outage", MAX_AUTO_RETRIES - 1), true);
  assert.equal(shouldRetry("temporary_provider_outage", MAX_AUTO_RETRIES), false);
});
test("existing transient reasons still retry (no regression)", () => {
  const transient: FailureReason[] = ["timeout", "fetch_failed", "queue_interruption", "render_failed"];
  for (const r of transient) {
    assert.equal(shouldRetry(r, 0), true, `expected ${r} to be retryable`);
  }
});
test("hard-fail reasons still do not retry (no regression)", () => {
  const nonTransient: FailureReason[] = [
    "generation_failed",
    "db_save_failed",
    "worker_exception",
    "robots_blocked",
    "invalid_html",
    "spawn_failed",
    "empty_output",
    "cancelled",
  ];
  for (const r of nonTransient) {
    assert.equal(shouldRetry(r, 0), false, `expected ${r} to NOT retry`);
  }
});

// ── 7. mapToCustomerCategory ──────────────────────────────────────
console.log("\n[7] Customer-safe category mapping");
test("every internal reason maps to a customer-safe category", () => {
  const expected: Record<FailureReason, string> = {
    spending_cap_reached: "spending_cap_reached",
    temporary_provider_outage: "temporary_provider_outage",
    generation_failed: "upstream_model_error",
    timeout: "fetch_timeout",
    fetch_failed: "fetch_timeout",
    robots_blocked: "crawler_blocked",
    db_save_failed: "internal_processing_error",
    worker_exception: "internal_processing_error",
    invalid_html: "internal_processing_error",
    render_failed: "internal_processing_error",
    queue_interruption: "internal_processing_error",
    spawn_failed: "internal_processing_error",
    empty_output: "internal_processing_error",
    cancelled: "internal_processing_error",
  };
  for (const [reason, expectedCategory] of Object.entries(expected)) {
    assert.equal(
      mapToCustomerCategory(reason as FailureReason),
      expectedCategory,
      `${reason} → ${expectedCategory}`,
    );
  }
});

// ── 8-12. deriveCustomerStatus ─────────────────────────────────────
console.log("\n[8-12] Customer status derivation");
test("spending_cap_reached on failed → 'delayed' (recoverable framing)", () => {
  assert.equal(
    deriveCustomerStatus({
      reportStatus: "failed",
      failureReason: "spending_cap_reached",
      retryCount: 0,
    }),
    "delayed",
  );
});
test("temporary_provider_outage on failed → 'delayed'", () => {
  assert.equal(
    deriveCustomerStatus({
      reportStatus: "failed",
      failureReason: "temporary_provider_outage",
      retryCount: 0,
    }),
    "delayed",
  );
});
test("robots_blocked on failed → 'failed' (site-side, not recoverable by us)", () => {
  assert.equal(
    deriveCustomerStatus({
      reportStatus: "failed",
      failureReason: "robots_blocked",
      retryCount: 0,
    }),
    "failed",
  );
});
test("generation_failed on failed → 'failed' (non-transient upstream error)", () => {
  assert.equal(
    deriveCustomerStatus({
      reportStatus: "failed",
      failureReason: "generation_failed",
      retryCount: 0,
    }),
    "failed",
  );
});
test("queued + retryCount > 0 → 'retrying'", () => {
  assert.equal(
    deriveCustomerStatus({ reportStatus: "queued", failureReason: null, retryCount: 1 }),
    "retrying",
  );
});
test("queued + retryCount 0 → 'queued'", () => {
  assert.equal(
    deriveCustomerStatus({ reportStatus: "queued", failureReason: null, retryCount: 0 }),
    "queued",
  );
});
test("running → 'processing'", () => {
  assert.equal(
    deriveCustomerStatus({ reportStatus: "running", failureReason: null, retryCount: 0 }),
    "processing",
  );
});
test("generated → 'completed'", () => {
  assert.equal(
    deriveCustomerStatus({ reportStatus: "generated", failureReason: null, retryCount: 0 }),
    "completed",
  );
});

// ── 13. Customer copy safety (NO provider/model/billing leaks) ────
console.log("\n[13] Customer copy safety");
const FORBIDDEN_PHRASES = [
  // Provider names
  /anthropic/i,
  /openai/i,
  /claude\b/i,
  /gpt[-\s]/i,
  // Billing/cap language — word boundaries so "capacity" doesn't
  // false-match "cap".
  /\bcap\b|\bquota\b|spend(?:ing)?\s+limit|\bapi (?:key|usage)\b|\bbilling\b/i,
  // Technical jargon
  /\b5\d\d\b|\b4\d\d\b|\bjson\b|\bprisma\b|stack trace|\bsdk\b|api error/i,
  // Blame
  /your fault|you should|you must/i,
];

for (const status of ["queued", "processing", "delayed", "retrying", "completed", "failed"] as CustomerStatus[]) {
  test(`copy for status="${status}" never leaks forbidden phrases`, () => {
    const c = customerCopyFor(status);
    const combined = `${c.heading} ${c.body} ${c.reassurance}`;
    for (const rx of FORBIDDEN_PHRASES) {
      assert.ok(!rx.test(combined), `status="${status}" contains forbidden pattern ${rx.source}\n  in: ${combined}`);
    }
  });
}

// ── 14-15. Launch-risk classification ──────────────────────────────
console.log("\n[14-15] Launch-risk classification");
test("paid spending-cap = launch-risk", () => {
  assert.equal(
    isLaunchRiskFailure({ reason: "spending_cap_reached", isCalibration: false }),
    true,
  );
});
test("calibration spending-cap = NOT launch-risk", () => {
  assert.equal(
    isLaunchRiskFailure({ reason: "spending_cap_reached", isCalibration: true }),
    false,
  );
});
test("paid robots_blocked = NOT launch-risk (site-side issue)", () => {
  assert.equal(
    isLaunchRiskFailure({ reason: "robots_blocked", isCalibration: false }),
    false,
  );
});
test("paid db_save_failed = launch-risk (internal but customer-impacting)", () => {
  assert.equal(
    isLaunchRiskFailure({ reason: "db_save_failed", isCalibration: false }),
    true,
  );
});

// ── 16. isCalibrationOrder ────────────────────────────────────────
console.log("\n[16] isCalibrationOrder");
test("detects the synthetic calibration email", () => {
  assert.equal(isCalibrationOrder("calibration@geoviz.invalid"), true);
  assert.equal(isCalibrationOrder("Calibration@geoviz.INVALID"), true);
});
test("does NOT flag real customer emails", () => {
  assert.equal(isCalibrationOrder("customer@example.com"), false);
  assert.equal(isCalibrationOrder("dasit34@gmail.com"), false);
  assert.equal(isCalibrationOrder(null), false);
});

console.log(
  `\n[customer-failure-safety] passed=${passed} failed=${failed} total=${passed + failed}`,
);
if (failed > 0) process.exit(1);
