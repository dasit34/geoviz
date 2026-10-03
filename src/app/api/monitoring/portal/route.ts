import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { forbiddenOriginResponse, isSameOriginRequest, signedOutResponse } from "@/lib/monitoring/auth/http";
import { requireOwnedSubscription } from "@/lib/monitoring/auth/session";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { createBillingPortalUrl } from "@/lib/monitoring/stripe-gateway";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Opens the Stripe Billing Portal for a monitoring subscriber. Posted
 * from the signed-in dashboard; requires the customer's session and
 * ownership of the subscription.
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!isSameOriginRequest(req)) return forbiddenOriginResponse();
  const limited = applyApiRateLimit({ req, routeKey: "api:monitoring:portal", limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const owned = await requireOwnedSubscription(form?.get("subscriptionId"));
  if (owned.status === "signed_out") return signedOutResponse(req);
  const sub = owned.status === "ok" ? owned.sub : null;
  if (!sub || !sub.stripeCustomerId) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  const base = resolveAppBaseUrl(req);
  try {
    const url = await createBillingPortalUrl({
      customerId: sub.stripeCustomerId,
      returnUrl: `${base}/monitoring/account/${sub.id}?tab=settings`,
    });
    return NextResponse.redirect(url, 303);
  } catch (err) {
    console.error(`[monitoring-portal] portal session failed for ${sub.id}:`, err);
    return NextResponse.json(
      { error: "Billing management is temporarily unavailable. Please try again or contact support@geoviz.ai." },
      { status: 502 },
    );
  }
}
