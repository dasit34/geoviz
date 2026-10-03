/**
 * Customer billing actions on a monitoring record: cancel (always at the
 * end of the paid period), resume a pending cancellation, or reactivate an
 * ended subscription. Which actions are offered is a pure rule
 * (`billingActionsFor`); the Stripe calls re-sync the record immediately
 * (the webhook converges on the same state anyway).
 */
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";

import { monitoringAccess } from "./access";
import { buildMonitoringReactivationSessionParams } from "./checkout";
import { createCheckoutUnderLease } from "./checkout-lease";
import { prismaCheckoutLeaseStore } from "./checkout-lease-store";
import { resolvePlan } from "./plans";
import { prismaMonitoringStore, resolveMonitoringBusiness } from "./prisma-store";
import { toSubscriptionSnapshot } from "./stripe-gateway";
import { siteKeyFor, syncSubscription } from "./subscription-sync";
import type { MonitoringSubscriptionRecord } from "./types";

const ENDED = new Set(["canceled", "incomplete_expired"]);

export type BillingActions = {
  /** Paid up and not already canceling → "Cancel at end of billing period". */
  canCancel: boolean;
  /** Canceling at period end and the period hasn't ended → "Keep monitoring". */
  canResume: boolean;
  /** Subscription has ended → "Reactivate" (new checkout, same record). */
  canReactivate: boolean;
};

export function billingActionsFor(
  sub: Pick<MonitoringSubscriptionRecord, "status" | "cancelAtPeriodEnd" | "currentPeriodEnd">,
  now: Date,
): BillingActions {
  const access = monitoringAccess(sub, now);
  const ended = ENDED.has(sub.status);
  return {
    canCancel: access.schedulingEnabled && !sub.cancelAtPeriodEnd,
    canResume: access.schedulingEnabled && sub.cancelAtPeriodEnd,
    canReactivate: ended,
  };
}

async function resync(subscription: Stripe.Subscription): Promise<void> {
  await syncSubscription(toSubscriptionSnapshot(subscription), {
    store: prismaMonitoringStore,
    now: () => new Date(),
    resolveBusiness: resolveMonitoringBusiness,
  });
}

/** Cancel at the end of the paid period (never immediately) or undo that. */
export async function setCancelAtPeriodEnd(sub: MonitoringSubscriptionRecord, cancel: boolean): Promise<void> {
  const updated = await getStripe().subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: cancel });
  await resync(updated);
}

export type ReactivationCheckout = { status: "ready"; url: string } | { status: "in_progress" } | { status: "unavailable" };

/**
 * Stripe Checkout URL that reactivates this ENDED record — only reachable
 * from the signed-in dashboard. Created under the checkout lease, so
 * repeated or concurrent clicks share ONE Checkout session (idempotency-keyed).
 */
export async function createReactivationCheckoutUrl(sub: MonitoringSubscriptionRecord, siteUrl: string): Promise<ReactivationCheckout> {
  const plan = resolvePlan(sub.planKey);
  if (!plan) return { status: "unavailable" };
  const result = await createCheckoutUnderLease({
    email: sub.email,
    siteKey: sub.siteKey ?? siteKeyFor(sub.websiteUrl),
    kind: "reactivation",
    monitoringSubscriptionId: sub.id,
    buildParams: () => buildMonitoringReactivationSessionParams({ plan, sub, siteUrl }),
    createSession: async (params, idempotencyKey) => {
      const s = await getStripe().checkout.sessions.create(params, { idempotencyKey });
      return { id: s.id, url: s.url };
    },
    store: prismaCheckoutLeaseStore,
    now: () => new Date(),
  });
  return result.status === "in_progress" ? { status: "in_progress" } : { status: "ready", url: result.url };
}
