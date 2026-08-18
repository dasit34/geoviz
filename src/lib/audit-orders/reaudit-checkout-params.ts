import type { AuditOrder } from "@prisma/client";
import type Stripe from "stripe";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Pure builder for the $59 Re-Audit Stripe checkout session params.
 * Extracted out of `route.ts` so the metadata/derived-field logic —
 * the part that actually matters for "did we correctly derive
 * websiteUrl/businessName from the validated previous order, never
 * from client input" — can be unit-tested without creating a real
 * Stripe session. See `scripts/test-reaudit-checkout.ts`.
 */
export function buildReAuditCheckoutSessionParams(args: {
  previousOrder: AuditOrder;
  emailOverride: string;
  priceId: string;
  siteUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const { previousOrder, emailOverride, priceId, siteUrl } = args;

  const email =
    emailOverride && EMAIL_PATTERN.test(emailOverride)
      ? emailOverride
      : previousOrder.email;
  const websiteUrl = previousOrder.websiteUrl;
  const businessName = previousOrder.businessName ?? "";

  const metadata = {
    productType: "RE_AUDIT",
    previousOrderId: previousOrder.id,
    websiteUrl,
    email,
    businessName,
  };

  return {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: siteUrl,
    allow_promotion_codes: true,
    metadata,
    payment_intent_data: {
      metadata,
      description: `GeoViz Re-Audit · ${websiteUrl}`,
    },
  };
}
