import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { getResend, FROM_EMAIL } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  let resendId: string | undefined;
  try {
    const result = await getResend().emails.send({
      from: FROM_EMAIL,
      to: order.email,
      cc,
      subject,
      text: body,
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
  });
}
