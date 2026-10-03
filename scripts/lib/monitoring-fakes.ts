/**
 * In-memory fakes for the monitoring module tests. They enforce the same
 * invariants the Prisma schema does (unique stripeSubscriptionId, unique
 * AuditOrder.stripeSessionId, atomic welcome-email claim, event ledger)
 * so idempotency behaviour is exercised without a database.
 */
import {
  DuplicateBusinessRecordError,
  DuplicateSubscriptionError,
  type MonitoringStore,
  type MonitoringSubscriptionRecord,
  type StripeSubscriptionGateway,
  type SubscriptionSnapshot,
} from "../../src/lib/monitoring/types";
import {
  compensateDuplicate,
  type CompensationNotice,
  type DuplicateBillingGateway,
  type DuplicateLedgerStore,
  type HistoryEntry,
} from "../../src/lib/monitoring/duplicate-compensation";
import type { WebhookDeps } from "../../src/lib/monitoring/webhook";

export type FakeOrder = {
  id: string;
  subscriptionId: string;
  stripeSessionId: string;
  reportStatus: string;
  queuedAt: Date;
};

export type FakeDuplicate = {
  id: string;
  stripeSubscriptionId: string;
  monitoringSubscriptionId: string;
  stripeCustomerId: string | null;
  status: string;
  events: number;
  resolvedAt: Date | null;
  claimedAt: Date | null;
  canceledInStripeAt: Date | null;
  compensatedAt: Date | null;
  refundStatus: string;
  refundedAmount: number;
  refundIds: string[];
  customerNotifiedAt: Date | null;
  adminNotifiedAt: Date | null;
  lastError: string | null;
  history: HistoryEntry[];
};

export type FakeStore = MonitoringStore & {
  subs: Map<string, MonitoringSubscriptionRecord>;
  duplicates: Map<string, FakeDuplicate>;
  orders: FakeOrder[];
  events: Map<string, { type: string; processedAt: Date | null; attempts: number; lastError: string | null }>;
};

export function createFakeStore(): FakeStore {
  const subs = new Map<string, MonitoringSubscriptionRecord>();
  const orders: FakeOrder[] = [];
  const events = new Map<string, { type: string; processedAt: Date | null; attempts: number; lastError: string | null }>();
  const duplicates = new Map<string, FakeDuplicate>();
  let seq = 0;
  // Mirrors the (email, siteKey) unique index (NULL siteKeys never collide).
  const bySiteKey = (email: string, siteKey: string | null) =>
    siteKey === null ? null : [...subs.values()].find((s) => s.email === email && s.siteKey === siteKey) ?? null;
  const byStripeId = (sid: string) => [...subs.values()].find((s) => s.stripeSubscriptionId === sid) ?? null;
  const mustGet = (id: string) => {
    const s = subs.get(id);
    if (!s) throw new Error(`no sub ${id}`);
    return s;
  };

  return {
    subs,
    orders,
    events,
    duplicates,
    async findBySiteKey(email, siteKey) {
      const s = bySiteKey(email, siteKey);
      return s ? { ...s } : null;
    },
    async claimSiteKey(id, siteKey) {
      const s = subs.get(id);
      if (!s || s.siteKey !== null || bySiteKey(s.email, siteKey)) return false;
      subs.set(id, { ...s, siteKey });
      return true;
    },
    async recordDuplicateSubscription({ stripeSubscriptionId, monitoringSubscriptionId, stripeCustomerId, status }) {
      const d = duplicates.get(stripeSubscriptionId);
      if (d) {
        d.status = status;
        d.events += 1;
      } else
        duplicates.set(stripeSubscriptionId, {
          id: `dup_${duplicates.size + 1}`, stripeSubscriptionId, monitoringSubscriptionId, stripeCustomerId, status, events: 1,
          resolvedAt: null, claimedAt: null, canceledInStripeAt: null, compensatedAt: null, refundStatus: "pending",
          refundedAmount: 0, refundIds: [], customerNotifiedAt: null, adminNotifiedAt: null, lastError: null, history: [],
        });
    },
    async findDuplicateSubscription(stripeSubscriptionId) {
      const d = duplicates.get(stripeSubscriptionId);
      return d ? { monitoringSubscriptionId: d.monitoringSubscriptionId } : null;
    },
    async findBySubscriptionId(sid) {
      const s = byStripeId(sid);
      return s ? { ...s } : null;
    },
    async findByPriorSubscriptionId(sid) {
      const s = [...subs.values()].find((x) => x.priorStripeSubscriptionIds.includes(sid));
      return s ? { ...s } : null;
    },
    async findById(id) {
      const s = subs.get(id);
      return s ? { ...s } : null;
    },
    async findByEmail(email) {
      return [...subs.values()].filter((x) => x.email === email).map((x) => ({ ...x }));
    },
    async reattach(id, from, to, patch) {
      const s = subs.get(id);
      if (!s || s.stripeSubscriptionId !== from) return null;
      if (byStripeId(to)) return null;
      const next = { ...s, ...patch, stripeSubscriptionId: to, priorStripeSubscriptionIds: [...s.priorStripeSubscriptionIds, from] };
      subs.set(id, next);
      return { ...next };
    },
    async create(data) {
      if (byStripeId(data.stripeSubscriptionId)) throw new DuplicateSubscriptionError(data.stripeSubscriptionId);
      if (bySiteKey(data.email, data.siteKey)) throw new DuplicateBusinessRecordError(data.siteKey ?? data.websiteUrl);
      const rec: MonitoringSubscriptionRecord = {
        stripeCheckoutSessionId: null,
        lastAuditQueuedAt: null,
        welcomeEmailSentAt: null,
        ...data,
        customerId: data.customerId ?? null,
        priorStripeSubscriptionIds: [],
        id: `msub_${++seq}`,
        createdAt: new Date(data.lastSyncedAt),
      };
      subs.set(rec.id, rec);
      return { ...rec };
    },
    async updateBilling(id, patch) {
      const next = { ...mustGet(id), ...patch };
      subs.set(id, next);
      return { ...next };
    },
    async setCheckoutSessionId(id, sessionId) {
      subs.set(id, { ...mustGet(id), stripeCheckoutSessionId: sessionId });
    },
    async claimWelcomeEmail(id, at) {
      const s = mustGet(id);
      if (s.welcomeEmailSentAt) return false;
      subs.set(id, { ...s, welcomeEmailSentAt: at });
      return true;
    },
    async recordEventAttempt(eventId, type) {
      const e = events.get(eventId);
      if (e) {
        e.attempts += 1;
        return { alreadyProcessed: e.processedAt !== null };
      }
      events.set(eventId, { type, processedAt: null, attempts: 1, lastError: null });
      return { alreadyProcessed: false };
    },
    async markEventProcessed(eventId, at) {
      events.get(eventId)!.processedAt = at;
    },
    async markEventFailed(eventId, error) {
      events.get(eventId)!.lastError = error;
    },
    async findDue(now, limit) {
      return [...subs.values()]
        .filter((s) => ["active", "trialing"].includes(s.status) && s.nextAuditAt && s.nextAuditAt <= now)
        .sort((a, b) => a.nextAuditAt!.getTime() - b.nextAuditAt!.getTime())
        .slice(0, limit)
        .map((s) => ({ ...s }));
    },
    async hasInFlightAudit(subscriptionId) {
      return orders.some((o) => o.subscriptionId === subscriptionId && ["pending", "queued", "running"].includes(o.reportStatus));
    },
    async createScheduledAuditOrder({ subscription, stripeSessionId, queuedAt }) {
      if (orders.some((o) => o.stripeSessionId === stripeSessionId)) return { outcome: "already_exists" };
      const id = `order_${orders.length + 1}`;
      orders.push({ id, subscriptionId: subscription.id, stripeSessionId, reportStatus: "queued", queuedAt });
      return { outcome: "created", orderId: id };
    },
    async advanceSchedule(id, nextAuditAt, queuedAt) {
      subs.set(id, { ...mustGet(id), nextAuditAt, lastAuditQueuedAt: queuedAt });
    },
  };
}

/** In-memory DuplicateLedgerStore over a FakeStore (same atomic claims as the Prisma store). */
export function createFakeLedger(store: FakeStore, staleMs = 120_000): DuplicateLedgerStore {
  const byId = (id: string) => [...store.duplicates.values()].find((d) => d.id === id)!;
  return {
    async claim(sid, now) {
      const d = store.duplicates.get(sid);
      if (!d || d.compensatedAt || d.resolvedAt) return null;
      if (d.claimedAt && now.getTime() - d.claimedAt.getTime() < staleMs) return null;
      d.claimedAt = now;
      return { id: d.id, stripeSubscriptionId: sid, monitoringSubscriptionId: d.monitoringSubscriptionId, stripeCustomerId: d.stripeCustomerId, compensatedAt: d.compensatedAt, canceledInStripeAt: d.canceledInStripeAt, refundStatus: d.refundStatus };
    },
    async release(id, error) {
      const d = byId(id);
      d.claimedAt = null;
      d.lastError = error;
    },
    async canonical(recordId) {
      const r = store.subs.get(recordId);
      return r ? { ...r } : null;
    },
    async markCanceled(id, now) {
      const d = byId(id);
      d.canceledInStripeAt ??= now;
    },
    async recordRefunds(id, r) {
      const d = byId(id);
      d.refundStatus = r.status;
      d.refundedAmount = r.amount;
      d.refundIds.push(...r.refundIds);
    },
    async claimNotification(id, kind, now) {
      const d = byId(id);
      const k = kind === "customer" ? "customerNotifiedAt" : "adminNotifiedAt";
      if (d[k]) return false;
      d[k] = now;
      return true;
    },
    async unclaimNotification(id, kind) {
      byId(id)[kind === "customer" ? "customerNotifiedAt" : "adminNotifiedAt"] = null;
    },
    async markCompensated(id, now) {
      const d = byId(id);
      d.compensatedAt = now;
      d.claimedAt = null;
    },
    async appendHistory(id, entry) {
      byId(id).history.push(entry);
    },
  };
}

/**
 * Fake Stripe billing for compensation: every subscription has one paid
 * invoice (9900 usd) unless overridden. Idempotency keys behave like
 * Stripe's: a repeated key returns the first result without a new effect.
 */
export function createFakeBilling() {
  const status = new Map<string, string>();
  const invoices = new Map<string, Array<{ invoiceId: string; paymentIntentId: string | null; amountPaid: number; currency: string }>>();
  const refunds: Array<{ id: string; paymentIntentId: string; amount: number; key: string }> = [];
  const cancels: string[] = [];
  const keyed = new Map<string, unknown>();
  let failNextRefund = false;
  const gateway: DuplicateBillingGateway = {
    async subscriptionStatus(id) {
      return status.get(id) ?? "active";
    },
    async cancelSubscription(id, key) {
      if (keyed.has(key)) return;
      keyed.set(key, true);
      if ((status.get(id) ?? "active") === "canceled") throw new Error("already canceled");
      status.set(id, "canceled");
      cancels.push(id);
    },
    async collectedPayments(id) {
      return invoices.get(id) ?? [{ invoiceId: `in_${id}`, paymentIntentId: `pi_${id}`, amountPaid: 9900, currency: "usd" }];
    },
    async refundedAmount(pi) {
      return refunds.filter((r) => r.paymentIntentId === pi).reduce((a, r) => a + r.amount, 0);
    },
    async refund({ paymentIntentId, amount, idempotencyKey }) {
      if (failNextRefund) {
        failNextRefund = false;
        throw new Error("stripe: temporary failure");
      }
      const prior = keyed.get(idempotencyKey) as { id: string; amount: number } | undefined;
      if (prior) return prior;
      const r = { id: `re_${refunds.length + 1}`, paymentIntentId, amount, key: idempotencyKey };
      refunds.push(r);
      keyed.set(idempotencyKey, { id: r.id, amount });
      return { id: r.id, amount };
    },
  };
  return {
    gateway,
    status,
    invoices,
    refunds,
    cancels,
    failRefundOnce() {
      failNextRefund = true;
    },
  };
}

/** Fake Stripe: `set()` changes what Stripe currently says about a subscription. */
export function createFakeStripe() {
  const current = new Map<string, SubscriptionSnapshot>();
  let retrievals = 0;
  const gateway: StripeSubscriptionGateway = {
    async retrieveSubscription(id) {
      retrievals += 1;
      const s = current.get(id);
      if (!s) throw new Error(`stripe: no such subscription ${id}`);
      return { ...s, metadata: { ...s.metadata } };
    },
  };
  return {
    gateway,
    set(snapshot: SubscriptionSnapshot) {
      current.set(snapshot.id, snapshot);
    },
    get retrievals() {
      return retrievals;
    },
  };
}

export const T0 = new Date("2026-10-01T12:00:00.000Z");
export const DAY = 24 * 60 * 60 * 1000;

export function monitoringSnapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    id: "sub_123",
    status: "active",
    customerId: "cus_123",
    priceId: "price_monthly",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date(T0.getTime() + 30 * DAY),
    canceledAt: null,
    endedAt: null,
    metadata: {
      geoviz_product: "monitoring",
      planKey: "monthly",
      websiteUrl: "https://rockroofing.example",
      email: "owner@rockroofing.example",
      businessName: "Rock Roofing",
    },
    ...overrides,
  };
}

export function webhookDeps(store: FakeStore, stripe: StripeSubscriptionGateway, clock: { now: Date }) {
  const sentWelcome: string[] = [];
  const linkedCustomers: string[] = [];
  const completedLeases: string[] = [];
  const notices: CompensationNotice[] = [];
  const billing = createFakeBilling();
  const ledger = createFakeLedger(store);
  const deps: WebhookDeps = {
    store,
    stripe,
    now: () => clock.now,
    resolveBusiness: async () => ({ businessId: "biz_1", baselineAuditOrderId: "order_baseline" }),
    newAccessToken: () => `tok_${Math.random().toString(36).slice(2)}_0123456789abcdef`,
    linkCustomer: async (sub) => {
      const linked = { ...sub, customerId: `cust_${sub.email}` };
      store.subs.set(sub.id, { ...store.subs.get(sub.id)!, customerId: linked.customerId });
      linkedCustomers.push(sub.id);
      return linked;
    },
    sendWelcomeEmail: async (sub) => {
      sentWelcome.push(sub.id);
    },
    completeCheckoutLease: async (sessionId) => {
      completedLeases.push(sessionId);
    },
    compensateDuplicate: (sid) =>
      compensateDuplicate(sid, {
        ledger,
        billing: billing.gateway,
        adminEmail: "admin@example.test",
        now: () => clock.now,
        notify: async (n) => {
          notices.push(n);
        },
      }),
  };
  return { deps, sentWelcome, linkedCustomers, completedLeases, notices, billing, ledger };
}

export function subscriptionEvent(id: string, type: string, subscriptionId = "sub_123") {
  return { id, type, data: { object: { id: subscriptionId, object: "subscription" } } };
}

export function checkoutEvent(id: string, subscriptionId = "sub_123", sessionId = "cs_test_123") {
  return { id, type: "checkout.session.completed", data: { object: { id: sessionId, mode: "subscription", subscription: subscriptionId } } };
}

/** Tiny test harness shared by the monitoring test scripts. */
export function harness(name: string) {
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  return {
    async check(label: string, fn: () => void | Promise<void>) {
      try {
        await fn();
        console.log(`  ✓ ${label}`);
        passed += 1;
      } catch (err) {
        const line = `  ✗ ${label} — ${(err as Error).message}`;
        console.log(line);
        failures.push(line);
        failed += 1;
      }
    },
    done() {
      console.log(`[${name}] ${passed} passed, ${failed} failed`);
      if (failed > 0) {
        for (const f of failures) console.log(f);
        process.exit(1);
      }
    },
  };
}

/** In-memory CheckoutLeaseStore (same atomic semantics: unique insert, conditional takeover). */
export function createFakeLeaseStore() {
  const rows = new Map<string, import("../../src/lib/monitoring/checkout-lease").CheckoutLeaseRow>();
  const store: import("../../src/lib/monitoring/checkout-lease").CheckoutLeaseStore = {
    async get(k) {
      const r = rows.get(k);
      return r ? { ...r } : null;
    },
    async insert(row) {
      if (rows.has(row.leaseKey)) return false;
      rows.set(row.leaseKey, { ...row });
      return true;
    },
    async takeover(k, expected, now, next) {
      const r = rows.get(k);
      if (!r || r.attempt !== expected) return null;
      if (r.status === "open" && r.expiresAt.getTime() > now.getTime()) return null;
      const n = { ...r, ...next };
      rows.set(k, n);
      return { ...n };
    },
    async attachSession(k, attempt, sessionId, url) {
      const r = rows.get(k);
      if (r && r.attempt === attempt && r.status === "open") rows.set(k, { ...r, stripeCheckoutSessionId: sessionId, checkoutUrl: url });
    },
    async completeBySession(sessionId) {
      for (const [k, r] of rows) if (r.stripeCheckoutSessionId === sessionId) rows.set(k, { ...r, status: "completed" });
    },
    async release(k, attempt) {
      const r = rows.get(k);
      if (r && r.attempt === attempt && r.status === "open") rows.set(k, { ...r, status: "released" });
    },
  };
  return { store, rows };
}
