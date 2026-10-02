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
import type { WebhookDeps } from "../../src/lib/monitoring/webhook";

export type FakeOrder = {
  id: string;
  subscriptionId: string;
  stripeSessionId: string;
  reportStatus: string;
  queuedAt: Date;
};

export type FakeDuplicate = { stripeSubscriptionId: string; monitoringSubscriptionId: string; status: string; events: number };

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
    async recordDuplicateSubscription({ stripeSubscriptionId, monitoringSubscriptionId, status }) {
      const d = duplicates.get(stripeSubscriptionId);
      if (d) {
        d.status = status;
        d.events += 1;
      } else duplicates.set(stripeSubscriptionId, { stripeSubscriptionId, monitoringSubscriptionId, status, events: 1 });
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
  };
  return { deps, sentWelcome, linkedCustomers };
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
