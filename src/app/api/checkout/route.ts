import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { orderInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Resolves the public site URL for Stripe success_url / cancel_url.
 * Resolution chain — first non-empty wins:
 *   1. NEXT_PUBLIC_SITE_URL — preferred, explicit.
 *   2. SITE_URL             — server-only fallback.
 *   3. NEXT_PUBLIC_APP_URL  — legacy; kept so existing Vercel
 *                             projects with this set keep working.
 *   4. https://${VERCEL_URL} — Vercel auto-injects VERCEL_URL on
 *                              every deploy. Canonical in prod,
 *                              the preview URL in preview.
 *   5. http://localhost:3000 — non-production ONLY.
 * In production with none of 1–4 set, returns null so the caller
 * can fail-loud with a 503 instead of producing a broken URL.
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
  const PRICE_ID = process.env.STRIPE_PRICE_ID;

  if (!process.env.STRIPE_SECRET_KEY || !PRICE_ID) {
    return NextResponse.json(
      {
        error:
          "Checkout is not yet configured. Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID, then try again.",
      },
      { status: 503 },
    );
  }

  const siteUrl = resolveSiteUrl();
  if (!siteUrl) {
    console.error(
      "[checkout] no site URL resolvable in production — set NEXT_PUBLIC_SITE_URL or rely on VERCEL_URL",
    );
    return NextResponse.json(
      {
        error:
          "Checkout is not yet configured. Site URL is unset on the server.",
      },
      { status: 503 },
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = orderInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { websiteUrl, email, businessName, competitorUrl } = parsed.data;

  const success_url = `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url = siteUrl;

  console.log(
    `[checkout] siteUrl=${siteUrl} success_url=${success_url} cancel_url=${cancel_url} email=${email}`,
  );

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_email: email,
      success_url,
      cancel_url,
      allow_promotion_codes: true,
      metadata: {
        websiteUrl,
        email,
        businessName: businessName ?? "",
        competitorUrl: competitorUrl ?? "",
      },
      payment_intent_data: {
        metadata: {
          websiteUrl,
          email,
          businessName: businessName ?? "",
        },
        description: `GeoViz AI Visibility Audit · ${websiteUrl}`,
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL." },
        { status: 502 },
      );
    }

    console.log(
      `[checkout] session created id=${session.id} url=${session.url}`,
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe session error", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 },
    );
  }
}
