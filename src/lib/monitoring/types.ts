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
  stripeCustomerId: string | null;
  stripeCheckoutSessionId: string | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  lastSyncedAt: Date;
  websiteUrl: string;
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
  "id" | "createdAt" | "welcomeEmailSentAt" | "lastAuditQueuedAt" | "stripeCheckoutSessionId"
> & { stripeCheckoutSessionId?: string | null };

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

/** Persistence seam — Prisma in production, in-memory in tests. */
export interface MonitoringStore {
  findBySubscriptionId(stripeSubscriptionId: string): Promise<MonitoringSubscriptionRecord | null>;
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
