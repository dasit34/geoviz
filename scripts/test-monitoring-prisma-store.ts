/* eslint-disable no-console */
/**
 * scripts/test-monitoring-prisma-store.ts — the real Prisma store against a
 * NON-PRODUCTION database (the guard refuses anything else). Proves the
 * database-level idempotency the pure tests rely on: unique Stripe
 * subscription id, unique scheduled-run order, atomic welcome-email
 * claim, and the webhook event ledger. Creates disposable rows and
 * deletes them in `finally`.
 *
 * Run: DATABASE_URL=<staging> GEOVIZ_NONPROD_DB_HOSTS=<host> npx tsx scripts/test-monitoring-prisma-store.ts
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { harness } from "./lib/monitoring-fakes";
import { prisma } from "../src/lib/db";
import { prismaMonitoringStore as store } from "../src/lib/monitoring/prisma-store";
import { scheduledRunSessionId } from "../src/lib/monitoring/schedule";
import { DuplicateSubscriptionError } from "../src/lib/monitoring/types";

const h = harness("monitoring-prisma-store");
const tag = randomBytes(6).toString("hex");
const stripeSubId = `sub_test_${tag}`;
const eventId = `evt_test_${tag}`;
const now = new Date();

(async () => {
  console.log("[monitoring-prisma-store] running...");
  let subId: string | null = null;
  try {
    const data = {
      accessToken: `tok_test_${tag}_${randomBytes(12).toString("hex")}`,
      planKey: "monthly",
      stripePriceId: "price_test",
      stripeSubscriptionId: stripeSubId,
      stripeCustomerId: "cus_test",
      status: "active",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date(now.getTime() + 30 * 86_400_000),
      canceledAt: null,
      endedAt: null,
      lastSyncedAt: now,
      websiteUrl: `https://monitoring-test-${tag}.invalid`,
      // Legacy-style row (no business key) so this test isolates the
      // Stripe-subscription-id uniqueness check.
      siteKey: null,
      businessName: "[TEST] monitoring store",
      email: "monitoring-test@example.invalid",
      businessId: null,
      baselineAuditOrderId: null,
      cadenceDays: 30,
      nextAuditAt: now,
    };

    await h.check("create + unique Stripe subscription id → DuplicateSubscriptionError", async () => {
      const created = await store.create(data);
      subId = created.id;
      await assert.rejects(() => store.create({ ...data, accessToken: `${data.accessToken}x` }), DuplicateSubscriptionError);
    });

    await h.check("scheduled-run order is idempotent on its deterministic session id", async () => {
      const sub = (await store.findBySubscriptionId(stripeSubId))!;
      const sessionId = scheduledRunSessionId(sub.id, now);
      const a = await store.createScheduledAuditOrder({ subscription: sub, stripeSessionId: sessionId, queuedAt: now });
      const b = await store.createScheduledAuditOrder({ subscription: sub, stripeSessionId: sessionId, queuedAt: now });
      assert.equal(a.outcome, "created");
      assert.equal(b.outcome, "already_exists");
      const orders = await prisma.auditOrder.findMany({ where: { monitoringSubscriptionId: sub.id } });
      assert.equal(orders.length, 1);
      assert.equal(orders[0]!.orderType, "MONITORING_RECHECK");
      assert.equal(orders[0]!.reportStatus, "queued");
      assert.equal(orders[0]!.amount, 0);
      assert.equal(await store.hasInFlightAudit(sub.id), true);
    });

    await h.check("welcome email claim is atomic under concurrency", async () => {
      const results = await Promise.all([1, 2, 3].map(() => store.claimWelcomeEmail(subId!, now)));
      assert.equal(results.filter(Boolean).length, 1);
    });

    await h.check("event ledger: unprocessed → retried; processed → duplicate", async () => {
      assert.deepEqual(await store.recordEventAttempt(eventId, "checkout.session.completed"), { alreadyProcessed: false });
      await store.markEventFailed(eventId, "boom");
      assert.deepEqual(await store.recordEventAttempt(eventId, "checkout.session.completed"), { alreadyProcessed: false });
      await store.markEventProcessed(eventId, now);
      assert.deepEqual(await store.recordEventAttempt(eventId, "checkout.session.completed"), { alreadyProcessed: true });
      const row = await prisma.stripeWebhookEvent.findUnique({ where: { id: eventId } });
      assert.equal(row?.attempts, 3);
      assert.equal(row?.lastError, null);
    });

    await h.check("findDue returns only schedulable, due subscriptions", async () => {
      const due = await store.findDue(new Date(now.getTime() + 1000), 50);
      assert.ok(due.some((s) => s.id === subId));
      await store.updateBilling(subId!, { status: "canceled", stripeCustomerId: "cus_test", stripePriceId: "price_test", cancelAtPeriodEnd: false, currentPeriodEnd: null, canceledAt: now, endedAt: now, lastSyncedAt: now });
      const dueAfter = await store.findDue(new Date(now.getTime() + 1000), 50);
      assert.ok(!dueAfter.some((s) => s.id === subId));
    });
  } finally {
    if (subId) {
      await prisma.auditOrder.deleteMany({ where: { monitoringSubscriptionId: subId } });
      await prisma.monitoringSubscription.deleteMany({ where: { id: subId } });
    }
    await prisma.stripeWebhookEvent.deleteMany({ where: { id: eventId } });
    await prisma.$disconnect();
  }
  h.done();
})();
