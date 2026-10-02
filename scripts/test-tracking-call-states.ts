/* eslint-disable no-console */
/**
 * scripts/test-tracking-call-states.ts — provider-call recovery semantics.
 * Guarantee under test: at most ONE automatic provider request per sample;
 * unknown outcomes are flagged for review, never silently re-issued.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { T0, harness } from "./lib/monitoring-fakes";
import { createFakeClient, createFakeTrackingStore } from "./lib/tracking-fakes";
import { STALE_CLAIM_MS, runMonitoringCycle } from "../src/lib/monitoring/tracking/cycle";
import type { TrackingProvider } from "../src/lib/monitoring/tracking/types";

const h = harness("tracking-call-states");
const subject = { subscriptionId: "msub_1", businessName: "Rock Roofing", websiteUrl: "https://rockroofing.com", customerDomain: "rockroofing.com" };
const PROMPTS = [{ id: "p1", text: "Who is the best roofer in Toledo?" }];
const later = (ms: number) => () => new Date(T0.getTime() + ms);

function run(store: ReturnType<typeof createFakeTrackingStore>["store"], client: ReturnType<typeof createFakeClient>["client"], over: { providers?: TrackingProvider[]; now?: () => Date; retryUnknown?: boolean } = {}) {
  return runMonitoringCycle({
    store, client, subject, activePrompts: [{ id: "p1" }], activeCompetitors: [], providers: over.providers ?? ["claude"],
    samplesPerPrompt: 1, cycleKey: "k1", trigger: "manual", now: over.now ?? (() => T0), retryUnknown: over.retryUnknown,
  });
}

(async () => {
  console.log("[tracking-call-states] running...");

  await h.check("completed cycle rerun → 0 provider calls", async () => {
    const { store } = createFakeTrackingStore(PROMPTS);
    const { client, calls } = createFakeClient(() => ({ text: "Rock Roofing" }));
    await run(store, client);
    const again = await run(store, client);
    assert.equal(again.outcome, "already_completed");
    assert.equal(calls.length, 1);
  });

  await h.check("crash AFTER the request was sent (no retrieval) → sample becomes UNKNOWN, never re-called", async () => {
    const { store, rows, cycles } = createFakeTrackingStore(PROMPTS);
    const first = createFakeClient(() => ({ crash: true }));
    await assert.rejects(() => run(store, first.client));
    assert.equal(rows[0]!.callStateNow, "in_flight");
    const second = createFakeClient(() => ({ text: "would be a second paid call" }));
    const early = await run(store, second.client, { now: later(60_000) });
    assert.equal(early.outcome === "ran" && early.status, "running", "still within the stale window → treated as in progress");
    const res = await run(store, second.client, { now: later(STALE_CLAIM_MS + 60_000) });
    assert.equal(second.calls.length, 0, "no automatic second request");
    assert.equal(rows[0]!.callStateNow, "unknown");
    assert.equal(res.outcome === "ran" && res.status, "needs_review");
    assert.equal([...cycles.values()][0]!.unknownOutcomes, 1);
  });

  await h.check("crash BEFORE any request was sent (stale pending) → safe to re-claim and call once", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    // Simulate a worker that claimed then died before markInFlight.
    await store.getOrCreateCycle({ subscriptionId: "msub_1", cycleKey: "k1", trigger: "manual", promptIds: ["p1"], providers: ["claude"], competitors: [], samplesPerPrompt: 1, now: T0 });
    const cyc = (await store.getOrCreateCycle({ subscriptionId: "msub_1", cycleKey: "k1", trigger: "manual", promptIds: ["p1"], providers: ["claude"], competitors: [], samplesPerPrompt: 1, now: T0 })).cycle;
    await store.claimSample({ cycleId: cyc.id, trackedPromptId: "p1", provider: "claude", sampleIndex: 0, subscriptionId: "msub_1", now: T0, staleBefore: new Date(0), retryUnknown: false });
    assert.equal(rows[0]!.callStateNow, "pending");
    const { client, calls } = createFakeClient(() => ({ text: "Rock Roofing is good" }));
    const res = await run(store, client, { now: later(STALE_CLAIM_MS + 1000) });
    assert.equal(calls.length, 1);
    assert.equal(res.outcome === "ran" && res.status, "completed");
  });

  await h.check("timeout reported by the provider adapter → UNKNOWN (may be billed), cycle needs_review", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    const { client, calls } = createFakeClient(() => ({ fail: "unknown", message: "timeout" }));
    const res = await run(store, client);
    assert.equal(rows[0]!.callStateNow, "unknown");
    assert.equal(res.outcome === "ran" && res.status, "needs_review");
    await run(store, client);
    assert.equal(calls.length, 1, "needs_review cycle is not re-run automatically");
  });

  await h.check("definite provider error → FAILED (known outcome), not re-called, cycle failed", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    const { client, calls } = createFakeClient(() => ({ fail: "failed", message: "HTTP 400" }));
    const res = await run(store, client);
    assert.equal(rows[0]!.callStateNow, "failed");
    assert.equal(res.outcome === "ran" && res.status, "failed");
    await run(store, client);
    assert.equal(calls.length, 1);
  });

  await h.check("retrieval-capable provider: crash mid-request → resume RETRIEVES by request id, no second paid call", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    const first = createFakeClient(() => ({ crash: true }), { retrievable: ["openai"] });
    await assert.rejects(() => run(store, first.client, { providers: ["openai"] }));
    assert.equal(rows[0]!.providerRequestId, "req_1", "request id persisted before waiting");
    // A fresh process: its client can retrieve req_1 from the provider.
    const resumed = createFakeClient(() => ({ text: "should not be called" }), { retrievable: ["openai"] });
    (resumed.client as unknown as { retrieve: typeof first.client.retrieve }).retrieve = first.client.retrieve;
    const res = await run(store, resumed.client, { providers: ["openai"], now: later(STALE_CLAIM_MS + 1000) });
    assert.equal(resumed.calls.length, 0);
    assert.deepEqual(first.retrievals, ["req_1"]);
    assert.equal(rows[0]!.callStateNow, "completed");
    assert.equal(res.outcome === "ran" && res.status, "completed");
  });

  await h.check("provider still working (background) → stays in_flight; later retrieval completes it", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    const fc = createFakeClient(() => ({ stillRunning: true }), { retrievable: ["openai"] });
    const r1 = await run(store, fc.client, { providers: ["openai"] });
    assert.equal(r1.outcome === "ran" && r1.status, "running");
    assert.equal(rows[0]!.callStateNow, "in_flight");
    const r2 = await run(store, fc.client, { providers: ["openai"], now: later(STALE_CLAIM_MS + 1000) });
    assert.equal(fc.calls.length, 1);
    assert.equal(r2.outcome === "ran" && r2.status, "completed");
  });

  await h.check("operator retry of UNKNOWN samples is explicit and re-issues exactly those samples", async () => {
    const { store, rows } = createFakeTrackingStore(PROMPTS);
    await run(store, createFakeClient(() => ({ fail: "unknown" })).client);
    assert.equal(rows[0]!.callStateNow, "unknown");
    const retry = createFakeClient(() => ({ text: "Rock Roofing" }));
    const res = await run(store, retry.client, { retryUnknown: true });
    assert.equal(retry.calls.length, 1);
    assert.equal(res.outcome === "ran" && res.status, "completed");
  });

  await h.check("concurrent triggers never send two requests for one sample", async () => {
    const { store } = createFakeTrackingStore(PROMPTS);
    const { client, calls } = createFakeClient(() => ({ text: "x" }));
    await Promise.all([run(store, client), run(store, client), run(store, client)]);
    assert.equal(calls.length, 1);
  });

  h.done();
})();
