/* eslint-disable no-console */
/**
 * scripts/test-reaudit-eligibility.ts
 *
 * Regression test for `validateReAuditEligibility`
 * (src/lib/audit-orders/reaudit-eligibility.ts) — the single
 * server-side gate for "can a $59 re-audit be purchased against this
 * prior order?" Proves:
 *   - a genuinely eligible order (paid, generated, approved) passes;
 *   - a nonexistent order id is rejected;
 *   - an unpaid order is rejected;
 *   - an order whose report hasn't generated yet is rejected;
 *   - a generated-but-not-yet-approved order is rejected;
 *   - the returned `previousOrder` carries the real websiteUrl/email —
 *     confirming callers derive those fields from validated data
 *     rather than trusting client input.
 *
 * Requires a live DB connection — same category as
 * scripts/test-checkout-audit-creation.ts, which this mirrors in shape.
 */
import assert from "node:assert/strict";
import { prisma } from "../src/lib/db";
import { validateReAuditEligibility } from "../src/lib/audit-orders/reaudit-eligibility";

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

const MARKER = `test-reaudit-eligibility-${Date.now()}`;
const sessionIds: string[] = [];

async function makeOrder(opts: {
  suffix: string;
  paymentStatus: "pending" | "paid" | "failed";
  reportStatus: string;
  reviewStatus: string;
}) {
  const stripeSessionId = `${MARKER}-${opts.suffix}`;
  sessionIds.push(stripeSessionId);
  return prisma.auditOrder.create({
    data: {
      stripeSessionId,
      websiteUrl: `https://${MARKER}-${opts.suffix}.invalid`,
      email: `buyer-${opts.suffix}@example.invalid`,
      businessName: `[TEST-REAUDIT] ${opts.suffix}`,
      amount: 9700,
      currency: "usd",
      paymentStatus: opts.paymentStatus,
      auditStatus: "pending",
      reportStatus: opts.reportStatus,
      reviewStatus: opts.reviewStatus,
    },
  });
}

async function main(): Promise<void> {
  console.log("[reaudit-eligibility] running...");

  try {
    await check("nonexistent order id is ineligible", async () => {
      const result = await validateReAuditEligibility("does-not-exist-cuid");
      assert.equal(result.eligible, false);
    });

    await check("empty order id is ineligible", async () => {
      const result = await validateReAuditEligibility("   ");
      assert.equal(result.eligible, false);
    });

    await check("unpaid order is ineligible", async () => {
      const order = await makeOrder({
        suffix: "unpaid",
        paymentStatus: "pending",
        reportStatus: "generated",
        reviewStatus: "approved",
      });
      const result = await validateReAuditEligibility(order.id);
      assert.equal(result.eligible, false);
    });

    await check("report not yet generated is ineligible", async () => {
      const order = await makeOrder({
        suffix: "not-generated",
        paymentStatus: "paid",
        reportStatus: "queued",
        reviewStatus: "pending",
      });
      const result = await validateReAuditEligibility(order.id);
      assert.equal(result.eligible, false);
    });

    await check("generated but not-yet-approved order is ineligible", async () => {
      const order = await makeOrder({
        suffix: "not-approved",
        paymentStatus: "paid",
        reportStatus: "generated",
        reviewStatus: "pending",
      });
      const result = await validateReAuditEligibility(order.id);
      assert.equal(result.eligible, false);
    });

    await check(
      "paid + generated + approved order is eligible, and carries real order data",
      async () => {
        const order = await makeOrder({
          suffix: "eligible",
          paymentStatus: "paid",
          reportStatus: "generated",
          reviewStatus: "approved",
        });
        const result = await validateReAuditEligibility(order.id);
        assert.equal(result.eligible, true);
        if (!result.eligible) return;
        assert.equal(result.previousOrder.id, order.id);
        assert.equal(result.previousOrder.websiteUrl, order.websiteUrl);
        assert.equal(result.previousOrder.email, order.email);
      },
    );

    await check("a completed RE_AUDIT order is itself eligible for another re-audit", async () => {
      const order = await prisma.auditOrder.create({
        data: {
          stripeSessionId: `${MARKER}-chained`,
          websiteUrl: `https://${MARKER}-chained.invalid`,
          email: "buyer-chained@example.invalid",
          businessName: "[TEST-REAUDIT] chained",
          amount: 5900,
          currency: "usd",
          paymentStatus: "paid",
          auditStatus: "pending",
          reportStatus: "generated",
          reviewStatus: "approved",
          orderType: "RE_AUDIT",
        },
      });
      sessionIds.push(`${MARKER}-chained`);
      const result = await validateReAuditEligibility(order.id);
      assert.equal(result.eligible, true);
    });
  } finally {
    await prisma.auditOrder.deleteMany({
      where: { stripeSessionId: { in: sessionIds } },
    });
  }

  console.log(`[reaudit-eligibility] passed=${passed} failed=${failed}`);
  if (failed > 0) {
    for (const f of failures) console.log(`  ✗ ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[reaudit-eligibility] unexpected error:", err);
  process.exit(1);
});
