import type Stripe from "stripe";
import type { AuditOrder } from "@prisma/client";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getResend, FROM_EMAIL } from "@/lib/resend";

export const runtime = "nodejs";
// Stripe sends a raw body and we must verify the signature against it byte
// for byte. Anything that re-parses the request before us will break the
// HMAC, so this route stays explicitly dynamic and never goes near req.json().
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  console.log("[stripe-webhook] hit");

  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    console.error(
      "[stripe-webhook] not configured — STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET missing",
    );
    return new Response("Webhook not configured", { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    console.error("[stripe-webhook] missing stripe-signature header");
    return new Response("Missing signature", { status: 400 });
  }

  // CRITICAL: read the raw body as text. Stripe's HMAC is computed against
  // the exact bytes of the request body. Calling req.json() (or anything
  // that mutates it) breaks signature verification.
  const rawBody = await req.text();
  console.log(`[stripe-webhook] raw body length=${rawBody.length}`);

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      WEBHOOK_SECRET,
    );
    console.log(
      `[stripe-webhook] verification ok — event=${event.id} type=${event.type}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.error(`[stripe-webhook] verification failed — ${message}`);
    return new Response(`Invalid signature: ${message}`, { status: 400 });
  }

  // From here on, ALWAYS return 200 so Stripe marks the delivery successful.
  if (event.type === "checkout.session.completed") {
    console.log("[stripe-webhook] checkout completed received");
    const session = event.data.object as Stripe.Checkout.Session;
    console.log(
      `[stripe-webhook] session=${session.id} payment_status=${session.payment_status} amount_total=${session.amount_total}`,
    );

    let order: AuditOrder | null = null;
    try {
      order = await persistOrder(session);
    } catch (err) {
      // Log only — never fail the webhook for DB issues. Without a persisted
      // order we have no way to track duplicate sends, so skip email entirely.
      console.error("[stripe-webhook] persistOrder error (non-fatal):", err);
    }

    if (!order) {
      console.warn(
        "[stripe-webhook] skipping admin email — order not persisted (no duplicate-tracking row available)",
      );
    } else {
      try {
        await notifyAdmin(session, order);
      } catch (err) {
        // Log only — never fail the webhook because of an email send.
        console.error("[stripe-webhook] notifyAdmin error (non-fatal):", err);
      }
    }
  } else {
    console.log(`[stripe-webhook] ignoring event type=${event.type}`);
  }

  return new Response("OK", { status: 200 });
}

async function persistOrder(
  session: Stripe.Checkout.Session,
): Promise<AuditOrder | null> {
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
    console.error(
      `[stripe-webhook] missing websiteUrl or email in metadata for session=${session.id}`,
    );
    return null;
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

  console.log(
    `[stripe-webhook] order persisted id=${order.id} payment=${order.paymentStatus}`,
  );
  return order;
}

async function notifyAdmin(
  session: Stripe.Checkout.Session,
  order: AuditOrder,
): Promise<void> {
  if (order.paymentStatus !== "paid") {
    console.log(
      "[stripe-webhook] notifyAdmin skipped — order not in paid state",
    );
    return;
  }

  // ---- Duplicate protection (DB-backed) ----
  // The Stripe session ID is the unique key (schema enforces @unique). If
  // adminEmailSentAt is already set on the row, this is a retry / replay /
  // dashboard "Resend" — bail out without sending again.
  if (order.adminEmailSentAt) {
    console.log(
      "[stripe-webhook] admin email already sent, skipping duplicate",
    );
    return;
  }
  console.log("[stripe-webhook] duplicate check passed");

  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.AUDIT_NOTIFICATION_EMAIL;
  if (!apiKey) {
    console.warn(
      "[stripe-webhook] notifyAdmin skipped — RESEND_API_KEY not set",
    );
    return;
  }
  if (!adminEmail) {
    console.warn(
      "[stripe-webhook] notifyAdmin skipped — AUDIT_NOTIFICATION_EMAIL not set",
    );
    return;
  }

  const metadata = session.metadata ?? {};
  const customerEmail =
    session.customer_details?.email ??
    session.customer_email ??
    metadata.email ??
    order.email;
  const businessName = order.businessName || metadata.businessName || "(not provided)";
  const websiteUrl = order.websiteUrl || metadata.websiteUrl || "(not provided)";
  const competitorUrl = order.competitorUrl || metadata.competitorUrl || null;
  const amount = session.amount_total ?? order.amount;
  const currency = (session.currency ?? order.currency).toUpperCase();
  const amountFormatted = `$${(amount / 100).toFixed(2)} ${currency}`;

  const lines = [
    "A new GeoViz Audit Order has come in. Details below.",
    "",
    `Customer email:  ${customerEmail}`,
    `Business name:   ${businessName}`,
    `Website URL:     ${websiteUrl}`,
  ];
  if (competitorUrl) lines.push(`Competitor URL:  ${competitorUrl}`);
  lines.push(
    `Amount paid:     ${amountFormatted}`,
    `Payment status:  ${order.paymentStatus}`,
    `Stripe session:  ${session.id}`,
    "",
    "Run the audit and email the report back to the customer.",
  );
  const body = lines.join("\n");

  console.log("[stripe-webhook] sending admin email");
  const result = await getResend().emails.send({
    from: FROM_EMAIL,
    to: adminEmail,
    subject: "New GeoViz Audit Order — $97",
    text: body,
  });

  if (result.error) {
    console.error(
      `[stripe-webhook] email send failed: ${result.error.name} — ${result.error.message}`,
    );
    return;
  }

  // Mark sent so subsequent retries / replays / "resend" clicks don't
  // re-fire the email. Failure to update is logged but not fatal — Resend
  // already accepted the message; we'd rather risk one duplicate than fail
  // the whole webhook.
  try {
    await prisma.auditOrder.update({
      where: { id: order.id },
      data: { adminEmailSentAt: new Date() },
    });
  } catch (err) {
    console.error(
      "[stripe-webhook] failed to mark adminEmailSentAt (non-fatal):",
      err,
    );
  }

  console.log(
    `[stripe-webhook] email sent successfully — id=${result.data?.id ?? "unknown"}`,
  );
}
