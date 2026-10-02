/* eslint-disable no-console */
/**
 * scripts/test-tracking-cycle.ts — idempotent cycles: duplicate-run
 * prevention, no double provider charges, resume after crash, snapshot
 * stability, NOT_MEASURED handling, scheduler integration, cancellation,
 * and tokenized-access rules.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { T0, checkoutEvent, createFakeStore, createFakeStripe, harness, monitoringSnapshot, subscriptionEvent, webhookDeps } from "./lib/monitoring-fakes";
import { createFakeRunner, createFakeTrackingStore } from "./lib/tracking-fakes";
import { monitoringAccess } from "../src/lib/monitoring/access";
import { runMonitoringSchedulerTick } from "../src/lib/monitoring/scheduler";
import { STALE_CLAIM_MS, runMonitoringCycle } from "../src/lib/monitoring/tracking/cycle";
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

function run(store: ReturnType<typeof createFakeTrackingStore>["store"], runner: Parameters<typeof runMonitoringCycle>[0]["runner"], over: Partial<Parameters<typeof runMonitoringCycle>[0]> = {}) {
  return runMonitoringCycle({
    store, runner, subject, activePrompts: PROMPTS, activeCompetitors: COMPS, providers: PROVIDERS,
    cycleKey: "2026-10-01T12:00:00.000Z", trigger: "scheduler", now: () => T0, ...over,
  });
}

(async () => {
  console.log("[tracking-cycle] running...");

  await h.check("one cycle = one call per (question, AI system); metrics stored with the cycle", async () => {
    const { store, cycles } = createFakeTrackingStore(PROMPTS);
    const { runner, calls } = createFakeRunner((p) => p === "openai"
      ? { answerText: "Rock Roofing and Acme Roofing are good.", namedBusinesses: ["Rock Roofing", "Acme Roofing"], nativeCitationUrls: ["https://yelp.com/x"] }
      : { answerText: "Try Acme Roofing.", namedBusinesses: ["Acme Roofing"], nativeCitationUrls: ["https://acmeroof.com"] });
    const r = await run(store, runner);
    assert.equal(calls.length, 4);
    assert.equal(r.outcome, "ran");
    if (r.outcome === "ran") {
      assert.equal(r.status, "completed");
      assert.equal(r.metrics?.mentionRate, 0.5);
      assert.equal(r.metrics?.shareOfVoice, 2 / 6);
    }
    assert.equal([...cycles.values()][0]?.status, "completed");
  });

  await h.check("re-running the same cycle makes NO provider calls (completed cycles never re-run)", async () => {
    const { store } = createFakeTrackingStore(PROMPTS);
    const { runner, calls } = createFakeRunner(() => ({ answerText: "x" }));
    await run(store, runner);
    const again = await run(store, runner);
    assert.equal(again.outcome, "already_completed");
    assert.equal(calls.length, 4);
  });

  await h.check("concurrent triggers of one cycle never pay twice for the same answer", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    const { runner, calls } = createFakeRunner(() => ({ answerText: "x" }));
    await Promise.all([run(store, runner), run(store, runner), run(store, runner)]);
    assert.equal(calls.length, 4);
    assert.equal(rows.length, 4);
  });

  await h.check("crash mid-cycle → resume calls only the missing answers; stale claims re-claimed after 15 min", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    let crashAt = 3;
    const { runner, calls } = createFakeRunner(() => {
      if (--crashAt === 0) throw new Error("process killed");
      return { answerText: "x" };
    });
    await assert.rejects(() => run(store, runner));
    const answeredBefore = calls.length;
    // One claim is now orphaned in "pending". Too soon → in progress elsewhere, nothing re-called.
    const early = await run(store, createFakeRunner(() => ({ answerText: "y" })).runner, { now: () => new Date(T0.getTime() + 60_000) });
    assert.equal(early.outcome === "ran" && early.status, "running");
    // After the stale window, the orphan is re-claimed; completed answers are not re-paid.
    const second = createFakeRunner(() => ({ answerText: "y" }));
    const later = await run(store, second.runner, { now: () => new Date(T0.getTime() + STALE_CLAIM_MS + 120_000) });
    assert.equal(later.outcome === "ran" && later.status, "completed");
    assert.equal(rows.length, 4);
    assert.ok(answeredBefore + second.calls.length <= 5, `paid calls ${answeredBefore}+${second.calls.length}`);
    assert.ok(second.calls.length >= 1 && second.calls.length <= 2);
  });

  await h.check("cycle snapshot: editing questions/competitors mid-cycle doesn't change what the cycle measures", async () => {
    const { store } = createFakeTrackingStore([...PROMPTS, { id: "p3", text: "a newly added question here" }]);
    const first = createFakeRunner(() => ({ fail: "provider down" }));
    // First run finishes (all answers recorded). A later trigger with an extra question must not reopen it.
    await run(store, first.runner, { activePrompts: PROMPTS });
    const second = createFakeRunner(() => ({ answerText: "x" }));
    const r = await run(store, second.runner, { activePrompts: [...PROMPTS, { id: "p3" }] });
    assert.equal(r.outcome, "already_completed");
    assert.equal(second.calls.length, 0);
  });

  await h.check("all providers failed → cycle 'failed', rates null — never a zero score", async () => {
    const { store } = createFakeTrackingStore(PROMPTS);
    const { runner } = createFakeRunner(() => ({ fail: "HTTP 503" }));
    const r = await run(store, runner);
    assert.equal(r.outcome === "ran" && r.status, "failed");
    if (r.outcome === "ran") {
      assert.equal(r.metrics?.measured, 0);
      assert.equal(r.metrics?.mentionRate, null);
      assert.equal(r.metrics?.shareOfVoice, null);
    }
  });

  await h.check("some providers failed → 'partial'; failed answers stay NOT_MEASURED (no automatic paid retry)", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    const { runner, calls } = createFakeRunner((p) => (p === "perplexity" ? { fail: "timeout" } : { answerText: "Rock Roofing" }));
    const r = await run(store, runner);
    assert.equal(r.outcome === "ran" && r.status, "partial");
    assert.equal(rows.filter((x) => x.status === "not_measured").length, 2);
    await run(store, runner);
    assert.equal(calls.length, 4, "no re-charge for failed answers within the same cycle");
  });

  await h.check("no tracked questions or no entitled providers → skipped, no calls", async () => {
    const { store } = createFakeTrackingStore(PROMPTS);
    const { runner, calls } = createFakeRunner(() => ({ answerText: "x" }));
    assert.equal((await run(store, runner, { activePrompts: [] })).outcome, "skipped");
    assert.equal((await run(store, runner, { providers: [] })).outcome, "skipped");
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
