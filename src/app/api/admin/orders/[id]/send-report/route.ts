import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { getResend, FROM_EMAIL } from "@/lib/resend";
import { buildPdfBaseUrl, generateAuditPdf } from "@/lib/generate-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF generation can take 20–40s — bump beyond Vercel's default 10s.
export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    console.warn(`[admin-send] unauthorized request for orderId=${params.id}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let force = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    force = body.force === true;
  } catch {
    // ignore
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.reportStatus !== "generated" || !order.reportMarkdown) {
    console.warn(
      `[admin-send] orderId=${order.id} cannot send — reportStatus=${order.reportStatus}`,
    );
    return NextResponse.json(
      {
        error: "No generated report to send. Run the audit first.",
        reportStatus: order.reportStatus,
      },
      { status: 409 },
    );
  }

  if (order.reportSentToCustomerAt && !force) {
    console.log(
      `[admin-send] orderId=${order.id} report already sent at ${order.reportSentToCustomerAt.toISOString()} — skipping (pass force=true to resend)`,
    );
    return NextResponse.json(
      {
        status: "already-sent",
        sentAt: order.reportSentToCustomerAt,
        message:
          "Report already sent to customer. Pass {force:true} to resend.",
      },
      { status: 409 },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[admin-send] RESEND_API_KEY not set");
    return NextResponse.json(
      { error: "Email transport not configured (RESEND_API_KEY missing)." },
      { status: 503 },
    );
  }

  const businessLabel = order.businessName || order.websiteUrl;
  const subject = `Your GeoViz AI Visibility Report — ${businessLabel}`;
  const intro =
    `Hi,\n\n` +
    `Your AI Visibility Audit for ${businessLabel} is ready. The full report is below.\n\n` +
    `Reply to this email if you have any questions, or if you'd like us to implement the fixes for you (GEO Foundation Fix — $497).\n\n` +
    `— GeoViz\n\n---\n\n`;

  const body = intro + order.reportMarkdown;

  console.log(
    `[admin-send] sending report orderId=${order.id} to=${order.email}`,
  );

  // CC the admin notification address (if configured) so we have a copy of
  // every customer deliverable in the same inbox we monitor for new orders.
  const ccAddress = process.env.AUDIT_NOTIFICATION_EMAIL;
  const cc =
    ccAddress && ccAddress.toLowerCase() !== order.email.toLowerCase()
      ? [ccAddress]
      : undefined;

  // Generate the PDF attachment. If generation fails we still send the
  // text-only email (better deliverable than nothing) and log the failure
  // so the admin can re-send manually after fixing the underlying cause.
  let pdfBuffer: Buffer | undefined;
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    try {
      console.log(`[admin-send] generating PDF for orderId=${order.id}`);
      pdfBuffer = await generateAuditPdf({
        orderId: order.id,
        baseUrl: buildPdfBaseUrl(req),
        adminSecret,
      });
      console.log(
        `[admin-send] PDF ready orderId=${order.id} bytes=${pdfBuffer.length}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[admin-send] PDF generation failed orderId=${order.id} (sending text-only): ${message}`,
      );
    }
  } else {
    console.warn(
      "[admin-send] ADMIN_SECRET not set — skipping PDF attachment, sending text-only.",
    );
  }

  const attachments = pdfBuffer
    ? [
        {
          filename: pdfFilenameFor(order.id, order.businessName),
          content: pdfBuffer,
        },
      ]
    : undefined;

  let resendId: string | undefined;
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: order.email,
      cc,
      subject,
      text: body,
      attachments,
    });
    if (result.error) {
      console.error(
        `[admin-send] report email failed orderId=${order.id}: ${result.error.name} — ${result.error.message}`,
      );
      return NextResponse.json(
        { error: `${result.error.name}: ${result.error.message}` },
        { status: 502 },
      );
    }
    resendId = result.data?.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[admin-send] report email failed orderId=${order.id}: ${message}`,
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await prisma.auditOrder.update({
    where: { id: order.id },
    data: {
      reportSentToCustomerAt: new Date(),
      auditStatus: "completed",
    },
  });

  console.log(
    `[admin-send] report email sent orderId=${order.id} resendId=${resendId ?? "unknown"}`,
  );

  return NextResponse.json({
    status: "sent",
    to: order.email,
    resendId: resendId ?? null,
    attached: Boolean(pdfBuffer),
  });
}

function pdfFilenameFor(id: string, businessName: string | null): string {
  const slug =
    (businessName ?? "audit")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "audit";
  const shortId = id.slice(-6);
  return `geoviz-${slug}-${shortId}.pdf`;
}
