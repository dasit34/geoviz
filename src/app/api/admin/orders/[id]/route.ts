import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

/**
 * Reconciliation GET — returns the current DB state of one order.
 *
 * The admin card polls this every 5s while reportStatus is "queued" or
 * "running". After the worker writes back, the next poll surfaces the
 * new status without a manual page refresh.
 *
 * Returns ONLY the fields the card binds to. Never the metadata or the
 * full markdown unless the report has actually been generated.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  // Polling endpoint — the admin card hits this every 5s while a job
  // is queued/running. 5s polling × 5min window = 60 hits/5min from
  // one legitimate admin tab; 200 leaves headroom for two simultaneous
  // tabs + manual refreshes while still being an upper bound that
  // stops a runaway loop. Mutating admin routes use the tighter 20/5min.
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:orders",
    limit: 200,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      reportStatus: true,
      reportMarkdown: true,
      reportError: true,
      reportGeneratedAt: true,
      reportSentToCustomerAt: true,
      reviewStatus: true,
      adminNotes: true,
      qualityScore: true,
      sentTo: true,
      sentCc: true,
    },
  });

  if (!order) {
    return NextResponse.json(
      { success: false, error: "Order not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    success: true,
    order: {
      ...order,
      reportGeneratedAt: order.reportGeneratedAt
        ? order.reportGeneratedAt.toISOString()
        : null,
      reportSentToCustomerAt: order.reportSentToCustomerAt
        ? order.reportSentToCustomerAt.toISOString()
        : null,
    },
  });
}
