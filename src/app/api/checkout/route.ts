import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { orderInputSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const APP_URL =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      customer_email: email,
      success_url: `${APP_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/checkout/cancel`,
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

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe session error", err);
    return NextResponse.json(
      { error: "Could not start checkout. Please try again." },
      { status: 500 },
    );
  }
}
