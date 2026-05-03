import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import {
  ADMIN_NOTIFY_EMAIL,
  FROM_EMAIL,
  getResend,
  isResendConfigured,
} from "@/lib/resend";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    console.error("[stripe-webhook] Stripe is not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 503 },
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe-webhook] Signature verification failed:", message);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session);
    }
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const metadata = session.metadata ?? {};
  const websiteUrl = metadata.websiteUrl ?? "";
  const email =
    metadata.email ??
    session.customer_details?.email ??
    session.customer_email ??
    "";
  const businessName = metadata.businessName || null;
  const competitorUrl = metadata.competitorUrl || null;

  if (!websiteUrl || !email) {
    console.error("[stripe-webhook] Missing websiteUrl or email in metadata", {
      sessionId: session.id,
    });
    return;
  }

  const paid = session.payment_status === "paid";

  const order = await prisma.auditOrder.upsert({
    where: { stripeSessionId: session.id },
    create: {
      stripeSessionId: session.id,
      websiteUrl,
      email,
      businessName,
      competitorUrl,
      amount: session.amount_total ?? 9700,
      currency: session.currency ?? "usd",
      paymentStatus: paid ? "paid" : "pending",
      auditStatus: "pending",
    },
    update: {
      paymentStatus: paid ? "paid" : "pending",
    },
  });

  const sendEmails = process.env.SEND_EMAILS === "true";

  if (paid && sendEmails && isResendConfigured() && ADMIN_NOTIFY_EMAIL) {
    try {
      await getResend().emails.send({
        from: FROM_EMAIL,
        to: ADMIN_NOTIFY_EMAIL,
        subject: "New GeoViz Order",
        text: [
          "New GeoViz Order",
          "",
          `Website: ${order.websiteUrl}`,
          `Email: ${order.email}`,
          businessName ? `Business: ${businessName}` : null,
          competitorUrl ? `Competitor: ${competitorUrl}` : null,
          `Amount: $${(order.amount / 100).toFixed(2)} ${order.currency.toUpperCase()}`,
          `Stripe session: ${session.id}`,
          `Order ID: ${order.id}`,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (err) {
      console.error("[stripe-webhook] Resend notification failed:", err);
    }
  } else if (paid && !sendEmails) {
    console.warn(
      "[stripe-webhook] Order saved; admin email skipped (SEND_EMAILS != 'true').",
    );
  } else if (paid) {
    console.warn(
      "[stripe-webhook] Order saved; admin email skipped (Resend not configured).",
    );
  }
}
