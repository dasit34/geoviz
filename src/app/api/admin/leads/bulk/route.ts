import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set([
  "NEW",
  "QUALIFIED",
  "NOT_QUALIFIED",
  "READY_FOR_CONTACT",
  "CONTACTED",
  "RESPONDED",
  "FREE_CHECK",
  "AUDIT_PURCHASED",
  "CLOSED",
  "DO_NOT_CONTACT",
]);

const MAX_BULK_IDS = 500;

/**
 * POST /api/admin/leads/bulk — bulk status-change (or bulk delete)
 * over a set of selected lead ids. `{ ids: string[], status?: string,
 * delete?: true }` — exactly one of `status`/`delete` per request.
 */
export async function POST(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:bulk",
    limit: 30,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: unknown; status?: unknown; delete?: unknown } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids[] is required" }, { status: 400 });
  }
  if (ids.length > MAX_BULK_IDS) {
    return NextResponse.json(
      { error: `ids[] exceeds max of ${MAX_BULK_IDS}` },
      { status: 400 },
    );
  }

  if (body.delete === true) {
    const result = await prisma.lead.deleteMany({ where: { id: { in: ids } } });
    console.log(`[admin-leads] bulk deleted count=${result.count}`);
    return NextResponse.json({ status: "deleted", count: result.count });
  }

  const status = typeof body.status === "string" ? body.status : undefined;
  if (!status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}` },
      { status: 400 },
    );
  }

  const result = await prisma.lead.updateMany({
    where: { id: { in: ids } },
    data: { status },
  });
  console.log(`[admin-leads] bulk status=${status} count=${result.count}`);

  return NextResponse.json({ status: "saved", count: result.count });
}
