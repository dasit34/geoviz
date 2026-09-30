import { NextResponse } from "next/server";

import { resolveAppBaseUrl } from "@/lib/app-url";
import {
  buildMonitoringCheckoutSessionParams,
  monitoringCheckoutInputSchema,
} from "@/lib/monitoring/checkout";
import { isMonitoringEnabled, resolvePlan } from "@/lib/monitoring/plans";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Mints a Stripe **subscription** checkout session for AI visibility
 * monitoring. Mirrors the one-time checkout routes (rate limit, env
 * checks, error mapping). Off unless GEO_MODULE_MONITORING_ENABLED is
 * "true"; the plan's price comes from its STRIPE_MONITORING_*_PRICE_ID
 * env var (src/lib/monitoring/plans.ts) — never from the client.
 */
export async function POST(req: Request) {
  if (!isMonitoringEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const limited = applyApiRateLimit({
    req,
    routeKey: "api:checkout:monitoring",
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Monitoring checkout is not yet configured." }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = monitoringCheckoutInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const plan = resolvePlan(parsed.data.planKey);
  if (!plan) {
    return NextResponse.json({ error: "That monitoring plan is not available." }, { status: 400 });
  }

  const params = buildMonitoringCheckoutSessionParams({
    plan,
    input: parsed.data,
    siteUrl: resolveAppBaseUrl(req),
  });

  try {
    const session = await getStripe().checkout.sessions.create(params);
    if (!session.url) {
      return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
    }
    console.log(`[checkout-monitoring] session created id=${session.id} plan=${plan.key}`);
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout-monitoring] Stripe session error", err);
    const e = err as { code?: unknown; message?: unknown };
    if (e.code === "resource_missing" && typeof e.message === "string" && /price/i.test(e.message)) {
      return NextResponse.json(
        { error: `Stripe price for plan "${plan.key}" is invalid. Check ${plan.priceEnvVar}.` },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
