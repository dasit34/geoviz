/* eslint-disable no-console */
/**
 * scripts/test-tracking-cycle.ts — cycle skipping, scheduler integration,
 * and cancellation. (Call-state recovery: test-tracking-call-states.ts.)
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { T0, checkoutEvent, createFakeStore, createFakeStripe, harness, monitoringSnapshot, subscriptionEvent, webhookDeps } from "./lib/monitoring-fakes";
import { createFakeClient, createFakeTrackingStore } from "./lib/tracking-fakes";
import { monitoringAccess } from "../src/lib/monitoring/access";
import { runMonitoringSchedulerTick } from "../src/lib/monitoring/scheduler";
import { runMonitoringCycle } from "../src/lib/monitoring/tracking/cycle";
import type { CompetitorRef } from "../src/lib/monitoring/tracking/types";
import { handleMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("tracking-cycle");
const PROMPTS = [
  { id: "p1", text: "Who is the best roofer in Toledo?" },
  { id: "p2", text: "Which roofing company should I hire for a leak?" },
];
const PROVIDERS = ["openai", "perplexity"] as const;
const COMPS: CompetitorRef[] = [{ id: "c1", name: "Acme Roofing", normalizedName: "acme roofing", domain: "acmeroof.com" }];
const subject = { subscriptionId: "msub_1", businessName: "Rock Roofing", websiteUrl: "https://rockroofing.com", customerDomain: "rockroofing.com" };

function run(store: ReturnType<typeof createFakeTrackingStore>["store"], client: Parameters<typeof runMonitoringCycle>[0]["client"], over: Partial<Parameters<typeof runMonitoringCycle>[0]> = {}) {
  return runMonitoringCycle({
    store, client, subject, activePrompts: PROMPTS, activeCompetitors: COMPS, providers: PROVIDERS, samplesPerPrompt: 1,
    cycleKey: "2026-10-01T12:00:00.000Z", trigger: "scheduler", now: () => T0, ...over,
  });
}

(async () => {
  console.log("[tracking-cycle] running...");

  await h.check("no tracked questions or no entitled providers → skipped, no calls", async () => {
    const { store } = createFakeTrackingStore(PROMPTS);
    const { client, calls } = createFakeClient(() => ({ text: "x" }));
    assert.equal((await run(store, client, { activePrompts: [] })).outcome, "skipped");
    assert.equal((await run(store, client, { providers: [] })).outcome, "skipped");
    assert.equal(calls.length, 0);
  });

  await h.check("scheduler runs tracking once per due subscription with the re-audit's due date as cycle key", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("evt_s"), webhookDeps(store, stripe.gateway, { now: T0 }).deps);
    const keys: string[] = [];
    const env = { GEO_MODULE_MONITORING_ENABLED: "true" };
    await runMonitoringSchedulerTick({ store, now: () => T0, env, runTrackingCycle: async (_s, k) => void keys.push(k) });
    assert.deepEqual(keys, [T0.toISOString()]);
    await runMonitoringSchedulerTick({ store, now: () => T0, env, runTrackingCycle: async (_s, k) => void keys.push(k) });
    assert.equal(keys.length, 1, "not due again → no second cycle");
  });

  await h.check("a tracking failure never blocks the re-audit schedule", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("evt_t"), webhookDeps(store, stripe.gateway, { now: T0 }).deps);
    const r = await runMonitoringSchedulerTick({
      store, now: () => T0, env: { GEO_MODULE_MONITORING_ENABLED: "true" },
      runTrackingCycle: async () => { throw new Error("providers down"); },
    });
    assert.equal(r.outcome === "ran" && r.trackingErrors.length, 1);
    assert.equal(store.orders.length, 1, "re-audit still queued");
    assert.ok([...store.subs.values()][0]!.nextAuditAt! > T0, "schedule still advanced");
  });

  await h.check("cancellation: no tracking cycles after cancel; tracking becomes read-only", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    stripe.set(monitoringSnapshot());
    const { deps } = webhookDeps(store, stripe.gateway, { now: T0 });
    await handleMonitoringStripeEvent(checkoutEvent("evt_c"), deps);
    stripe.set(monitoringSnapshot({ status: "canceled", canceledAt: T0, endedAt: T0 }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_d", "customer.subscription.deleted"), deps);
    let ran = 0;
    await runMonitoringSchedulerTick({ store, now: () => new Date(T0.getTime() + 40 * 86_400_000), env: { GEO_MODULE_MONITORING_ENABLED: "true" }, runTrackingCycle: async () => void ran++ });
    assert.equal(ran, 0);
    const sub = [...store.subs.values()][0]!;
    assert.equal(monitoringAccess(sub, T0).schedulingEnabled, false, "editing (canEditTracking) follows schedulingEnabled");
  });

  h.done();
})();
