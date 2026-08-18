/* eslint-disable no-console */
/**
 * scripts/test-reaudit-checkout.ts
 *
 * Regression test for `buildReAuditCheckoutSessionParams`
 * (src/lib/audit-orders/reaudit-checkout-params.ts) — the pure builder
 * behind `POST /api/checkout/re-audit`. No Stripe API calls, no
 * database connection, no live/test-mode charges: this only proves the
 * request-building logic is correct in isolation. Proves:
 *   - the $59 re-audit price id is used, never the $97 one;
 *   - websiteUrl/businessName are ALWAYS derived from the previous
 *     order, never from any other source — the actual mechanism that
 *     prevents "claim eligibility from order A, audit business B";
 *   - metadata carries productType=RE_AUDIT + previousOrderId, the
 *     trusted signal the webhook branch reads;
 *   - an invalid email override is ignored in favor of the previous
 *     order's own email; a valid override is honored.
 */
import assert from "node:assert/strict";
import type { AuditOrder } from "@prisma/client";
import { buildReAuditCheckoutSessionParams } from "../src/lib/audit-orders/reaudit-checkout-params";

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

function fakePreviousOrder(overrides: Partial<AuditOrder> = {}): AuditOrder {
  return {
    id: "cprevious0000000000000001",
    websiteUrl: "https://previous-business.invalid",
    email: "previous-customer@example.invalid",
    businessName: "Previous Business LLC",
    competitorUrl: null,
    stripeSessionId: "cs_test_previous",
    amount: 9700,
    currency: "usd",
    orderType: null,
    paymentStatus: "paid",
    auditStatus: "completed",
    notes: null,
    adminEmailSentAt: null,
    reportStatus: "generated",
    reportMarkdown: "...",
    reportError: null,
    reportQueuedAt: null,
    reportStartedAt: null,
    reportGeneratedAt: new Date(),
    reportSentToCustomerAt: null,
    reviewStatus: "approved",
    adminNotes: null,
    qualityScore: null,
    sentTo: null,
    sentCc: null,
    customerConfirmationSentAt: null,
    failureReason: null,
    retryCount: 0,
    lastRetryAt: null,
    inputTokens: null,
    outputTokens: null,
    cacheCreationTokens: null,
    cacheReadTokens: null,
    modelUsed: null,
    estimatedCostUsd: null,
    workerRuntimeMs: null,
    customerFailureNotifiedAt: null,
    calibrationBatchId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    businessId: null,
    previousAuditOrderId: null,
    ...overrides,
  } as AuditOrder;
}

function main(): void {
  console.log("[reaudit-checkout] running...");

  check("uses the given re-audit price id", () => {
    const params = buildReAuditCheckoutSessionParams({
      previousOrder: fakePreviousOrder(),
      emailOverride: "",
      priceId: "price_reaudit_59",
      siteUrl: "https://geoviz.ai",
    });
    assert.equal(params.line_items?.[0]?.price, "price_reaudit_59");
  });

  check("websiteUrl/businessName are derived from the previous order, not client input", () => {
    const previousOrder = fakePreviousOrder({
      websiteUrl: "https://real-business.invalid",
      businessName: "Real Business Inc",
    });
    const params = buildReAuditCheckoutSessionParams({
      previousOrder,
      emailOverride: "",
      priceId: "price_reaudit_59",
      siteUrl: "https://geoviz.ai",
    });
    const metadata = params.metadata as Record<string, string>;
    assert.equal(metadata.websiteUrl, "https://real-business.invalid");
    assert.equal(metadata.businessName, "Real Business Inc");
    assert.equal(
      (params.payment_intent_data?.description ?? "").includes("real-business.invalid"),
      true,
    );
  });

  check("metadata marks productType=RE_AUDIT and carries previousOrderId", () => {
    const previousOrder = fakePreviousOrder({ id: "cprevious0000000000000042" });
    const params = buildReAuditCheckoutSessionParams({
      previousOrder,
      emailOverride: "",
      priceId: "price_reaudit_59",
      siteUrl: "https://geoviz.ai",
    });
    const metadata = params.metadata as Record<string, string>;
    assert.equal(metadata.productType, "RE_AUDIT");
    assert.equal(metadata.previousOrderId, "cprevious0000000000000042");
    const piMetadata = params.payment_intent_data?.metadata as Record<string, string>;
    assert.equal(piMetadata.productType, "RE_AUDIT");
  });

  check("invalid email override is ignored in favor of the previous order's email", () => {
    const previousOrder = fakePreviousOrder({ email: "original@example.invalid" });
    const params = buildReAuditCheckoutSessionParams({
      previousOrder,
      emailOverride: "not-an-email",
      priceId: "price_reaudit_59",
      siteUrl: "https://geoviz.ai",
    });
    assert.equal(params.customer_email, "original@example.invalid");
  });

  check("valid email override is honored", () => {
    const previousOrder = fakePreviousOrder({ email: "original@example.invalid" });
    const params = buildReAuditCheckoutSessionParams({
      previousOrder,
      emailOverride: "updated@example.invalid",
      priceId: "price_reaudit_59",
      siteUrl: "https://geoviz.ai",
    });
    assert.equal(params.customer_email, "updated@example.invalid");
    const metadata = params.metadata as Record<string, string>;
    assert.equal(metadata.email, "updated@example.invalid");
  });

  check("success_url/cancel_url are built from the given siteUrl", () => {
    const params = buildReAuditCheckoutSessionParams({
      previousOrder: fakePreviousOrder(),
      emailOverride: "",
      priceId: "price_reaudit_59",
      siteUrl: "https://geoviz.ai",
    });
    assert.equal(
      params.success_url,
      "https://geoviz.ai/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    );
    assert.equal(params.cancel_url, "https://geoviz.ai");
  });

  console.log(`[reaudit-checkout] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main();
