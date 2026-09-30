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
import { MONITORING_PRODUCT_MARKER, type MonitoringMetadata } from "./types";

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
