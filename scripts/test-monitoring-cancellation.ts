/* eslint-disable no-console */
/**
 * scripts/test-monitoring-cancellation.ts — cancel immediately, cancel at
 * period end, payment failure, and reactivation — all via webhooks.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import {
  DAY,
  T0,
  checkoutEvent,
  createFakeStore,
  createFakeStripe,
  harness,
  monitoringSnapshot,
  subscriptionEvent,
  webhookDeps,
} from "./lib/monitoring-fakes";
import { buildMonitoringStatusView } from "../src/lib/monitoring/status-view";
import { runMonitoringSchedulerTick } from "../src/lib/monitoring/scheduler";
import { handleMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-cancellation");
const ENABLED = { GEO_MODULE_MONITORING_ENABLED: "true" };

async function activeWithOneAudit() {
  const store = createFakeStore();
  const stripe = createFakeStripe();
  stripe.set(monitoringSnapshot());
  const clock = { now: T0 };
  const { deps } = webhookDeps(store, stripe.gateway, clock);
  await handleMonitoringStripeEvent(checkoutEvent("evt_start"), deps);
  await runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED });
  store.orders[0]!.reportStatus = "generated";
  return { store, stripe, deps, clock };
}

(async () => {
  console.log("[monitoring-cancellation] running...");

  await h.check("customer.subscription.deleted → canceled; no further audits are queued", async () => {
    const { store, stripe, deps } = await activeWithOneAudit();
    stripe.set(monitoringSnapshot({ status: "canceled", canceledAt: T0, endedAt: T0 }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_del", "customer.subscription.deleted"), deps);
    const sub = [...store.subs.values()][0]!;
    assert.equal(sub.status, "canceled");
    assert.equal(sub.endedAt?.getTime(), T0.getTime());
    await runMonitoringSchedulerTick({ store, now: () => new Date(T0.getTime() + 60 * DAY), env: ENABLED });
    assert.equal(store.orders.length, 1, "no audit after cancellation");
  });

  await h.check("cancellation keeps the status page and past reports available", async () => {
    const { store, stripe, deps } = await activeWithOneAudit();
    stripe.set(monitoringSnapshot({ status: "canceled", canceledAt: T0, endedAt: T0 }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_del2", "customer.subscription.deleted"), deps);
    const sub = [...store.subs.values()][0]!;
    const view = buildMonitoringStatusView(sub, [
      { id: "order_1", createdAt: T0, reportStatus: "generated", reviewStatus: "approved", previousAuditOrderId: null, overallScore: 52, isBaseline: false },
    ], new Date(T0.getTime() + DAY));
    assert.equal(view.access.label, "Canceled");
    assert.equal(view.nextAuditAt, null);
    assert.equal(view.audits[0]?.reportUrl, "/report/order_1/print");
    assert.equal(view.latestScore, 52);
  });

  await h.check("cancel at period end: audits due inside the paid period still run, none after", async () => {
    const { store, stripe, deps } = await activeWithOneAudit();
    const periodEnd = new Date(T0.getTime() + 45 * DAY);
    stripe.set(monitoringSnapshot({ cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_cape", "customer.subscription.updated"), deps);
    // Day 30 is inside the paid period → queued.
    await runMonitoringSchedulerTick({ store, now: () => new Date(T0.getTime() + 30 * DAY), env: ENABLED });
    assert.equal(store.orders.length, 2);
    store.orders[1]!.reportStatus = "generated";
    // Day 60 is after the period end (still "active" in Stripe until it flips) → not queued.
    await runMonitoringSchedulerTick({ store, now: () => new Date(T0.getTime() + 44 * DAY), env: ENABLED });
    const sub = [...store.subs.values()][0]!;
    assert.equal(sub.nextAuditAt?.getTime(), T0.getTime() + 60 * DAY);
    await runMonitoringSchedulerTick({ store, now: () => new Date(T0.getTime() + 60 * DAY), env: ENABLED });
    assert.equal(store.orders.length, 2, "no audit past the paid period");
  });

  await h.check("payment failure (past_due) pauses audits; paying again resumes them", async () => {
    const { store, stripe, deps, clock } = await activeWithOneAudit();
    stripe.set(monitoringSnapshot({ status: "past_due" }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_pd", "customer.subscription.updated"), deps);
    await runMonitoringSchedulerTick({ store, now: () => new Date(T0.getTime() + 31 * DAY), env: ENABLED });
    assert.equal(store.orders.length, 1, "paused while past_due");
    clock.now = new Date(T0.getTime() + 32 * DAY);
    stripe.set(monitoringSnapshot({ status: "active", currentPeriodEnd: new Date(T0.getTime() + 62 * DAY) }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_paid", "customer.subscription.updated"), deps);
    await runMonitoringSchedulerTick({ store, now: () => clock.now, env: ENABLED });
    assert.equal(store.orders.length, 2, "resumed after payment");
  });

  h.done();
})();
