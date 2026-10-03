/**
 * Monitoring branch of the Stripe webhook.
 *
 * Called from `src/app/api/stripe/webhook/route.ts` only for events
 * `isMonitoringStripeEvent` claims, BEFORE the existing one-time-audit
 * path — so a subscription checkout can never be mistaken for a $97
 * order, and the one-time path is otherwise untouched.
 *
 * Idempotency, in two layers:
 *   1. `StripeWebhookEvent` ledger — a redelivered event that already
 *      processed is acknowledged without work.
 *   2. The work itself is idempotent — every event re-reads the
 *      subscription from Stripe and syncs (see subscription-sync.ts),
 *      and the welcome email is claimed atomically. So even two
 *      concurrent deliveries of the same event converge safely.
 * A failure leaves the ledger row unprocessed and rethrows, so the
 * route returns 500 and Stripe retries.
 */
import { monitoringAccess } from "./access";
import { syncSubscription, type SyncDeps, type SyncResult } from "./subscription-sync";
import type { MonitoringSubscriptionRecord, StripeSubscriptionGateway } from "./types";

/** Minimal Stripe event shape (keeps this module SDK-free for tests). */
export type MonitoringStripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export function isMonitoringStripeEvent(event: MonitoringStripeEvent): boolean {
  if (SUBSCRIPTION_EVENTS.has(event.type)) return true;
  // Any subscription-mode checkout belongs here, never to the one-time
  // order path (which would otherwise create a free $97 audit order).
  return event.type === "checkout.session.completed" && event.data.object.mode === "subscription";
}

export type WebhookDeps = SyncDeps & {
  stripe: StripeSubscriptionGateway;
  /**
   * Monitoring-only customer login: create or connect the buyer's account
   * (by email) and link this record to it. Idempotent; returns the record
   * with `customerId` set.
   */
  linkCustomer: (sub: MonitoringSubscriptionRecord) => Promise<MonitoringSubscriptionRecord>;
  /** Welcome email with a single-use 24-hour sign-in link. */
  sendWelcomeEmail: (sub: MonitoringSubscriptionRecord) => Promise<void>;
  /** Close the checkout lease for a completed Checkout session (prevention layer). */
  completeCheckoutLease: (checkoutSessionId: string) => Promise<void>;
  /**
   * Cancel + fully refund a duplicate paid subscription and notify, exactly
   * once (duplicate-compensation.ts). Throws on failure → 500 → Stripe retries.
   */
  compensateDuplicate: (stripeSubscriptionId: string) => Promise<unknown>;
};

export type MonitoringWebhookResult =
  | { outcome: "duplicate" }
  | { outcome: "ignored"; reason: string }
  /**
   * A paid subscription that lost to the record already attached to this
   * business (e.g. two reactivations paid at once). No record or account
   * link is created; it is canceled + refunded automatically (once).
   */
  | { outcome: "duplicate_subscription"; monitoringSubscriptionId: string }
  | { outcome: "synced"; sync: SyncResult; welcomeEmailSent: boolean };

function idOf(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string") {
    return (value as { id: string }).id;
  }
  return null;
}

export async function handleMonitoringStripeEvent(
  event: MonitoringStripeEvent,
  deps: WebhookDeps,
): Promise<MonitoringWebhookResult> {
  const { alreadyProcessed } = await deps.store.recordEventAttempt(event.id, event.type);
  if (alreadyProcessed) return { outcome: "duplicate" };

  try {
    const result = await process(event, deps);
    await deps.store.markEventProcessed(event.id, deps.now());
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.store.markEventFailed(event.id, message.slice(0, 500));
    throw err;
  }
}

async function process(event: MonitoringStripeEvent, deps: WebhookDeps): Promise<MonitoringWebhookResult> {
  const obj = event.data.object;
  const isCheckout = event.type === "checkout.session.completed";
  const subscriptionId = isCheckout ? idOf(obj.subscription) : idOf(obj.id);
  if (!subscriptionId) return { outcome: "ignored", reason: "event has no subscription id" };

  if (isCheckout && typeof obj.id === "string") await deps.completeCheckoutLease(obj.id);

  const snapshot = await deps.stripe.retrieveSubscription(subscriptionId);
  const sync = await syncSubscription(snapshot, deps);
  if (sync.outcome === "ignored") return { outcome: "ignored", reason: sync.reason };
  if (sync.outcome === "duplicate") {
    console.warn(
      `[monitoring-webhook] duplicate paid subscription ${subscriptionId} for record ${sync.monitoringSubscriptionId} — compensating (cancel + refund + notify)`,
    );
    await deps.compensateDuplicate(subscriptionId);
    return { outcome: "duplicate_subscription", monitoringSubscriptionId: sync.monitoringSubscriptionId };
  }

  let sub = sync.subscription;
  if (!sub.customerId) sub = await deps.linkCustomer(sub);
  if (isCheckout && typeof obj.id === "string" && sub.stripeCheckoutSessionId !== obj.id) {
    await deps.store.setCheckoutSessionId(sub.id, obj.id);
    sub = { ...sub, stripeCheckoutSessionId: obj.id };
  }

  let welcomeEmailSent = false;
  if (monitoringAccess(sub, deps.now()).schedulingEnabled && (await deps.store.claimWelcomeEmail(sub.id, deps.now()))) {
    try {
      await deps.sendWelcomeEmail(sub);
      welcomeEmailSent = true;
    } catch (err) {
      // Claimed but not delivered — logged for the operator; never fail
      // the webhook (and never double-send on retry) over an email.
      console.error(`[monitoring-webhook] welcome email failed for ${sub.id} (non-fatal):`, err);
    }
  }
  return { outcome: "synced", sync, welcomeEmailSent };
}
