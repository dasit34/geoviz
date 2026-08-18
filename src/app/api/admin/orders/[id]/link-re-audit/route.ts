import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { findPreviousCompletedAuditOrderId } from "@/lib/audit-comparison/findPreviousAudit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/orders/[id]/link-re-audit
 *
 * Manual "link as re-audit" action for existing customers who already
 * have two completed audits from before automatic detection existed
 * (or where detection at checkout time didn't find a match for any
 * reason). Runs the exact same businessId-first/websiteUrl-fallback
 * lookup used at checkout — no separate matching logic, no backfill
 * migration needed. Never overwrites an existing link; never invents
 * one when no genuinely completed prior audit exists.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:link-re-audit",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.auditOrder.findUnique({ where: { id: params.id } });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.previousAuditOrderId) {
    return NextResponse.json(
      { error: "This order is already linked to a previous audit." },
      { status: 409 },
    );
  }

  const previousAuditOrderId = await findPreviousCompletedAuditOrderId({
    businessId: order.businessId,
    websiteUrl: order.websiteUrl,
    excludeOrderId: order.id,
  });

  if (!previousAuditOrderId) {
    return NextResponse.json(
      { error: "No completed prior audit found for this business." },
      { status: 404 },
    );
  }

  const updated = await prisma.auditOrder.update({
    where: { id: order.id },
    data: { previousAuditOrderId },
  });

  console.log(
    `[admin-link-re-audit] linked id=${order.id} previousAuditOrderId=${previousAuditOrderId}`,
  );

  return NextResponse.json({ status: "linked", order: updated });
}
