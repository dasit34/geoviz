import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import { isMonitoringEnabled } from "@/lib/monitoring/plans";
import { findSubscriptionByToken } from "@/lib/monitoring/prisma-store";
import { createBillingPortalUrl } from "@/lib/monitoring/stripe-gateway";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Opens the Stripe Billing Portal for a monitoring subscriber. Posted
 * from the status page form; the status-page token is the only
 * credential (same capability model as the report pages).
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const limited = applyApiRateLimit({ req, routeKey: "api:monitoring:portal", limit: 10, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const token = typeof form?.get("token") === "string" ? String(form?.get("token")) : "";
  const sub = token ? await findSubscriptionByToken(token) : null;
  if (!sub || !sub.stripeCustomerId) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }

  const base = resolveAppBaseUrl(req);
  try {
    const url = await createBillingPortalUrl({
      customerId: sub.stripeCustomerId,
      returnUrl: `${base}/monitoring/${sub.accessToken}`,
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
