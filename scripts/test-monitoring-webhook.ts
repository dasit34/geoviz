/* eslint-disable no-console */
/**
 * scripts/test-monitoring-webhook.ts — webhook idempotency and
 * order-independence for subscription create/update/cancel.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import {
  T0,
  checkoutEvent,
  createFakeStore,
  createFakeStripe,
  harness,
  monitoringSnapshot,
  subscriptionEvent,
  webhookDeps,
} from "./lib/monitoring-fakes";
import { handleMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-webhook");

(async () => {
  console.log("[monitoring-webhook] running...");

  await h.check("checkout.session.completed creates exactly one active subscription + one welcome email", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    const { deps, sentWelcome } = webhookDeps(store, stripe.gateway, { now: T0 });
    const r = await handleMonitoringStripeEvent(checkoutEvent("evt_c1"), deps);
    assert.equal(r.outcome, "synced");
    assert.equal(store.subs.size, 1);
    const sub = [...store.subs.values()][0]!;
    assert.equal(sub.status, "active");
    assert.equal(sub.stripeCheckoutSessionId, "cs_test_123");
    assert.equal(sub.stripeCustomerId, "cus_123");
    assert.equal(sub.businessId, "biz_1");
    assert.equal(sub.baselineAuditOrderId, "order_baseline");
    assert.equal(sub.cadenceDays, 30);
    assert.equal(sub.nextAuditAt?.getTime(), T0.getTime(), "first audit due immediately");
    assert.ok(sub.accessToken.length >= 20);
    assert.deepEqual(sentWelcome, [sub.id]);
  });

  await h.check("same event delivered twice → processed once (ledger), no duplicate row or email", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    const { deps, sentWelcome } = webhookDeps(store, stripe.gateway, { now: T0 });
    await handleMonitoringStripeEvent(checkoutEvent("evt_dup"), deps);
    const again = await handleMonitoringStripeEvent(checkoutEvent("evt_dup"), deps);
    assert.equal(again.outcome, "duplicate");
    assert.equal(store.subs.size, 1);
    assert.equal(sentWelcome.length, 1);
    assert.equal(store.events.get("evt_dup")?.attempts, 2);
    assert.equal(stripe.retrievals, 1, "duplicate did not re-hit Stripe");
  });

  await h.check("different events for one subscription (created → checkout → updated) converge on one row", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    const { deps, sentWelcome } = webhookDeps(store, stripe.gateway, { now: T0 });
    await handleMonitoringStripeEvent(subscriptionEvent("evt_a", "customer.subscription.created"), deps);
    await handleMonitoringStripeEvent(checkoutEvent("evt_b"), deps);
    await handleMonitoringStripeEvent(subscriptionEvent("evt_c", "customer.subscription.updated"), deps);
    assert.equal(store.subs.size, 1);
    assert.equal([...store.subs.values()][0]!.stripeCheckoutSessionId, "cs_test_123");
    assert.equal(sentWelcome.length, 1, "welcome email claimed exactly once across events");
  });

  await h.check("out-of-order: a stale 'updated' payload after cancellation cannot resurrect access (re-read from Stripe)", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    const clock = { now: T0 };
    const { deps } = webhookDeps(store, stripe.gateway, clock);
    await handleMonitoringStripeEvent(checkoutEvent("evt_1"), deps);
    stripe.set(monitoringSnapshot({ status: "canceled", canceledAt: T0, endedAt: T0 }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_2", "customer.subscription.deleted"), deps);
    // An older "updated" event arrives late — its payload is ignored; Stripe says canceled.
    await handleMonitoringStripeEvent(subscriptionEvent("evt_0_late", "customer.subscription.updated"), deps);
    assert.equal([...store.subs.values()][0]!.status, "canceled");
  });

  await h.check("incomplete → active: scheduling starts only once payment succeeds", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot({ status: "incomplete" }));
    const clock = { now: T0 };
    const { deps, sentWelcome } = webhookDeps(store, stripe.gateway, clock);
    await handleMonitoringStripeEvent(subscriptionEvent("evt_i", "customer.subscription.created"), deps);
    let sub = [...store.subs.values()][0]!;
    assert.equal(sub.nextAuditAt, null);
    assert.equal(sentWelcome.length, 0);
    stripe.set(monitoringSnapshot({ status: "active" }));
    clock.now = new Date(T0.getTime() + 60_000);
    await handleMonitoringStripeEvent(subscriptionEvent("evt_j", "customer.subscription.updated"), deps);
    sub = [...store.subs.values()][0]!;
    assert.equal(sub.nextAuditAt?.getTime(), clock.now.getTime());
    assert.equal(sentWelcome.length, 1);
  });

  await h.check("non-GeoViz subscriptions are ignored (acknowledged, no row)", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot({ metadata: { someOtherProduct: "x" } }));
    const { deps } = webhookDeps(store, stripe.gateway, { now: T0 });
    const r = await handleMonitoringStripeEvent(subscriptionEvent("evt_x", "customer.subscription.created"), deps);
    assert.equal(r.outcome, "ignored");
    assert.equal(store.subs.size, 0);
    assert.ok(store.events.get("evt_x")?.processedAt, "ignored events are still marked processed");
  });

  await h.check("failure leaves the event unprocessed and rethrows (route returns 500 → Stripe retries)", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe(); // no subscription set → retrieve throws
    const { deps } = webhookDeps(store, stripe.gateway, { now: T0 });
    await assert.rejects(() => handleMonitoringStripeEvent(checkoutEvent("evt_fail"), deps));
    assert.equal(store.events.get("evt_fail")?.processedAt, null);
    assert.match(store.events.get("evt_fail")?.lastError ?? "", /no such subscription/);
    // Retry after Stripe has the subscription → succeeds.
    stripe.set(monitoringSnapshot());
    const r = await handleMonitoringStripeEvent(checkoutEvent("evt_fail"), deps);
    assert.equal(r.outcome, "synced");
    assert.equal(store.subs.size, 1);
  });

  await h.check("concurrent creation race resolves to a single row", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    const { deps } = webhookDeps(store, stripe.gateway, { now: T0 });
    await Promise.all([
      handleMonitoringStripeEvent(subscriptionEvent("evt_r1", "customer.subscription.created"), deps),
      handleMonitoringStripeEvent(checkoutEvent("evt_r2"), deps),
    ]);
    assert.equal(store.subs.size, 1);
  });

  h.done();
})();
