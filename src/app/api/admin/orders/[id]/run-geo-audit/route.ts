import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";

/**
 * Enqueue-only handler.
 *
 * IMPORTANT: This route MUST NOT spawn the GEO audit engine. Vercel
 * functions are serverless / short-lived / sandboxed and cannot run
 * `claude` CLI, the geo-seo-claude skill, or any long-running Python
 * pipeline. The actual audit runs out-of-band by `scripts/geo-worker.ts`
 * on a host that has the engine installed (your local machine, a Railway
 * worker, etc.).
 *
 * Lifecycle:
 *   admin clicks "Run GEO Audit"
 *     → this route flips reportStatus to "queued"
 *   worker polls
 *     → claims the row (queued → running)
 *     → spawns scripts/run-geo-audit.sh
 *     → writes reportMarkdown + sets reportStatus to "generated" or "failed"
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    // empty body is fine
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Already-generated guard. Pass {force:true} to re-queue.
  if (order.reportStatus === "generated" && !force) {
    console.log(
      `[admin-audit] orderId=${order.id} already generated — skipping enqueue`,
    );
    return NextResponse.json(
      {
        status: "already-generated",
        message:
          "Report already generated. Pass {force:true} to re-queue the audit.",
      },
      { status: 409 },
    );
  }

  // In-flight guard. The worker is already on it.
  if (order.reportStatus === "queued" || order.reportStatus === "running") {
    console.log(
      `[admin-audit] orderId=${order.id} already in flight (status=${order.reportStatus})`,
    );
    return NextResponse.json(
      {
        status: order.reportStatus,
        message: `Audit is already ${order.reportStatus}. The worker will pick it up — refresh in a minute.`,
      },
      { status: 409 },
    );
  }

  const updated = await prisma.auditOrder.update({
    where: { id: order.id },
    data: {
      reportStatus: "queued",
      reportQueuedAt: new Date(),
      reportError: null,
    },
  });

  console.log(
    `[admin-audit] queued orderId=${order.id} url=${order.websiteUrl} (force=${force})`,
  );

  return NextResponse.json({
    status: "queued",
    queuedAt: updated.reportQueuedAt,
    message:
      "Audit queued. Run `npm run geo-worker` on the host that has the GEO engine installed.",
  });
}
