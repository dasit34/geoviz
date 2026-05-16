import type Stripe from "stripe";
import type { AuditOrder } from "@prisma/client";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/db";
import { getResend } from "@/lib/resend";
import { resolveAppBaseUrl, buildAdminReviewUrl } from "@/lib/app-url";

/**
 * Webhook-specific FROM fallback. We deliberately do NOT inherit
 * `FROM_EMAIL` from `@/lib/resend` because that chain ends in an
 * unverified `geoviz.local` placeholder which Resend rejects. A
 * misconfigured Vercel env (no `RESEND_EMAIL_FROM`) would silently
 * break BOTH customer confirmations and admin notifications. Falling
 * back to the canonical `mail.geoviz.ai` subdomain keeps both flows
 * working out-of-the-box. Mirrors the pattern in
 * `lib/notify-operator-report-ready.ts`.
 */
const WEBHOOK_FROM_FALLBACK = "GeoViz Orders <orders@mail.geoviz.ai>";

function webhookFromEmail(): string {
  const fromEnv = process.env.RESEND_EMAIL_FROM?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : WEBHOOK_FROM_FALLBACK;
}

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
        "[stripe-webhook] skipping emails — order not persisted (no duplicate-tracking row available)",
      );
    } else {
      // Send the customer confirmation FIRST so the customer's "we got
      // your request" email lands before the admin gets a "new order"
      // ping in the same inbox. Both are dedup'd at the DB level so
      // webhook replays are safe.
      try {
        await notifyCustomer(req, session, order);
      } catch (err) {
        console.error(
          "[stripe-webhook] notifyCustomer error (non-fatal):",
          err,
        );
      }
      try {
        await notifyAdmin(req, session, order);
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

  // Auto-queue the report for the Railway worker as soon as payment is
  // confirmed. Eligible: `pending` (fresh paid order) or `failed` (a
  // prior worker run errored — paid customer deserves a retry). Excluded:
  // `queued` / `running` / `generated` — those are in-flight or done and
  // a webhook replay must not knock them back. Idempotent.
  if (paid) {
    const promoted = await prisma.auditOrder.updateMany({
      where: {
        id: order.id,
        reportStatus: { in: ["pending", "failed"] },
      },
      data: {
        reportStatus: "queued",
        reportQueuedAt: new Date(),
        reportError: null,
      },
    });
    if (promoted.count > 0) {
      console.log(
        `[stripe-webhook] paid order queued orderId=${order.id}`,
      );
    }
  }

  return order;
}

async function notifyAdmin(
  req: Request,
  session: Stripe.Checkout.Session,
  order: AuditOrder,
): Promise<void> {
  if (order.paymentStatus !== "paid") {
    console.log(
      "[stripe-webhook] notifyAdmin skipped — order not in paid state",
    );
    return;
  }

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

  // ---- Atomic claim — only proceed if adminEmailSentAt is still null.
  // Replaces the prior check-then-set pattern (which could race on
  // concurrent webhook replays). Mirrors the `notifyCustomer` claim.
  const claim = await prisma.auditOrder.updateMany({
    where: { id: order.id, adminEmailSentAt: null },
    data: { adminEmailSentAt: new Date() },
  });
  if (claim.count !== 1) {
    console.log(
      `[stripe-webhook] notifyAdmin skipped — already sent for orderId=${order.id}`,
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
  const adminReviewUrl = buildAdminReviewUrl(req);

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
    `Review Audit in Admin: ${adminReviewUrl}`,
  );
  const body = lines.join("\n");

  const htmlBody = buildAdminNotificationHtml({
    businessName,
    websiteUrl,
    customerEmail,
    competitorUrl,
    amountFormatted,
    paymentStatus: order.paymentStatus,
    sessionId: session.id,
    adminReviewUrl,
  });

  console.log("[stripe-webhook] sending admin email");
  const result = await getResend().emails.send({
    from: webhookFromEmail(),
    to: adminEmail,
    subject: "New GeoViz Audit Order — $97",
    text: body,
    html: htmlBody,
  });

  if (result.error) {
    console.error(
      `[stripe-webhook] admin email send failed: ${result.error.name} — ${result.error.message}`,
    );
    // Roll back the atomic claim so a future delivery attempt can retry.
    await prisma.auditOrder
      .update({
        where: { id: order.id },
        data: { adminEmailSentAt: null },
      })
      .catch(() => {
        /* ignore — best-effort rollback */
      });
    return;
  }

  console.log(
    `[stripe-webhook] admin email sent successfully — id=${result.data?.id ?? "unknown"}`,
  );
}

/**
 * Sends the "GeoViz Audit Request Received" confirmation to the customer
 * immediately after the webhook persists the paid order. Race-safe via
 * an atomic DB claim on the `customerConfirmationSentAt` column —
 * concurrent webhook replays can't double-send. If the email send
 * fails after the claim, the column is rolled back so the next
 * delivery (manual resend / future retry) can try again.
 */
async function notifyCustomer(
  req: Request,
  session: Stripe.Checkout.Session,
  order: AuditOrder,
): Promise<void> {
  if (order.paymentStatus !== "paid") {
    console.log(
      "[stripe-webhook] notifyCustomer skipped — order not in paid state",
    );
    return;
  }

  const customerEmail = (
    session.customer_details?.email ??
    session.customer_email ??
    order.email ??
    ""
  )
    .trim()
    .toLowerCase();

  if (!customerEmail) {
    console.warn(
      `[stripe-webhook] notifyCustomer skipped — no customer email on session=${session.id}`,
    );
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) {
    console.warn(
      `[stripe-webhook] notifyCustomer skipped — invalid customer email "${customerEmail}" on session=${session.id}`,
    );
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "[stripe-webhook] notifyCustomer skipped — RESEND_API_KEY not set",
    );
    return;
  }

  // ---- Atomic claim — only proceed if customerConfirmationSentAt is
  // still null. Concurrent webhook replays will see the timestamp
  // already set on the second attempt and bail out cleanly.
  const claim = await prisma.auditOrder.updateMany({
    where: { id: order.id, customerConfirmationSentAt: null },
    data: { customerConfirmationSentAt: new Date() },
  });
  if (claim.count !== 1) {
    console.log(
      `[stripe-webhook] notifyCustomer skipped — already sent for orderId=${order.id}`,
    );
    return;
  }

  const businessLabel = order.businessName || order.websiteUrl;
  const baseUrl = resolveAppBaseUrl(req);
  const orderUrl = `${baseUrl}/checkout/success?session_id=${encodeURIComponent(session.id)}`;

  const subject = "GeoViz Audit Request Received";
  const textBody = [
    "Hi —",
    "",
    `We've received your audit request${businessLabel ? ` for ${businessLabel}` : ""} and started reviewing your AI visibility signals.`,
    "",
    "Your reviewed GeoViz audit is typically delivered within minutes.",
    "",
    `Order confirmation: ${orderUrl}`,
    "",
    "Reply to this email if anything is wrong with the order details.",
    "",
    "— GeoViz",
    "",
  ].join("\n");

  const htmlBody = buildCustomerConfirmationHtml({
    businessLabel,
    orderUrl,
  });

  const fromAddress = webhookFromEmail();
  console.log(
    `[stripe-webhook] CUSTOMER_DISPATCH orderId=${order.id} to=${customerEmail} from=${fromAddress} subject="${subject}"`,
  );

  let resendId: string | undefined;
  try {
    const result = await getResend().emails.send({
      from: fromAddress,
      to: customerEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    if (result.error) {
      console.error(
        `[stripe-webhook] CUSTOMER_FAILED orderId=${order.id} to=${customerEmail} resendError="${result.error.name}: ${result.error.message}"`,
      );
      // Roll back the claim so a future attempt can retry.
      await prisma.auditOrder
        .update({
          where: { id: order.id },
          data: { customerConfirmationSentAt: null },
        })
        .catch(() => {
          /* ignore — best-effort rollback */
        });
      return;
    }
    resendId = result.data?.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[stripe-webhook] CUSTOMER_FAILED orderId=${order.id} to=${customerEmail} threwException="${message}"`,
    );
    await prisma.auditOrder
      .update({
        where: { id: order.id },
        data: { customerConfirmationSentAt: null },
      })
      .catch(() => {
        /* ignore */
      });
    return;
  }

  console.log(
    `[stripe-webhook] CUSTOMER_SENT orderId=${order.id} to=${customerEmail} resendId=${resendId ?? "unknown"}`,
  );
}

// URL resolution moved to `@/lib/app-url`. See `resolveAppBaseUrl` —
// production deploys without an explicit env var now fall back to the
// canonical custom domain instead of `*.vercel.app`.

/**
 * HTML body for the audit-received confirmation. Same dark-on-light
 * template as the report-delivery email so customers recognize the
 * brand on both touchpoints.
 */
function buildCustomerConfirmationHtml(args: {
  businessLabel: string | null;
  orderUrl: string;
}): string {
  const { businessLabel, orderUrl } = args;
  const safeBiz = escapeHtml(businessLabel ?? "your business");
  const safeUrl = escapeHtml(orderUrl);
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #ececec;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="color:#ff7a18;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">GeoViz</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h1 style="margin:8px 0 18px;font-size:22px;line-height:1.3;color:#111;font-weight:700;letter-spacing:-0.01em;">
                  Audit request received
                </h1>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2a2a2a;">
                  We've received your audit request for <strong style="color:#111;">${safeBiz}</strong> and started reviewing your AI visibility signals.
                </p>
                <p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#2a2a2a;">
                  Your reviewed GeoViz audit is typically delivered <strong style="color:#111;">within minutes</strong>. We'll email you the moment it's ready.
                </p>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:4px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:#ff7a18;border-radius:6px;">
                      <a href="${safeUrl}" style="display:inline-block;padding:13px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">View Order Confirmation →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 8px;">
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#2a2a2a;">
                  Reply to this email if anything is wrong with your order details.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 26px;border-top:1px solid #eee;">
                <p style="margin:14px 0 0;font-size:11.5px;line-height:1.5;color:#888;">
                  GeoViz · AI Visibility Audits · geoviz.ai
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * HTML body for the operator's "new order" notification. Mirrors the
 * customer-confirmation template's brand styling so both emails feel
 * like the same product. The "Review Audit in Admin" CTA links
 * directly to `/admin/reports?key=<ADMIN_SECRET>` so the operator
 * lands on the live queue dashboard with one click.
 */
function buildAdminNotificationHtml(args: {
  businessName: string;
  websiteUrl: string;
  customerEmail: string;
  competitorUrl: string | null;
  amountFormatted: string;
  paymentStatus: string;
  sessionId: string;
  adminReviewUrl: string;
}): string {
  const {
    businessName,
    websiteUrl,
    customerEmail,
    competitorUrl,
    amountFormatted,
    paymentStatus,
    sessionId,
    adminReviewUrl,
  } = args;
  const safeBusiness = escapeHtml(businessName);
  const safeWebsite = escapeHtml(websiteUrl);
  const safeCustomer = escapeHtml(customerEmail);
  const safeCompetitor = competitorUrl ? escapeHtml(competitorUrl) : null;
  const safeAmount = escapeHtml(amountFormatted);
  const safePayment = escapeHtml(paymentStatus);
  const safeSession = escapeHtml(sessionId);
  const safeAdminUrl = escapeHtml(adminReviewUrl);

  const competitorRow = safeCompetitor
    ? `<tr><td style="padding:6px 0;color:#666;font-size:13px;width:140px;">Competitor URL</td><td style="padding:6px 0;color:#111;font-size:13px;">${safeCompetitor}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Inter','Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #ececec;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <div style="color:#ff7a18;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">GeoViz · Operator</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h1 style="margin:8px 0 18px;font-size:22px;line-height:1.3;color:#111;font-weight:700;letter-spacing:-0.01em;">
                  New audit order — ${safeBusiness}
                </h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#2a2a2a;">
                  A paid GeoViz audit just landed and is queued for the worker. Review it in the admin dashboard to track status, run / re-run, and send the report when ready.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background:#fafafa;border:1px solid #ececec;border-radius:6px;padding:8px 14px;margin-bottom:18px;">
                  <tr><td style="padding:6px 0;color:#666;font-size:13px;width:140px;">Customer email</td><td style="padding:6px 0;color:#111;font-size:13px;">${safeCustomer}</td></tr>
                  <tr><td style="padding:6px 0;color:#666;font-size:13px;">Website URL</td><td style="padding:6px 0;color:#111;font-size:13px;">${safeWebsite}</td></tr>
                  ${competitorRow}
                  <tr><td style="padding:6px 0;color:#666;font-size:13px;">Amount paid</td><td style="padding:6px 0;color:#111;font-size:13px;">${safeAmount}</td></tr>
                  <tr><td style="padding:6px 0;color:#666;font-size:13px;">Payment status</td><td style="padding:6px 0;color:#111;font-size:13px;">${safePayment}</td></tr>
                  <tr><td style="padding:6px 0;color:#666;font-size:13px;">Stripe session</td><td style="padding:6px 0;color:#111;font-size:12.5px;font-family:ui-monospace,Menlo,monospace;word-break:break-all;">${safeSession}</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:4px 32px 8px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:#ff7a18;border-radius:6px;">
                      <a href="${safeAdminUrl}" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;letter-spacing:0.01em;">Review Audit in Admin →</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px 26px;border-top:1px solid #eee;">
                <p style="margin:14px 0 0;font-size:11.5px;line-height:1.5;color:#888;">
                  GeoViz · Internal operator notification · do not forward
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
