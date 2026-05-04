import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { runGeoAudit } from "@/lib/run-geo-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The audit can take a couple of minutes — bump the maxDuration so the
// route doesn't get killed by the platform-default 10s timeout. Vercel
// honors this; on other hosts it's a no-op.
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    console.warn(`[admin-audit] unauthorized request for orderId=${params.id}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let force = false;
  try {
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    force = body.force === true;
  } catch {
    // ignore — empty body is allowed
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.reportStatus === "generated" && !force) {
    console.log(
      `[admin-audit] orderId=${order.id} already generated — skipping (pass force=true to re-run)`,
    );
    return NextResponse.json(
      {
        status: "already-generated",
        message:
          "Report already generated. Pass {force:true} to re-run the audit.",
        markdown: order.reportMarkdown,
      },
      { status: 409 },
    );
  }

  console.log(
    `[admin-audit] audit started orderId=${order.id} url=${order.websiteUrl}`,
  );

  await prisma.auditOrder.update({
    where: { id: order.id },
    data: { reportStatus: "running", reportError: null },
  });

  const result = await runGeoAudit(order.websiteUrl, {
    competitorUrl: order.competitorUrl,
  });

  console.log(`[admin-audit] audit command: ${result.command}`);

  if (result.ok) {
    console.log(
      `[admin-audit] audit completed orderId=${order.id} bytes=${result.markdown.length}`,
    );
    const updated = await prisma.auditOrder.update({
      where: { id: order.id },
      data: {
        reportStatus: "generated",
        reportMarkdown: result.markdown,
        reportError: null,
        reportGeneratedAt: new Date(),
      },
    });
    return NextResponse.json({
      status: "generated",
      generatedAt: updated.reportGeneratedAt,
      bytes: result.markdown.length,
      markdown: result.markdown,
    });
  }

  const errorMsg = result.stderr
    ? `${result.error}\n---stderr---\n${result.stderr}`
    : result.error;

  console.error(
    `[admin-audit] audit failed orderId=${order.id}: ${result.error}`,
  );

  await prisma.auditOrder.update({
    where: { id: order.id },
    data: {
      reportStatus: "failed",
      reportError: errorMsg,
    },
  });

  return NextResponse.json(
    { status: "failed", error: result.error, stderr: result.stderr },
    { status: 500 },
  );
}
