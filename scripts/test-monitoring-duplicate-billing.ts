/* eslint-disable no-console */
/**
 * scripts/test-monitoring-duplicate-billing.ts — defense in depth against
 * charging one business twice for monitoring:
 *  (1) prevention: purchase guard + atomic checkout lease + idempotency keys
 *  (2) compensation: duplicate subscription canceled + fully refunded +
 *      customer/admin notified exactly once; canonical never touched.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DAY,
  T0,
  checkoutEvent,
  createFakeLeaseStore,
  createFakeStore,
  createFakeStripe,
  harness,
  monitoringSnapshot,
  subscriptionEvent,
  webhookDeps,
} from "./lib/monitoring-fakes";
import {
  CHECKOUT_LEASE_TTL_MS,
  CHECKOUT_SESSION_TTL_MS,
  acquireCheckoutLease,
  createCheckoutUnderLease,
  leaseKeyFor,
} from "../src/lib/monitoring/checkout-lease";
import { buildCompensationEmail, compensateDuplicate } from "../src/lib/monitoring/duplicate-compensation";
import { purchaseDecision } from "../src/lib/monitoring/purchase-guard";
import { handleMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-duplicate-billing");
const EMAIL = "owner@rockroofing.example";
const SITE = "rockroofing.example";

/** Active canonical record (sub_123) + a paid duplicate (sub_dup) — compensation already ran via the webhook. */
async function withDuplicate() {
  const store = createFakeStore();
  const stripe = createFakeStripe();
  const clock = { now: T0 };
  const w = webhookDeps(store, stripe.gateway, clock);
  stripe.set(monitoringSnapshot());
  await handleMonitoringStripeEvent(checkoutEvent("buy"), w.deps);
  stripe.set(monitoringSnapshot({ id: "sub_dup" }));
  await handleMonitoringStripeEvent(checkoutEvent("dup_chk", "sub_dup", "cs_dup"), w.deps);
  return { store, stripe, clock, ...w, record: [...store.subs.values()][0]! };
}

(async () => {
  console.log("[monitoring-duplicate-billing] running...");

  // ── Prevention ───────────────────────────────────────────────────────────
  await h.check("purchase guard: live, canceling, payment-issue → manage from dashboard; ended → reactivate from dashboard; none → allowed", () => {
    assert.deepEqual(purchaseDecision(null, SITE), { allowed: true, siteKey: SITE });
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused"]) {
      const d = purchaseDecision({ status }, SITE);
      assert.equal(d.allowed, false, status);
      if (!d.allowed) assert.equal(d.reason, "already_monitored", status);
    }
    for (const status of ["canceled", "incomplete_expired"]) {
      const d = purchaseDecision({ status }, SITE);
      assert.equal(d.allowed, false);
      if (!d.allowed) assert.equal(d.reason, "reactivate_from_dashboard");
    }
  });

  await h.check("lease: 20 concurrent requests → exactly ONE Stripe Checkout session; everyone gets the same URL", async () => {
    const { store } = createFakeLeaseStore();
    let created = 0;
    const keys: string[] = [];
    const run = () =>
      createCheckoutUnderLease({
        email: EMAIL, siteKey: SITE, kind: "new", monitoringSubscriptionId: null,
        buildParams: () => ({ mode: "subscription", metadata: { geoviz_product: "monitoring" } }),
        createSession: async (_p, key) => {
          created += 1;
          keys.push(key);
          await new Promise((r) => setTimeout(r, 30));
          return { id: "cs_one", url: "https://checkout.stripe.test/cs_one" };
        },
        store, now: () => T0, waitMs: 2000,
      });
    const results = await Promise.all(Array.from({ length: 20 }, run));
    assert.equal(created, 1, "one session");
    assert.ok(results.every((r) => r.status !== "in_progress" && r.url === "https://checkout.stripe.test/cs_one"));
    assert.match(keys[0]!, new RegExp(`^geoviz-monitoring-checkout-new-${leaseKeyFor(EMAIL, SITE).slice(0, 32)}-1$`));
  });

  await h.check("lease: session expires with the lease (Stripe expires_at ≥ 30 min); lease metadata on the session", async () => {
    const { store } = createFakeLeaseStore();
    let params: Record<string, unknown> = {};
    await createCheckoutUnderLease({
      email: EMAIL, siteKey: SITE, kind: "reactivation", monitoringSubscriptionId: "msub_1",
      buildParams: () => ({ mode: "subscription", metadata: { a: "b" } }),
      createSession: async (p) => {
        params = p as Record<string, unknown>;
        return { id: "cs_1", url: "u1" };
      },
      store, now: () => T0,
    });
    assert.equal(params.expires_at, Math.floor((T0.getTime() + CHECKOUT_SESSION_TTL_MS) / 1000));
    assert.ok(CHECKOUT_SESSION_TTL_MS >= 30 * 60_000 && CHECKOUT_LEASE_TTL_MS > CHECKOUT_SESSION_TTL_MS);
    const md = params.metadata as Record<string, string>;
    assert.equal(md.a, "b");
    assert.equal(md.checkoutLeaseKey, leaseKeyFor(EMAIL, SITE));
    assert.equal(md.checkoutAttempt, "1");
  });

  await h.check("lease: open lease reused; after expiry/completion a NEW attempt (new idempotency key) is allowed", async () => {
    const { store, rows } = createFakeLeaseStore();
    const a1 = await acquireCheckoutLease({ email: EMAIL, siteKey: SITE, kind: "new", monitoringSubscriptionId: null }, store, T0);
    assert.equal(a1.status, "acquired");
    await store.attachSession(leaseKeyFor(EMAIL, SITE), 1, "cs_a", "url_a");
    assert.deepEqual(await acquireCheckoutLease({ email: EMAIL, siteKey: SITE, kind: "new", monitoringSubscriptionId: null }, store, new Date(T0.getTime() + 60_000)), { status: "reuse", url: "url_a" });
    const later = new Date(T0.getTime() + CHECKOUT_LEASE_TTL_MS + 1);
    const a2 = await acquireCheckoutLease({ email: EMAIL, siteKey: SITE, kind: "new", monitoringSubscriptionId: null }, store, later);
    assert.equal(a2.status, "acquired");
    if (a2.status === "acquired") assert.equal(a2.lease.attempt, 2);
    await store.attachSession(leaseKeyFor(EMAIL, SITE), 2, "cs_b", "url_b");
    await store.completeBySession("cs_b");
    assert.equal([...rows.values()][0]!.status, "completed");
    const a3 = await acquireCheckoutLease({ email: EMAIL, siteKey: SITE, kind: "reactivation", monitoringSubscriptionId: "m" }, store, later);
    assert.equal(a3.status, "acquired");
  });

  await h.check("lease: a Stripe error releases the lease (no stuck checkout); other businesses are independent", async () => {
    const { store } = createFakeLeaseStore();
    await assert.rejects(() =>
      createCheckoutUnderLease({
        email: EMAIL, siteKey: SITE, kind: "new", monitoringSubscriptionId: null,
        buildParams: () => ({ mode: "subscription" }),
        createSession: async () => {
          throw new Error("stripe down");
        },
        store, now: () => T0,
      }),
    );
    const again = await acquireCheckoutLease({ email: EMAIL, siteKey: SITE, kind: "new", monitoringSubscriptionId: null }, store, T0);
    assert.equal(again.status, "acquired");
    const other = await acquireCheckoutLease({ email: EMAIL, siteKey: "other-site.example", kind: "new", monitoringSubscriptionId: null }, store, T0);
    assert.equal(other.status, "acquired");
  });

  await h.check("routes: public checkout is guarded + leased; reactivation only from the signed-in dashboard, leased", () => {
    const pub = readFileSync("src/app/api/checkout/monitoring/route.ts", "utf8");
    assert.ok(pub.indexOf("checkNewPurchase(") > 0 && pub.indexOf("checkNewPurchase(") < pub.indexOf("createCheckoutUnderLease("));
    assert.match(pub, /status: 409/);
    assert.match(pub, /checkout\.sessions\.create\(params, \{ idempotencyKey \}\)/);
    const billing = readFileSync("src/lib/monitoring/billing-actions.ts", "utf8");
    assert.match(billing, /createCheckoutUnderLease\(/);
    assert.match(billing, /kind: "reactivation"/);
    const account = readFileSync("src/app/api/monitoring/account/route.ts", "utf8");
    assert.ok(account.indexOf("requireOwnedSubscription(") < account.indexOf("createReactivationCheckoutUrl("));
  });

  // ── Compensation ─────────────────────────────────────────────────────────
  await h.check("duplicate: canceled once, fully refunded once, customer + admin notified once; canonical untouched", async () => {
    const t = await withDuplicate();
    assert.equal(t.store.subs.size, 1);
    assert.deepEqual(t.billing.cancels, ["sub_dup"]);
    assert.equal(t.billing.refunds.length, 1);
    assert.equal(t.billing.refunds[0]!.paymentIntentId, "pi_sub_dup");
    assert.equal(t.billing.refunds[0]!.amount, 9900);
    const d = t.store.duplicates.get("sub_dup")!;
    assert.ok(d.compensatedAt && d.canceledInStripeAt);
    assert.equal(d.refundStatus, "refunded");
    assert.equal(d.refundedAmount, 9900);
    assert.deepEqual(t.notices.map((n) => n.to).sort(), ["admin", "customer"]);
    assert.ok(!t.billing.cancels.includes("sub_123") && !t.billing.refunds.some((r) => r.paymentIntentId === "pi_sub_123"));
    assert.deepEqual(d.history.map((x) => x.action), ["canceled_duplicate_subscription", "refunded", "customer_notified", "admin_notified", "compensated"]);
  });

  await h.check("duplicate + out-of-order redeliveries (incl. the duplicate's own cancel event) → no extra refund, cancel, or notice", async () => {
    const t = await withDuplicate();
    t.stripe.set(monitoringSnapshot({ id: "sub_dup", status: "canceled" }));
    await Promise.all([
      handleMonitoringStripeEvent(subscriptionEvent("d1", "customer.subscription.deleted", "sub_dup"), t.deps),
      handleMonitoringStripeEvent(subscriptionEvent("d2", "customer.subscription.updated", "sub_dup"), t.deps),
      handleMonitoringStripeEvent(checkoutEvent("dup_chk", "sub_dup", "cs_dup"), t.deps), // exact redelivery
      handleMonitoringStripeEvent(subscriptionEvent("d3", "customer.subscription.created", "sub_dup"), t.deps),
    ]);
    assert.equal(t.billing.cancels.length, 1);
    assert.equal(t.billing.refunds.length, 1);
    assert.equal(t.notices.length, 2);
    assert.equal(t.store.duplicates.get("sub_dup")!.status, "canceled");
  });

  await h.check("concurrent compensation runs for the same duplicate → one cancel, one refund, two notices", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const w = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    stripe.set(monitoringSnapshot({ id: "sub_dup" }));
    await handleMonitoringStripeEvent(checkoutEvent("a"), w.deps);
    await Promise.all(Array.from({ length: 6 }, (_, i) => handleMonitoringStripeEvent(subscriptionEvent(`c${i}`, "customer.subscription.updated", "sub_dup"), w.deps)));
    assert.equal(w.billing.cancels.length, 1);
    assert.equal(w.billing.refunds.length, 1);
    assert.equal(w.notices.length, 2);
  });

  await h.check("failure mid-way (refund API error) → webhook fails (Stripe retries) → retry completes with exactly one refund", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const w = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("a"), w.deps);
    stripe.set(monitoringSnapshot({ id: "sub_dup" }));
    w.billing.failRefundOnce();
    await assert.rejects(() => handleMonitoringStripeEvent(checkoutEvent("dup", "sub_dup", "cs_dup"), w.deps));
    const d = store.duplicates.get("sub_dup")!;
    assert.equal(d.compensatedAt, null);
    assert.equal(d.claimedAt, null, "claim released for the retry");
    assert.match(d.lastError ?? "", /temporary failure/);
    // Stripe redelivers the same event.
    await handleMonitoringStripeEvent(checkoutEvent("dup", "sub_dup", "cs_dup"), w.deps);
    assert.equal(w.billing.cancels.length, 1, "cancel not repeated (already canceled in Stripe)");
    assert.equal(w.billing.refunds.length, 1);
    assert.equal(w.notices.length, 2);
    assert.ok(store.duplicates.get("sub_dup")!.compensatedAt);
  });

  await h.check("partial out-of-band refund → only the remainder is refunded; zero-amount → nothing_to_refund", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const w = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("a"), w.deps);
    w.billing.refunds.push({ id: "re_manual", paymentIntentId: "pi_sub_dup", amount: 2000, key: "manual" });
    stripe.set(monitoringSnapshot({ id: "sub_dup" }));
    await handleMonitoringStripeEvent(checkoutEvent("dup", "sub_dup", "cs_dup"), w.deps);
    assert.equal(w.billing.refunds.filter((r) => r.key !== "manual").map((r) => r.amount).join(), "7900");
    assert.equal(store.duplicates.get("sub_dup")!.refundedAmount, 9900, "fully refunded in total");

    w.billing.invoices.set("sub_free", [{ invoiceId: "in_free", paymentIntentId: null, amountPaid: 0, currency: "usd" }]);
    stripe.set(monitoringSnapshot({ id: "sub_free" }));
    await handleMonitoringStripeEvent(checkoutEvent("free", "sub_free", "cs_free"), w.deps);
    assert.equal(store.duplicates.get("sub_free")!.refundStatus, "nothing_to_refund");
  });

  await h.check("ambiguous payment (paid invoice without a PaymentIntent) is NOT guessed → needs_manual_refund", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const w = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("a"), w.deps);
    w.billing.invoices.set("sub_dup", [{ invoiceId: "in_credit", paymentIntentId: null, amountPaid: 9900, currency: "usd" }]);
    stripe.set(monitoringSnapshot({ id: "sub_dup" }));
    await handleMonitoringStripeEvent(checkoutEvent("dup", "sub_dup", "cs_dup"), w.deps);
    assert.equal(w.billing.refunds.length, 0);
    assert.equal(store.duplicates.get("sub_dup")!.refundStatus, "needs_manual_refund");
    assert.equal(w.billing.cancels.length, 1, "still canceled so it can't bill again");
  });

  await h.check("SAFETY: compensation aborts if the subscription is the record's current or prior subscription", async () => {
    const t = await withDuplicate();
    // Corrupt the ledger to point at the canonical subscription itself.
    t.store.duplicates.set("sub_123", { ...t.store.duplicates.get("sub_dup")!, id: "dup_bad", stripeSubscriptionId: "sub_123", compensatedAt: null, claimedAt: null, history: [] });
    const r = await compensateDuplicate("sub_123", { ledger: t.ledger, billing: t.billing.gateway, adminEmail: null, now: () => T0, notify: async () => undefined });
    assert.equal(r.outcome, "aborted");
    assert.ok(!t.billing.cancels.includes("sub_123"));
    assert.ok(!t.billing.refunds.some((x) => x.paymentIntentId === "pi_sub_123"));
  });

  await h.check("operator-resolved duplicates are never auto-compensated", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const w = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("a"), w.deps);
    await store.recordDuplicateSubscription({ stripeSubscriptionId: "sub_old_dup", monitoringSubscriptionId: [...store.subs.values()][0]!.id, stripeCustomerId: null, status: "canceled", now: T0 });
    store.duplicates.get("sub_old_dup")!.resolvedAt = T0;
    const r = await compensateDuplicate("sub_old_dup", { ledger: w.ledger, billing: w.billing.gateway, adminEmail: null, now: () => T0, notify: async () => undefined });
    assert.equal(r.outcome, "skipped");
    assert.equal(w.billing.refunds.length, 0);
  });

  await h.check("normal renewals and period-end cancellation of the canonical subscription never compensate", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const clock = { now: T0 };
    const w = webhookDeps(store, stripe.gateway, clock);
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("a"), w.deps);
    clock.now = new Date(T0.getTime() + 31 * DAY);
    stripe.set(monitoringSnapshot({ currentPeriodEnd: new Date(T0.getTime() + 61 * DAY) })); // renewal
    await handleMonitoringStripeEvent(subscriptionEvent("renew", "customer.subscription.updated"), w.deps);
    stripe.set(monitoringSnapshot({ cancelAtPeriodEnd: true, currentPeriodEnd: new Date(T0.getTime() + 61 * DAY) }));
    await handleMonitoringStripeEvent(subscriptionEvent("cape", "customer.subscription.updated"), w.deps);
    stripe.set(monitoringSnapshot({ status: "canceled", endedAt: new Date(T0.getTime() + 61 * DAY) }));
    await handleMonitoringStripeEvent(subscriptionEvent("end", "customer.subscription.deleted"), w.deps);
    assert.equal(w.billing.cancels.length + w.billing.refunds.length + w.notices.length, 0);
    assert.equal(store.duplicates.size, 0);
    assert.equal([...store.subs.values()][0]!.status, "canceled");
  });

  await h.check("legitimate reactivation after the subscription expired still works (no compensation)", async () => {
    const store = createFakeStore();
    const stripe = createFakeStripe();
    const w = webhookDeps(store, stripe.gateway, { now: T0 });
    stripe.set(monitoringSnapshot());
    await handleMonitoringStripeEvent(checkoutEvent("a"), w.deps);
    stripe.set(monitoringSnapshot({ status: "canceled" }));
    await handleMonitoringStripeEvent(subscriptionEvent("end", "customer.subscription.deleted"), w.deps);
    stripe.set(monitoringSnapshot({ id: "sub_new" }));
    const r = await handleMonitoringStripeEvent(checkoutEvent("re", "sub_new", "cs_new"), w.deps);
    assert.equal(r.outcome, "synced");
    assert.equal([...store.subs.values()][0]!.stripeSubscriptionId, "sub_new");
    assert.equal(w.billing.cancels.length + w.billing.refunds.length, 0);
    assert.deepEqual(w.completedLeases, ["cs_test_123", "cs_new"], "checkout leases closed on completion");
  });

  await h.check("notices: amount + reference, no credentials/links with tokens", () => {
    const n = { to: "customer" as const, email: "a@b.c", websiteUrl: "https://x.example", businessName: "X", recordId: "m1", canonicalSubscriptionId: "sub_1", duplicateSubscriptionId: "sub_2", refundedAmount: 9900, currency: "usd", refundStatus: "refunded" };
    const c = buildCompensationEmail(n, "https://app.example/monitoring/sign-in");
    assert.match(c.text, /refunded 99\.00 USD/);
    assert.match(c.text, /sub_2/);
    assert.doesNotMatch(c.text, /#t=|verify|token|secret|sk_|whsec_/i);
    const a = buildCompensationEmail({ ...n, to: "admin" }, "x");
    assert.match(a.text, /sub_1 \(untouched\)/);
    assert.match(a.text, /sub_2 \(canceled\)/);
  });

  h.done();
})();
