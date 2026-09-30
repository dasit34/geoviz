/**
 * Stripe-backed implementations for the monitoring module.
 */
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";

import type { StripeSubscriptionGateway, SubscriptionSnapshot } from "./types";

const toDate = (unix: number | null | undefined): Date | null =>
  typeof unix === "number" ? new Date(unix * 1000) : null;

/** Normalize a Stripe subscription (API 2025-02-24.acacia shape). */
export function toSubscriptionSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  const customer = sub.customer;
  return {
    id: sub.id,
    status: sub.status,
    customerId: typeof customer === "string" ? customer : (customer?.id ?? null),
    priceId: sub.items?.data?.[0]?.price?.id ?? null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    currentPeriodEnd: toDate(sub.current_period_end),
    canceledAt: toDate(sub.canceled_at),
    endedAt: toDate(sub.ended_at),
    metadata: { ...(sub.metadata ?? {}) },
  };
}

export function stripeSubscriptionGateway(stripe: Stripe = getStripe()): StripeSubscriptionGateway {
  return {
    async retrieveSubscription(id) {
      return toSubscriptionSnapshot(await stripe.subscriptions.retrieve(id));
    },
  };
}

/** Customer-facing Stripe Billing Portal session (manage payment method / cancel). */
export async function createBillingPortalUrl(args: {
  customerId: string;
  returnUrl: string;
  stripe?: Stripe;
}): Promise<string> {
  const session = await (args.stripe ?? getStripe()).billingPortal.sessions.create({
    customer: args.customerId,
    return_url: args.returnUrl,
  });
  return session.url;
}

/** Display data for a plan's Stripe price; null when not a usable recurring price. */
export async function retrievePlanPrice(
  priceId: string,
  stripe: Stripe = getStripe(),
): Promise<{ unit_amount: number | null; currency: string; recurring: { interval: string; interval_count: number } | null } | null> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active || price.type !== "recurring") return null;
    return {
      unit_amount: price.unit_amount,
      currency: price.currency,
      recurring: price.recurring
        ? { interval: price.recurring.interval, interval_count: price.recurring.interval_count }
        : null,
    };
  } catch (err) {
    console.error(`[monitoring] could not read Stripe price ${priceId}:`, err);
    return null;
  }
}
