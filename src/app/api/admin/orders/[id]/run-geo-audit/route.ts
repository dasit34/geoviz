import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { getDbFingerprint } from "@/lib/db-fingerprint";

/**
 * Enqueue-only handler.
 *
 * Vercel functions can't run the GEO audit engine — the worker
 * (`scripts/geo-worker.ts`) does that out-of-band. This route flips
 * the row's reportStatus to "queued" and the worker picks it up.
 *
 * Always returns JSON of shape:
 *   {
 *     success: boolean,
 *     orderId: string,
 *     previousStatus: string,
 *     newStatus: string,
 *     dbHost: string | null,         // host:port/dbname (no creds)
 *     status: "queued" | "already-generated" | "queued" | "running" | "error",
 *     message?: string,
 *     queuedAt?: string,
 *   }
 *
 * The dbHost fingerprint is included so an operator can compare what
 * Vercel writes against what the local worker sees — same fingerprint
 * means same database.
 *
 * Rate limiting: this route is admin-gated (`ADMIN_SECRET`) so abuse
 * surface is small. A worker-side guard already prevents duplicate
 * concurrent runs on the same order. No per-IP throttle needed here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const fp = getDbFingerprint();
  const dbHost = fp ? fp.fingerprint : null;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    console.warn(`[admin-audit] unauthorized request for orderId=${params.id}`);
    return NextResponse.json(
      { success: false, error: "Unauthorized", dbHost },
      { status: 401 },
    );
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
    return NextResponse.json(
      {
        success: false,
        orderId: params.id,
        error: "Order not found",
        dbHost,
      },
      { status: 404 },
    );
  }

  const previousStatus = order.reportStatus;

  // Already-generated guard. Pass {force:true} to re-queue.
  if (order.reportStatus === "generated" && !force) {
    console.log(
      `[admin-audit] orderId=${order.id} already generated — not re-queueing (force=false)`,
    );
    return NextResponse.json(
      {
        success: false,
        status: "already-generated",
        orderId: order.id,
        previousStatus,
        newStatus: previousStatus,
        dbHost,
        message:
          "Report already generated. Pass {force:true} to re-queue the audit.",
      },
      { status: 409 },
    );
  }

  // In-flight guard — worker is already on it.
  if (order.reportStatus === "queued" || order.reportStatus === "running") {
    console.log(
      `[admin-audit] orderId=${order.id} already in flight (status=${order.reportStatus})`,
    );
    return NextResponse.json(
      {
        success: false,
        status: order.reportStatus,
        orderId: order.id,
        previousStatus,
        newStatus: previousStatus,
        dbHost,
        message: `Audit is already ${order.reportStatus}. The worker will pick it up — refresh in a minute.`,
      },
      { status: 409 },
    );
  }

  // Allowed to (re)queue from: pending, failed, or generated+force.
  console.log(
    `[admin-audit] BEFORE update orderId=${order.id} previousStatus=${previousStatus} url=${order.websiteUrl} force=${force} dbHost=${dbHost ?? "unknown"}`,
  );

  let updated;
  try {
    updated = await prisma.auditOrder.update({
      where: { id: order.id },
      data: {
        reportStatus: "queued",
        reportQueuedAt: new Date(),
        reportError: null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[admin-audit] UPDATE FAILED orderId=${order.id} error=${message}`,
    );
    return NextResponse.json(
      {
        success: false,
        status: "error",
        orderId: order.id,
        previousStatus,
        newStatus: previousStatus,
        dbHost,
        error: `Database update failed: ${message}`,
      },
      { status: 500 },
    );
  }

  console.log(
    `[admin-audit] AFTER update orderId=${order.id} dbReportStatus=${updated.reportStatus} reportQueuedAt=${updated.reportQueuedAt?.toISOString() ?? "null"}`,
  );

  const responsePayload = {
    success: true,
    status: "queued" as const,
    orderId: order.id,
    previousStatus,
    newStatus: updated.reportStatus,
    dbHost,
    queuedAt: updated.reportQueuedAt,
    message:
      "Audit queued. The worker will pick it up within ~12s.",
  };

  console.log(
    `[admin-audit] RETURNING orderId=${order.id} success=true newStatus=${updated.reportStatus}`,
  );

  return NextResponse.json(responsePayload);
}
