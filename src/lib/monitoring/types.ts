/**
 * Subscription monitoring — shared types.
 *
 * The core modules in this directory (access, schedule, subscription
 * sync, webhook handling, scheduler, status view) are written against
 * the small `MonitoringStore` / `StripeSubscriptionGateway` interfaces
 * below, so every rule is unit-testable with in-memory fakes and no
 * database or Stripe account. The Prisma + Stripe implementations
 * live in `prisma-store.ts` and `stripe-gateway.ts`.
 */

/** Stripe subscription statuses, verbatim. */
export type StripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused";

/** Marker set on checkout session + subscription metadata by our checkout only. */
export const MONITORING_PRODUCT_MARKER = "monitoring";
export const MONITORING_ORDER_TYPE = "MONITORING_RECHECK";
export const MONITORING_SESSION_PREFIX = "monitoring_";

/** Metadata GeoViz writes onto the Stripe checkout session AND subscription. */
export type MonitoringMetadata = {
  geoviz_product: typeof MONITORING_PRODUCT_MARKER;
  planKey: string;
  websiteUrl: string;
  email: string;
  businessName: string;
};

/** Normalized, Stripe-SDK-free view of a subscription. */
export type SubscriptionSnapshot = {
  id: string;
  status: string;
  customerId: string | null;
  priceId: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  metadata: Record<string, string>;
};

export type MonitoringSubscriptionRecord = {
  id: string;
  accessToken: string;
  planKey: string;
  stripePriceId: string | null;
  stripeSubscriptionId: string;
  /** Earlier Stripe subscriptions reattached to this record (reactivations). */
  priorStripeSubscriptionIds: string[];
  stripeCustomerId: string | null;
  stripeCheckoutSessionId: string | null;
  /** Owning MonitoringCustomer (monitoring-only login); null until linked by email. */
  customerId: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  lastSyncedAt: Date;
  websiteUrl: string;
  /** normalizeDomain(websiteUrl); unique together with `email` (null only on legacy rows). */
  siteKey: string | null;
  businessName: string | null;
  email: string;
  businessId: string | null;
  baselineAuditOrderId: string | null;
  cadenceDays: number;
  nextAuditAt: Date | null;
  lastAuditQueuedAt: Date | null;
  welcomeEmailSentAt: Date | null;
  createdAt: Date;
};

export type NewMonitoringSubscription = Omit<
  MonitoringSubscriptionRecord,
  | "id"
  | "createdAt"
  | "welcomeEmailSentAt"
  | "lastAuditQueuedAt"
  | "stripeCheckoutSessionId"
  | "priorStripeSubscriptionIds"
  | "customerId"
> & { stripeCheckoutSessionId?: string | null; customerId?: string | null };

export type SubscriptionBillingPatch = Pick<
  MonitoringSubscriptionRecord,
  | "status"
  | "stripeCustomerId"
  | "stripePriceId"
  | "cancelAtPeriodEnd"
  | "currentPeriodEnd"
  | "canceledAt"
  | "endedAt"
  | "lastSyncedAt"
> & { nextAuditAt?: Date | null };

export type CreateOrderResult =
  | { outcome: "created"; orderId: string }
  | { outcome: "already_exists" };

/**
 * Metadata key on a REACTIVATION checkout (and its subscription): the
 * existing MonitoringSubscription the new Stripe subscription reattaches to.
 */
export const REACTIVATES_METADATA_KEY = "reactivatesMonitoringSubscriptionId";

/** Persistence seam — Prisma in production, in-memory in tests. */
export interface MonitoringStore {
  findBySubscriptionId(stripeSubscriptionId: string): Promise<MonitoringSubscriptionRecord | null>;
  /** The record that previously used this Stripe subscription id (reactivated since), if any. */
  findByPriorSubscriptionId(stripeSubscriptionId: string): Promise<MonitoringSubscriptionRecord | null>;
  findById(id: string): Promise<MonitoringSubscriptionRecord | null>;
  /** All records bought with this (lowercased) email (legacy siteKey fallback). */
  findByEmail(email: string): Promise<MonitoringSubscriptionRecord[]>;
  /** The ONE record for (email, siteKey) — database-unique. */
  findBySiteKey(email: string, siteKey: string): Promise<MonitoringSubscriptionRecord | null>;
  /**
   * Give a legacy row (siteKey null) its siteKey. False when the row already
   * has one or another row holds (email, siteKey) — never throws on that.
   */
  claimSiteKey(id: string, siteKey: string): Promise<boolean>;
  /** Paid subscription that lost to an existing record — upserted per Stripe subscription. */
  recordDuplicateSubscription(args: {
    stripeSubscriptionId: string;
    monitoringSubscriptionId: string;
    stripeCustomerId: string | null;
    status: string;
    now: Date;
  }): Promise<void>;
  /** The record a known duplicate Stripe subscription lost to, or null. */
  findDuplicateSubscription(stripeSubscriptionId: string): Promise<{ monitoringSubscriptionId: string } | null>;
  /**
   * Atomically move `id` from `fromStripeSubscriptionId` to a new Stripe
   * subscription (old id appended to priorStripeSubscriptionIds) and apply
   * the billing patch. Returns null when the record no longer points at
   * `fromStripeSubscriptionId` (a concurrent event reattached it first).
   */
  reattach(
    id: string,
    fromStripeSubscriptionId: string,
    toStripeSubscriptionId: string,
    patch: SubscriptionBillingPatch & { stripeCheckoutSessionId?: null },
  ): Promise<MonitoringSubscriptionRecord | null>;
  /** Throws `DuplicateSubscriptionError` when the Stripe subscription id already exists. */
  create(data: NewMonitoringSubscription): Promise<MonitoringSubscriptionRecord>;
  updateBilling(id: string, patch: SubscriptionBillingPatch): Promise<MonitoringSubscriptionRecord>;
  setCheckoutSessionId(id: string, sessionId: string): Promise<void>;
  /** Atomic: returns true only for the single caller that claims the send. */
  claimWelcomeEmail(id: string, at: Date): Promise<boolean>;

  // Stripe event ledger.
  recordEventAttempt(eventId: string, type: string): Promise<{ alreadyProcessed: boolean }>;
  markEventProcessed(eventId: string, at: Date): Promise<void>;
  markEventFailed(eventId: string, error: string): Promise<void>;

  // Scheduling.
  findDue(now: Date, limit: number): Promise<MonitoringSubscriptionRecord[]>;
  hasInFlightAudit(subscriptionId: string): Promise<boolean>;
  /** Idempotent on the deterministic stripeSessionId. */
  createScheduledAuditOrder(args: {
    subscription: MonitoringSubscriptionRecord;
    stripeSessionId: string;
    queuedAt: Date;
  }): Promise<CreateOrderResult>;
  advanceSchedule(id: string, nextAuditAt: Date, queuedAt: Date): Promise<void>;
}

/** `create` hit the (email, siteKey) unique index — another record owns this business. */
export class DuplicateBusinessRecordError extends Error {
  constructor(siteKey: string) {
    super(`monitoring record already exists for ${siteKey} under this email`);
    this.name = "DuplicateBusinessRecordError";
  }
}

export class DuplicateSubscriptionError extends Error {
  constructor(stripeSubscriptionId: string) {
    super(`monitoring subscription already exists for ${stripeSubscriptionId}`);
    this.name = "DuplicateSubscriptionError";
  }
}

/** Stripe read seam — the webhook re-reads every subscription from Stripe. */
export interface StripeSubscriptionGateway {
  retrieveSubscription(id: string): Promise<SubscriptionSnapshot>;
}
