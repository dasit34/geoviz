/* eslint-disable no-console */
/**
 * scripts/test-checkout-audit-creation.ts
 *
 * Regression test for `createAuditOrderFromCheckoutSession`
 * (src/lib/audit-orders/create-from-checkout-session.ts) — the shared
 * service the Stripe webhook and `scripts/recover-missing-checkout-order.ts`
 * both call. Proves:
 *   - a normal full-price paid checkout is created and queued;
 *   - a discounted-but-still-paid checkout behaves identically (amount
 *     is never part of the completion check);
 *   - a 100%-off checkout (payment_status "no_payment_required") is
 *     ALSO created and queued — the actual bug this module fixes;
 *   - duplicate delivery of the same session id never creates a second
 *     row (the recovery script's and the webhook's shared idempotency
 *     guarantee);
 *   - a session missing required metadata is skipped, no row written;
 *   - the service is price/product-agnostic — it never reads a price or
 *     product id, so an "unsupported product" session with otherwise
 *     valid metadata still creates/queues normally (mirrors the
 *     "don't build coupon-specific logic" instruction applied to
 *     products too).
 *
 * Requires a live DB connection — same category as
 * scripts/test-worker-recovery.ts, which this mirrors in shape.
 */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { createAuditOrderFromCheckoutSession } from "../src/lib/audit-orders/create-from-checkout-session";

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${label}`);
  } catch (err) {
    failed += 1;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${label} — ${msg}`);
    console.log(`  ✗ ${label} — ${msg}`);
  }
}

const MARKER = `test-checkout-audit-creation-${Date.now()}`;
const sessionIds: string[] = [];
function nextSessionId(suffix: string): string {
  const id = `${MARKER}-${suffix}`;
  sessionIds.push(id);
  return id;
}

async function main(): Promise<void> {
  console.log("[checkout-audit-creation] running...");

  try {
    await check("normal paid checkout ($97) is created and queued", async () => {
      const id = nextSessionId("paid-full");
      const result = await createAuditOrderFromCheckoutSession({
        id,
        metadata: { websiteUrl: "https://example-full.invalid", email: "buyer@example.invalid" },
        payment_status: "paid",
        amount_total: 9700,
        currency: "usd",
      });
      assert.equal(result.outcome, "created");
      if (result.outcome !== "created") return;
      assert.equal(result.order.paymentStatus, "paid");
      assert.equal(result.queued, true);
      const row = await prisma.auditOrder.findUniqueOrThrow({ where: { stripeSessionId: id } });
      assert.equal(row.reportStatus, "queued");
    });

    await check("discounted paid checkout is created and queued the same way", async () => {
      const id = nextSessionId("paid-discounted");
      const result = await createAuditOrderFromCheckoutSession({
        id,
        metadata: { websiteUrl: "https://example-discount.invalid", email: "buyer@example.invalid" },
        payment_status: "paid",
        amount_total: 4850, // 50% off — amount must be irrelevant to the completion check
        currency: "usd",
      });
      assert.equal(result.outcome, "created");
      if (result.outcome !== "created") return;
      assert.equal(result.order.paymentStatus, "paid");
      assert.equal(result.order.amount, 4850);
      assert.equal(result.queued, true);
    });

    await check(
      "100%-off checkout (no_payment_required) is created and queued — the core fix",
      async () => {
        const id = nextSessionId("zero-dollar");
        const result = await createAuditOrderFromCheckoutSession({
          id,
          metadata: { websiteUrl: "https://example-zero.invalid", email: "buyer@example.invalid" },
          payment_status: "no_payment_required",
          amount_total: 0,
          currency: "usd",
        });
        assert.equal(result.outcome, "created");
        if (result.outcome !== "created") return;
        assert.equal(result.order.paymentStatus, "paid");
        assert.equal(result.queued, true);
        const row = await prisma.auditOrder.findUniqueOrThrow({ where: { stripeSessionId: id } });
        assert.equal(row.reportStatus, "queued");
      },
    );

    await check("duplicate delivery of the same session id never creates a second row", async () => {
      const id = nextSessionId("duplicate");
      const first = await createAuditOrderFromCheckoutSession({
        id,
        metadata: { websiteUrl: "https://example-dup.invalid", email: "buyer@example.invalid" },
        payment_status: "no_payment_required",
        amount_total: 0,
        currency: "usd",
      });
      assert.equal(first.outcome, "created");

      const second = await createAuditOrderFromCheckoutSession({
        id,
        metadata: { websiteUrl: "https://example-dup.invalid", email: "buyer@example.invalid" },
        payment_status: "no_payment_required",
        amount_total: 0,
        currency: "usd",
      });
      assert.equal(second.outcome, "already_exists");

      const count = await prisma.auditOrder.count({ where: { stripeSessionId: id } });
      assert.equal(count, 1, "duplicate delivery must not create a second row");
    });

    await check("session missing required metadata is skipped, no row written", async () => {
      const id = nextSessionId("missing-metadata");
      const result = await createAuditOrderFromCheckoutSession({
        id,
        metadata: {}, // no websiteUrl, no email
        payment_status: "paid",
        amount_total: 9700,
        currency: "usd",
      });
      assert.equal(result.outcome, "skipped_missing_metadata");
      const count = await prisma.auditOrder.count({ where: { stripeSessionId: id } });
      assert.equal(count, 0);
    });

    await check(
      "service is price/product-agnostic — 'unsupported product' session still creates/queues",
      async () => {
        // No price/product id is ever passed to or read by
        // createAuditOrderFromCheckoutSession — this test documents that
        // deliberately, the same way the discounted/zero-dollar cases
        // document that amount is irrelevant. A session for a
        // hypothetical different product, with otherwise-valid metadata,
        // must be treated identically to any other completed checkout.
        const id = nextSessionId("unsupported-product");
        const result = await createAuditOrderFromCheckoutSession({
          id,
          metadata: { websiteUrl: "https://example-other-product.invalid", email: "buyer@example.invalid" },
          payment_status: "paid",
          amount_total: 49700, // e.g. the $497 Foundation Fix, not the $97 audit price
          currency: "usd",
        });
        assert.equal(result.outcome, "created");
        if (result.outcome !== "created") return;
        assert.equal(result.order.paymentStatus, "paid");
        assert.equal(result.queued, true);
      },
    );
  } finally {
    await prisma.auditOrder.deleteMany({
      where: { stripeSessionId: { in: sessionIds } },
    });
  }

  console.log(`[checkout-audit-creation] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[checkout-audit-creation] unexpected error:", err);
  process.exit(1);
});
