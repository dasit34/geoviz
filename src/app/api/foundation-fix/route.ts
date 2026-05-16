import { NextResponse } from "next/server";
import { prisma, isDatabaseConfigured } from "@/lib/db";
import { foundationFixInputSchema } from "@/lib/validation";
import { applyApiRateLimit } from "@/lib/rate-limit";
import {
  getResend,
  FROM_EMAIL,
  ADMIN_NOTIFY_EMAIL,
  isResendConfigured,
} from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Captures Foundation Fix requests submitted through /foundation-fix. The
// previous flow was a mailto: link, which lost most customers between the
// click and an actual email being composed. This route replaces that with
// a structured form post:
//   1. Rate-limit (5 / 10 min per IP).
//   2. Validate via Zod.
//   3. If auditOrderId is provided, append a structured note to that
//      order's adminNotes so the operator can find the request alongside
//      the audit it relates to.
//   4. Send admin notification email + customer confirmation email via
//      the existing Resend wrapper.
// The route returns { ok: true } even when email sending fails — we don't
// want to surface infra issues to the customer as long as their submission
// was captured. Errors are logged for the operator.
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:foundation-fix",
    limit: 5,
    windowMs: 10 * 60_000,
  });
  if (limited) return limited;

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = foundationFixInputSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }

  const { businessName, websiteUrl, contactEmail, auditOrderId, notes } =
    parsed.data;

  const submittedAt = new Date();

  if (auditOrderId && isDatabaseConfigured()) {
    try {
      const existing = await prisma.auditOrder.findUnique({
        where: { id: auditOrderId },
        select: { id: true, adminNotes: true },
      });
      if (existing) {
        const stamp = submittedAt.toISOString();
        const block = [
          `[foundation-fix request · ${stamp}]`,
          `business: ${businessName}`,
          `website: ${websiteUrl}`,
          `contact: ${contactEmail}`,
          notes ? `notes: ${notes}` : null,
        ]
          .filter(Boolean)
          .join("\n");
        const appended = existing.adminNotes
          ? `${existing.adminNotes}\n\n${block}`
          : block;
        await prisma.auditOrder.update({
          where: { id: existing.id },
          data: { adminNotes: appended },
        });
      }
    } catch (err) {
      console.error(
        "[foundation-fix] failed to append adminNotes — continuing with email",
        err,
      );
    }
  }

  const adminEmailSent = await sendAdminNotification({
    businessName,
    websiteUrl,
    contactEmail,
    auditOrderId,
    notes,
    submittedAt,
  });
  const customerEmailSent = await sendCustomerConfirmation({
    businessName,
    contactEmail,
  });

  console.log(
    `[foundation-fix] request ok business="${businessName}" url="${websiteUrl}" orderId=${auditOrderId ?? "-"} adminEmail=${adminEmailSent} customerEmail=${customerEmailSent}`,
  );

  return NextResponse.json({ ok: true });
}

async function sendAdminNotification(args: {
  businessName: string;
  websiteUrl: string;
  contactEmail: string;
  auditOrderId: string | undefined;
  notes: string | undefined;
  submittedAt: Date;
}): Promise<boolean> {
  if (!isResendConfigured() || !ADMIN_NOTIFY_EMAIL) {
    console.warn(
      "[foundation-fix] Resend / admin email not configured — skipping admin notification",
    );
    return false;
  }
  try {
    const subject = `Foundation Fix request — ${args.businessName}`;
    const textBody = [
      `New Foundation Fix request`,
      ``,
      `Business: ${args.businessName}`,
      `Website: ${args.websiteUrl}`,
      `Contact: ${args.contactEmail}`,
      args.auditOrderId ? `Audit order: ${args.auditOrderId}` : null,
      args.notes ? `Notes: ${args.notes}` : null,
      ``,
      `Submitted: ${args.submittedAt.toISOString()}`,
    ]
      .filter(Boolean)
      .join("\n");
    const htmlBody = [
      `<p><strong>New Foundation Fix request</strong></p>`,
      `<p>`,
      `<strong>Business:</strong> ${escapeHtml(args.businessName)}<br/>`,
      `<strong>Website:</strong> ${escapeHtml(args.websiteUrl)}<br/>`,
      `<strong>Contact:</strong> ${escapeHtml(args.contactEmail)}<br/>`,
      args.auditOrderId
        ? `<strong>Audit order:</strong> ${escapeHtml(args.auditOrderId)}<br/>`
        : ``,
      `</p>`,
      args.notes
        ? `<p><strong>Notes:</strong><br/>${escapeHtml(args.notes).replace(/\n/g, "<br/>")}</p>`
        : ``,
      `<p style="color:#888;font-size:12px;">Submitted ${args.submittedAt.toISOString()}</p>`,
    ].join("");
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: ADMIN_NOTIFY_EMAIL,
      replyTo: args.contactEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return true;
  } catch (err) {
    console.error("[foundation-fix] admin email send failed", err);
    return false;
  }
}

async function sendCustomerConfirmation(args: {
  businessName: string;
  contactEmail: string;
}): Promise<boolean> {
  if (!isResendConfigured()) {
    console.warn(
      "[foundation-fix] Resend not configured — skipping customer confirmation",
    );
    return false;
  }
  try {
    const subject = "We received your AI Visibility Foundation Fix request";
    const textBody = [
      `Hi,`,
      ``,
      `Thanks for requesting an AI Visibility Foundation Fix for ${args.businessName}.`,
      ``,
      `We'll review your audit results and reply within one business day with a scoped setup plan. If your site needs custom scoping, we'll let you know in that reply.`,
      ``,
      `— The GeoViz team`,
    ].join("\n");
    const htmlBody = `
      <p>Hi,</p>
      <p>Thanks for requesting an AI Visibility Foundation Fix for <strong>${escapeHtml(args.businessName)}</strong>.</p>
      <p>We'll review your audit results and reply within one business day with a scoped setup plan. If your site needs custom scoping, we'll let you know in that reply.</p>
      <p>— The GeoViz team</p>
    `;
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: args.contactEmail,
      subject,
      text: textBody,
      html: htmlBody,
    });
    return true;
  } catch (err) {
    console.error("[foundation-fix] customer email send failed", err);
    return false;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
