import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["pending", "approved", "needs_changes"]);

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:review",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    console.warn(`[admin-review] unauthorized request for orderId=${params.id}`);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    reviewStatus?: unknown;
    adminNotes?: unknown;
    qualityScore?: unknown;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const reviewStatus =
    typeof body.reviewStatus === "string" ? body.reviewStatus : undefined;
  if (reviewStatus !== undefined && !ALLOWED_STATUSES.has(reviewStatus)) {
    return NextResponse.json(
      {
        error: `reviewStatus must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}`,
      },
      { status: 400 },
    );
  }

  const adminNotes =
    typeof body.adminNotes === "string"
      ? body.adminNotes.slice(0, 4000)
      : undefined;

  let qualityScore: number | null | undefined;
  if (body.qualityScore === null) {
    qualityScore = null;
  } else if (typeof body.qualityScore === "number") {
    if (
      Number.isNaN(body.qualityScore) ||
      body.qualityScore < 0 ||
      body.qualityScore > 10
    ) {
      return NextResponse.json(
        { error: "qualityScore must be 0–10 or null" },
        { status: 400 },
      );
    }
    qualityScore = Math.round(body.qualityScore);
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const updated = await prisma.auditOrder.update({
    where: { id: order.id },
    data: {
      ...(reviewStatus !== undefined ? { reviewStatus } : {}),
      ...(adminNotes !== undefined ? { adminNotes } : {}),
      ...(qualityScore !== undefined ? { qualityScore } : {}),
    },
  });

  console.log(
    `[admin-review] saved orderId=${order.id} status=${updated.reviewStatus} score=${updated.qualityScore ?? "—"}`,
  );

  return NextResponse.json({
    status: "saved",
    reviewStatus: updated.reviewStatus,
    adminNotes: updated.adminNotes,
    qualityScore: updated.qualityScore,
  });
}
