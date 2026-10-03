/* eslint-disable no-console */
/**
 * scripts/test-monitoring-reactivation.ts — cancellation defaults to the
 * end of the paid period, access stays active until then and is read-only
 * after, and reactivation reconnects the new Stripe subscription to the SAME
 * record (history preserved) without ever resurrecting or overwriting state
 * from the superseded subscription.
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
import { monitoringAccess } from "../src/lib/monitoring/access";
import { billingActionsFor } from "../src/lib/monitoring/billing-actions";
import { buildMonitoringReactivationSessionParams } from "../src/lib/monitoring/checkout";
import type { ResolvedPlan } from "../src/lib/monitoring/plans";
import { MONITORING_PLANS } from "../src/lib/monitoring/plans";
import { canEditTracking } from "../src/lib/monitoring/tracking/service";
import { REACTIVATES_METADATA_KEY } from "../src/lib/monitoring/types";
import { handleMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-reactivation");
const PERIOD_END = new Date(T0.getTime() + 30 * DAY);

/** One record bought, then fully canceled (status canceled). */
async function canceledRecord() {
  const store = createFakeStore();
  const stripe = createFakeStripe();
  const clock = { now: T0 };
  const { deps, sentWelcome, linkedCustomers } = webhookDeps(store, stripe.gateway, clock);
  stripe.set(monitoringSnapshot());
  await handleMonitoringStripeEvent(checkoutEvent("evt_buy"), deps);
  const original = [...store.subs.values()][0]!;
  clock.now = new Date(PERIOD_END.getTime() + DAY);
  stripe.set(monitoringSnapshot({ status: "canceled", cancelAtPeriodEnd: true, canceledAt: T0, endedAt: PERIOD_END }));
  await handleMonitoringStripeEvent(subscriptionEvent("evt_end", "customer.subscription.deleted"), deps);
  return { store, stripe, clock, deps, sentWelcome, linkedCustomers, original };
}

(async () => {
  console.log("[monitoring-reactivation] running...");

  await h.check("cancellation is at period end: access + editing stay on until the paid-through date, then read-only", () => {
    const sub = { status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END };
    const before = new Date(PERIOD_END.getTime() - 1000);
    const after = new Date(PERIOD_END.getTime() + 1000);
    assert.equal(monitoringAccess(sub, before).schedulingEnabled, true);
    assert.equal(monitoringAccess(sub, before).label, "Active — cancels at period end");
    assert.equal(monitoringAccess(sub, after).schedulingEnabled, false);
    assert.equal(monitoringAccess(sub, after).label, "Canceled");
    const full = { ...monitoringSnapshot(), ...sub } as never;
    assert.equal(canEditTracking(full, before), true);
    assert.equal(canEditTracking(full, after), false, "read-only after the paid period");
  });

  await h.check("billing actions offered: cancel (active) → keep monitoring (pending) → reactivate (ended)", () => {
    const now = T0;
    assert.deepEqual(billingActionsFor({ status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: PERIOD_END }, now), {
      canCancel: true, canResume: false, canReactivate: false,
    });
    assert.deepEqual(billingActionsFor({ status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: PERIOD_END }, now), {
      canCancel: false, canResume: true, canReactivate: false,
    });
    assert.deepEqual(billingActionsFor({ status: "canceled", cancelAtPeriodEnd: false, currentPeriodEnd: PERIOD_END }, now), {
      canCancel: false, canResume: false, canReactivate: true,
    });
    assert.deepEqual(billingActionsFor({ status: "past_due", cancelAtPeriodEnd: false, currentPeriodEnd: PERIOD_END }, now), {
      canCancel: false, canResume: false, canReactivate: false,
    });
  });

  await h.check("the app's own cancel button always uses cancel_at_period_end (never immediate)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/monitoring/billing-actions.ts", "utf8");
    assert.match(src, /cancel_at_period_end: cancel/);
    assert.doesNotMatch(src, /subscriptions\.cancel\(|subscriptions\.del\(/);
  });

  await h.check("reactivation checkout: same record named in metadata, existing Stripe customer, subscription mode", () => {
    const plan = { ...MONITORING_PLANS[0]!, priceId: "price_monthly" } as ResolvedPlan;
    const p = buildMonitoringReactivationSessionParams({
      plan,
      sub: { id: "msub_1", websiteUrl: "https://rockroofing.example", email: "owner@rockroofing.example", businessName: "Rock Roofing", stripeCustomerId: "cus_123" },
      siteUrl: "https://preview.example",
    });
    assert.equal(p.mode, "subscription");
    assert.equal(p.customer, "cus_123");
    assert.equal(p.customer_email, undefined);
    assert.equal(p.metadata?.[REACTIVATES_METADATA_KEY], "msub_1");
    assert.equal(p.subscription_data?.metadata?.[REACTIVATES_METADATA_KEY], "msub_1");
    assert.equal(p.metadata?.geoviz_product, "monitoring");
    assert.ok(p.cancel_url?.startsWith("https://preview.example/monitoring/account/msub_1"));
  });

  await h.check("reactivation reconnects the new subscription to the SAME record (history kept) — explicit metadata", async () => {
    const r = await canceledRecord();
    r.stripe.set(monitoringSnapshot({ id: "sub_456", currentPeriodEnd: new Date(r.clock.now.getTime() + 30 * DAY), metadata: { ...monitoringSnapshot().metadata, [REACTIVATES_METADATA_KEY]: r.original.id } }));
    const res = await handleMonitoringStripeEvent(checkoutEvent("evt_re", "sub_456", "cs_test_re"), r.deps);
    assert.equal(res.outcome, "synced");
    assert.equal(r.store.subs.size, 1, "no second record");
    const sub = r.store.subs.get(r.original.id)!;
    assert.equal(sub.stripeSubscriptionId, "sub_456");
    assert.deepEqual(sub.priorStripeSubscriptionIds, ["sub_123"]);
    assert.equal(sub.status, "active");
    assert.equal(sub.accessToken, r.original.accessToken);
    assert.equal(sub.customerId, r.original.customerId, "same account");
    assert.equal(sub.businessId, r.original.businessId);
    assert.equal(sub.nextAuditAt?.getTime(), r.clock.now.getTime(), "monitoring resumes immediately");
    assert.equal(sub.stripeCheckoutSessionId, "cs_test_re");
    assert.equal(r.sentWelcome.length, 1, "no second welcome email");
  });

  await h.check("reactivation via a plain new purchase (same email + website) also reconnects", async () => {
    const r = await canceledRecord();
    r.stripe.set(monitoringSnapshot({ id: "sub_789", metadata: { ...monitoringSnapshot().metadata, websiteUrl: "https://www.RockRoofing.example/" } }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_c", "customer.subscription.created", "sub_789"), r.deps);
    assert.equal(r.store.subs.size, 1);
    assert.equal(r.store.subs.get(r.original.id)!.stripeSubscriptionId, "sub_789");
  });

  await h.check("late events for the superseded subscription are ignored (no resurrection, no overwrite)", async () => {
    const r = await canceledRecord();
    r.stripe.set(monitoringSnapshot({ id: "sub_456", metadata: { ...monitoringSnapshot().metadata, [REACTIVATES_METADATA_KEY]: r.original.id } }));
    await handleMonitoringStripeEvent(subscriptionEvent("evt_new", "customer.subscription.created", "sub_456"), r.deps);
    // A delayed update for the OLD subscription arrives afterwards.
    const late = await handleMonitoringStripeEvent(subscriptionEvent("evt_late", "customer.subscription.updated", "sub_123"), r.deps);
    assert.equal(late.outcome, "ignored");
    assert.equal(r.store.subs.size, 1);
    assert.equal(r.store.subs.get(r.original.id)!.status, "active", "old canceled status never overwrites");
  });

  await h.check("created + updated + checkout events for the new subscription in any order → one reattach", async () => {
    const r = await canceledRecord();
    r.stripe.set(monitoringSnapshot({ id: "sub_456", metadata: { ...monitoringSnapshot().metadata, [REACTIVATES_METADATA_KEY]: r.original.id } }));
    await Promise.all([
      handleMonitoringStripeEvent(subscriptionEvent("e1", "customer.subscription.updated", "sub_456"), r.deps),
      handleMonitoringStripeEvent(subscriptionEvent("e2", "customer.subscription.created", "sub_456"), r.deps),
      handleMonitoringStripeEvent(checkoutEvent("e3", "sub_456", "cs_x"), r.deps),
    ]);
    assert.equal(r.store.subs.size, 1);
    assert.deepEqual(r.store.subs.get(r.original.id)!.priorStripeSubscriptionIds, ["sub_123"]);
  });

  await h.check("an ACTIVE record is never taken over: a second paid purchase becomes a recorded duplicate, not a second record", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const { deps, sentWelcome } = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("a1"), deps);
    stripe.set(monitoringSnapshot({ id: "sub_2" }));
    const dup = await handleMonitoringStripeEvent(checkoutEvent("a2", "sub_2", "cs_2"), deps);
    assert.equal(dup.outcome, "duplicate_subscription");
    assert.equal(store.subs.size, 1);
    assert.equal([...store.subs.values()][0]!.stripeSubscriptionId, "sub_123", "live subscription untouched");
    assert.equal(store.duplicates.get("sub_2")?.monitoringSubscriptionId, [...store.subs.values()][0]!.id);
    assert.equal(sentWelcome.length, 1, "no welcome email for the duplicate");

    const r = await canceledRecord();
    r.stripe.set(monitoringSnapshot({ id: "sub_x", metadata: { ...monitoringSnapshot().metadata, email: "someone-else@example.com", [REACTIVATES_METADATA_KEY]: r.original.id } }));
    await handleMonitoringStripeEvent(subscriptionEvent("x1", "customer.subscription.created", "sub_x"), r.deps);
    r.stripe.set(monitoringSnapshot({ id: "sub_y", metadata: { ...monitoringSnapshot().metadata, websiteUrl: "https://other-site.example" } }));
    await handleMonitoringStripeEvent(subscriptionEvent("y1", "customer.subscription.created", "sub_y"), r.deps);
    assert.equal(r.store.subs.get(r.original.id)!.stripeSubscriptionId, "sub_123", "ended record untouched");
    assert.equal(r.store.subs.size, 3, "different buyer / different website → their own records");
  });

  await h.check("REGRESSION: two reactivations paid at once, events duplicated + out of order → one record, one live subscription, one duplicate", async () => {
    const r = await canceledRecord();
    const meta = { ...monitoringSnapshot().metadata, [REACTIVATES_METADATA_KEY]: r.original.id };
    r.stripe.set(monitoringSnapshot({ id: "sub_r1", currentPeriodEnd: new Date(r.clock.now.getTime() + 30 * DAY), metadata: meta }));
    r.stripe.set(monitoringSnapshot({ id: "sub_r2", currentPeriodEnd: new Date(r.clock.now.getTime() + 30 * DAY), metadata: meta }));
    const evts = [
      subscriptionEvent("r1_upd", "customer.subscription.updated", "sub_r1"),
      checkoutEvent("r2_chk", "sub_r2", "cs_r2"),
      subscriptionEvent("r1_cre", "customer.subscription.created", "sub_r1"),
      subscriptionEvent("r2_cre", "customer.subscription.created", "sub_r2"),
      checkoutEvent("r1_chk", "sub_r1", "cs_r1"),
      subscriptionEvent("r2_upd", "customer.subscription.updated", "sub_r2"),
    ];
    // Every event delivered twice, all at once.
    await Promise.all([...evts, ...evts.slice().reverse()].map((e) => handleMonitoringStripeEvent(e, r.deps)));

    assert.equal(r.store.subs.size, 1, "one business monitoring record");
    const rec = r.store.subs.get(r.original.id)!;
    assert.ok(["sub_r1", "sub_r2"].includes(rec.stripeSubscriptionId), "attached to one of the new subscriptions");
    assert.deepEqual(rec.priorStripeSubscriptionIds, ["sub_123"], "prior id recorded exactly once");
    assert.equal(rec.status, "active");
    assert.equal(rec.customerId, r.original.customerId, "one customer account");
    assert.equal(r.linkedCustomers.length, 1, "account linked once (at the original purchase)");
    const loser = rec.stripeSubscriptionId === "sub_r1" ? "sub_r2" : "sub_r1";
    assert.equal(r.store.duplicates.size, 1);
    assert.equal(r.store.duplicates.get(loser)?.monitoringSubscriptionId, rec.id);
    assert.equal(rec.stripeCheckoutSessionId, loser === "sub_r1" ? "cs_r2" : "cs_r1", "the duplicate's checkout never overwrites");
    for (const e of evts) assert.ok(r.store.events.get(e.id)?.processedAt, `${e.id} processed`);
    assert.equal(r.store.events.size, 2 + evts.length, "each event recorded once in the ledger");
    assert.equal(r.sentWelcome.length, 1, "no extra welcome email");
  });

  await h.check("REGRESSION: a second reactivation paid minutes later is also a duplicate, never a second record", async () => {
    const r = await canceledRecord();
    const meta = { ...monitoringSnapshot().metadata, [REACTIVATES_METADATA_KEY]: r.original.id };
    r.stripe.set(monitoringSnapshot({ id: "sub_r1", metadata: meta }));
    await handleMonitoringStripeEvent(subscriptionEvent("s1", "customer.subscription.created", "sub_r1"), r.deps);
    r.stripe.set(monitoringSnapshot({ id: "sub_r2", metadata: meta }));
    const out = await handleMonitoringStripeEvent(subscriptionEvent("s2", "customer.subscription.created", "sub_r2"), r.deps);
    assert.equal(out.outcome, "duplicate_subscription");
    assert.equal(r.store.subs.size, 1);
    assert.equal(r.store.subs.get(r.original.id)!.stripeSubscriptionId, "sub_r1");
    // Later lifecycle events of the duplicate only refresh its ledger row.
    r.stripe.set(monitoringSnapshot({ id: "sub_r2", status: "canceled", metadata: meta }));
    await handleMonitoringStripeEvent(subscriptionEvent("s3", "customer.subscription.deleted", "sub_r2"), r.deps);
    assert.equal(r.store.subs.size, 1);
    assert.equal(r.store.subs.get(r.original.id)!.status, "active", "duplicate's cancel never touches the record");
    assert.equal(r.store.duplicates.get("sub_r2")?.status, "canceled");
  });

  await h.check("REGRESSION: two first-time purchases for the same email + website at once → one record", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const { deps, sentWelcome } = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot({ id: "sub_f1" }));
    stripe.set(monitoringSnapshot({ id: "sub_f2" }));
    await Promise.all([
      handleMonitoringStripeEvent(checkoutEvent("f1", "sub_f1", "cs_f1"), deps),
      handleMonitoringStripeEvent(checkoutEvent("f2", "sub_f2", "cs_f2"), deps),
      handleMonitoringStripeEvent(subscriptionEvent("f1c", "customer.subscription.created", "sub_f1"), deps),
      handleMonitoringStripeEvent(subscriptionEvent("f2c", "customer.subscription.created", "sub_f2"), deps),
    ]);
    assert.equal(store.subs.size, 1);
    assert.equal(store.duplicates.size, 1);
    assert.equal(sentWelcome.length, 1);
  });

  await h.check("every new monitoring record is linked to a customer account exactly once", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const { deps, linkedCustomers } = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("l1"), deps);
    await handleMonitoringStripeEvent(subscriptionEvent("l2", "customer.subscription.updated"), deps);
    await handleMonitoringStripeEvent(subscriptionEvent("l3", "customer.subscription.updated"), deps);
    assert.equal(linkedCustomers.length, 1);
    assert.ok([...store.subs.values()][0]!.customerId);
  });

  h.done();
})();
