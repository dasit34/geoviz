/* eslint-disable no-console */
/**
 * scripts/test-monitoring-scheduler.ts — due selection, idempotent order
 * creation, cadence advancement, catch-up, throttling, and the flag.
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
  webhookDeps,
} from "./lib/monitoring-fakes";
import { nextAuditAfter, scheduledRunSessionId } from "../src/lib/monitoring/schedule";
import { runMonitoringSchedulerTick } from "../src/lib/monitoring/scheduler";
import { handleMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-scheduler");
const ENABLED = { GEO_MODULE_MONITORING_ENABLED: "true" };

async function subscribed(subscriptionId = "sub_123", clock = { now: T0 }) {
  const store = createFakeStore();
  const stripe = createFakeStripe();
  stripe.set(monitoringSnapshot({ id: subscriptionId }));
  const { deps } = webhookDeps(store, stripe.gateway, clock);
  await handleMonitoringStripeEvent(checkoutEvent(`evt_${subscriptionId}`, subscriptionId), deps);
  return { store, stripe, deps, clock };
}

(async () => {
  console.log("[monitoring-scheduler] running...");

  await h.check("flag off → tick does nothing", async () => {
    const { store } = await subscribed();
    const r = await runMonitoringSchedulerTick({ store, now: () => T0, env: {} });
    assert.equal(r.outcome, "disabled");
    assert.equal(store.orders.length, 0);
  });

  await h.check("due subscription → one queued re-audit; next audit moves one cadence later", async () => {
    const { store } = await subscribed();
    const r = await runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED });
    assert.equal(r.outcome, "ran");
    assert.equal(store.orders.length, 1);
    const sub = [...store.subs.values()][0]!;
    assert.equal(store.orders[0]!.stripeSessionId, scheduledRunSessionId(sub.id, T0));
    assert.equal(sub.nextAuditAt?.getTime(), T0.getTime() + 30 * DAY);
    assert.equal(sub.lastAuditQueuedAt?.getTime(), T0.getTime());
  });

  await h.check("re-running the tick before the next due date queues nothing", async () => {
    const { store } = await subscribed();
    await runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED });
    store.orders[0]!.reportStatus = "generated";
    await runMonitoringSchedulerTick({ store, now: () => new Date(T0.getTime() + 1000), env: ENABLED });
    assert.equal(store.orders.length, 1);
  });

  await h.check("concurrent ticks for the same due run create at most one order (deterministic session id)", async () => {
    const { store } = await subscribed();
    const [a, b] = await Promise.all([
      runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED }),
      runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED }),
    ]);
    assert.equal(store.orders.length, 1);
    const queued = [a, b].flatMap((r) => (r.outcome === "ran" ? r.queued : []));
    assert.equal(queued.length, 1);
  });

  await h.check("an audit still queued/running blocks the next one (no pile-up)", async () => {
    const { store } = await subscribed();
    await runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED });
    const later = new Date(T0.getTime() + 31 * DAY);
    const r = await runMonitoringSchedulerTick({ store, now: () => later, env: ENABLED });
    assert.equal(r.outcome === "ran" && r.skippedInFlight.length, 1);
    assert.equal(store.orders.length, 1);
  });

  await h.check("next cycle queues again once the previous audit completed", async () => {
    const { store } = await subscribed();
    await runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED });
    store.orders[0]!.reportStatus = "generated";
    const later = new Date(T0.getTime() + 30 * DAY);
    await runMonitoringSchedulerTick({ store, now: () => later, env: ENABLED });
    assert.equal(store.orders.length, 2);
  });

  await h.check("long scheduler outage → one catch-up audit, then cadence restarts from now", () => {
    const due = T0;
    const now = new Date(T0.getTime() + 95 * DAY);
    assert.equal(nextAuditAfter(due, 30, now).getTime(), now.getTime() + 30 * DAY);
    assert.equal(nextAuditAfter(due, 30, new Date(T0.getTime() + DAY)).getTime(), T0.getTime() + 30 * DAY);
  });

  await h.check("maxPerTick throttles how many audits one tick queues (protects the worker)", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const { deps } = webhookDeps(store, stripe.gateway, { now: T0 });
    for (const id of ["sub_a", "sub_b", "sub_c", "sub_d"]) {
      // Four different businesses (one record per email + website).
      stripe.set(monitoringSnapshot({ id, metadata: { ...monitoringSnapshot().metadata, websiteUrl: `https://${id}.example` } }));
      await handleMonitoringStripeEvent(checkoutEvent(`evt_${id}`, id), deps);
    }
    await runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED, maxPerTick: 2 });
    assert.equal(store.orders.length, 2);
    await runMonitoringSchedulerTick({ store, now: () => T0, env: ENABLED, maxPerTick: 2 });
    assert.equal(store.orders.length, 4);
  });

  h.done();
})();
