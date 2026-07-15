import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { buildPdfBaseUrl, checkPdfOverflowForOrder } from "@/lib/generate-pdf";

/**
 * GET /api/admin/reports/[id]/overflow-check
 *
 * Admin-only QA probe: renders the real /report/[id]/print route in a
 * headless Chromium (same navigation as the customer PDF path) and
 * reports which .rd-page sections, if any, have content extending past
 * the printable-area boundary — before a human reviewer sends the
 * report. Generic across every report/page/component; see
 * src/lib/pdf-overflow-check.ts.
 *
 * Returns { violations: OverflowViolation[] }. Empty array means every
 * page fits within the printable area.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  const adminKey = readAdminKeyFromRequest(req);
  if (!isValidAdminKey(adminKey)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    select: { id: true, reportStatus: true, reportMarkdown: true },
  });
  if (!order || !order.reportMarkdown || order.reportStatus !== "generated") {
    return NextResponse.json(
      { error: "Report not available." },
      { status: 404 },
    );
  }

  const baseUrl = buildPdfBaseUrl(req);
  try {
    const violations = await checkPdfOverflowForOrder({
      orderId: order.id,
      baseUrl,
    });
    return NextResponse.json({ violations });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[overflow-check] orderId=${order.id} failed: ${message}`);
    return NextResponse.json(
      { error: "Overflow check failed." },
      { status: 500 },
    );
  }
}
