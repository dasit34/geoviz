import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { validateReAuditEligibility } from "@/lib/audit-orders/reaudit-eligibility";
import { buildReAuditCheckoutSessionParams } from "@/lib/audit-orders/reaudit-checkout-params";

export const runtime = "nodejs";

/**
 * Mints a Stripe checkout session for the $59 GeoViz Re-Audit.
 * Deliberately mirrors `src/app/api/checkout/route.ts` (the $97 flow) —
 * same rate-limit shape, same env-check shape, same session-creation
 * shape — so the two checkout paths stay recognizably one pattern.
 *
 * The only body input is `previousOrderId` (+ an optional email
 * override). `websiteUrl` / `businessName` are deliberately NOT
 * accepted from the client — they're derived server-side from the
 * validated previous order, which is what actually prevents someone
 * claiming eligibility from order A while auditing an unrelated
 * business B. See `validateReAuditEligibility`.
 */
function resolveSiteUrl(): string | null {
  const candidates = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  ];
  for (const c of candidates) {
    if (c && c.trim().length > 0) return c.trim().replace(/\/+$/, "");
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  return null;
}

export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:checkout:reaudit",
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  const PRICE_ID = process.env.STRIPE_REAUDIT_PRICE_ID;

  if (!process.env.STRIPE_SECRET_KEY || !PRICE_ID) {
    return NextResponse.json(
      {
        error:
          "Re-Audit checkout is not yet configured. Set STRIPE_SECRET_KEY and STRIPE_REAUDIT_PRICE_ID, then try again.",
      },
      { status: 503 },
    );
  }

  const siteUrl = resolveSiteUrl();
  if (!siteUrl) {
    console.error(
      "[checkout-reaudit] no site URL resolvable in production — set NEXT_PUBLIC_SITE_URL or rely on VERCEL_URL",
    );
    return NextResponse.json(
      { error: "Checkout is not yet configured. Site URL is unset on the server." },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const body = payload as { previousOrderId?: unknown; email?: unknown };
  const previousOrderId =
    typeof body.previousOrderId === "string" ? body.previousOrderId.trim() : "";
  if (!previousOrderId) {
    return NextResponse.json(
      { error: "Missing previousOrderId." },
      { status: 400 },
    );
  }

  const eligibility = await validateReAuditEligibility(previousOrderId);
  if (!eligibility.eligible) {
    console.warn(
      `[checkout-reaudit] ineligible previousOrderId=${previousOrderId} reason="${eligibility.reason}"`,
    );
    return NextResponse.json({ error: eligibility.reason }, { status: 403 });
  }
  const previousOrder = eligibility.previousOrder;
  const emailOverride =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  const sessionParams = buildReAuditCheckoutSessionParams({
    previousOrder,
    emailOverride,
    priceId: PRICE_ID,
    siteUrl,
  });

  console.log(
    `[checkout-reaudit] previousOrderId=${previousOrderId} siteUrl=${siteUrl} email=${sessionParams.customer_email}`,
  );

  try {
    const session = await getStripe().checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    console.log(`[checkout-reaudit] session created id=${session.id} url=${session.url}`);

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout-reaudit] Stripe session error", err);

    const e = err as { code?: unknown; message?: unknown };
    const code = typeof e.code === "string" ? e.code : "";
    const message = typeof e.message === "string" ? e.message : "";
    if (code === "resource_missing" && /price/i.test(message)) {
      return NextResponse.json(
        {
          error:
            "Stripe re-audit price ID is invalid or missing. Check STRIPE_REAUDIT_PRICE_ID on the server.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 },
    );
  }
}
