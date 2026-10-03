/**
 * Monitoring subscription checkout — input validation + the pure Stripe
 * session-params builder (mirrors `reaudit-checkout-params.ts`, so the
 * part that matters — mode, price, metadata on BOTH the session and the
 * subscription — is unit-testable without a Stripe call).
 */
import type Stripe from "stripe";
import { z } from "zod";

import { orderInputSchema } from "@/lib/validation";

import type { ResolvedPlan } from "./plans";
import {
  MONITORING_PRODUCT_MARKER,
  REACTIVATES_METADATA_KEY,
  type MonitoringMetadata,
  type MonitoringSubscriptionRecord,
} from "./types";

/** Same URL/email/business-name rules as the $97 order form; no competitor field. */
export const monitoringCheckoutInputSchema = orderInputSchema
  .omit({ competitorUrl: true })
  .extend({ planKey: z.string().trim().min(1, "Choose a plan").max(64) });

export type MonitoringCheckoutInput = z.infer<typeof monitoringCheckoutInputSchema>;

export function buildMonitoringCheckoutSessionParams(args: {
  plan: ResolvedPlan;
  input: MonitoringCheckoutInput;
  siteUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const { plan, input, siteUrl } = args;
  const metadata: MonitoringMetadata = {
    geoviz_product: MONITORING_PRODUCT_MARKER,
    planKey: plan.key,
    websiteUrl: input.websiteUrl,
    email: input.email,
    businessName: input.businessName ?? "",
  };
  return {
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    customer_email: input.email,
    success_url: `${siteUrl}/monitoring/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/monitoring`,
    allow_promotion_codes: true,
    metadata,
    // Copied onto the subscription so every customer.subscription.*
    // event is self-describing (see subscription-sync.ts).
    subscription_data: {
      metadata,
      description: `GeoViz ${plan.name} · ${input.websiteUrl}`,
    },
  };
}

/**
 * Reactivation checkout for an ENDED monitoring record, started by its
 * signed-in owner. Same subscription shape as a new purchase, billed to the
 * existing Stripe customer, with metadata naming the record so the webhook
 * reattaches the new subscription to it (history, questions, competitors
 * carried over — see subscription-sync.ts).
 */
export function buildMonitoringReactivationSessionParams(args: {
  plan: ResolvedPlan;
  sub: Pick<MonitoringSubscriptionRecord, "id" | "websiteUrl" | "email" | "businessName" | "stripeCustomerId">;
  siteUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const { plan, sub, siteUrl } = args;
  const metadata: MonitoringMetadata & { [REACTIVATES_METADATA_KEY]: string } = {
    geoviz_product: MONITORING_PRODUCT_MARKER,
    planKey: plan.key,
    websiteUrl: sub.websiteUrl,
    email: sub.email,
    businessName: sub.businessName ?? "",
    [REACTIVATES_METADATA_KEY]: sub.id,
  };
  const back = `${siteUrl}/monitoring/account/${sub.id}?tab=settings`;
  return {
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    ...(sub.stripeCustomerId ? { customer: sub.stripeCustomerId } : { customer_email: sub.email }),
    success_url: `${back}&notice=${encodeURIComponent("Reactivation received — monitoring resumes as soon as Stripe confirms payment.")}`,
    cancel_url: back,
    allow_promotion_codes: true,
    metadata,
    subscription_data: {
      metadata,
      description: `GeoViz ${plan.name} · ${sub.websiteUrl} (reactivated)`,
    },
  };
}
