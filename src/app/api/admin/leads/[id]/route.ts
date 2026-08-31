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

const STATUS_TIMESTAMP_FIELD: Record<string, string> = {
  CONTACTED: "contactedAt",
  RESPONDED: "respondedAt",
};

/** PATCH /api/admin/leads/[id] — edit fields / change status. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:update",
    limit: 120,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    status?: unknown;
    notes?: unknown;
    contactName?: unknown;
    contactTitle?: unknown;
    contactEmail?: unknown;
  } = {};
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    // ignore
  }

  const status = typeof body.status === "string" ? body.status : undefined;
  if (status !== undefined && !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${Array.from(ALLOWED_STATUSES).join(", ")}` },
      { status: 400 },
    );
  }

  const existing = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  const timestampField = status ? STATUS_TIMESTAMP_FIELD[status] : undefined;

  const updated = await prisma.lead.update({
    where: { id: params.id },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(typeof body.notes === "string" ? { notes: body.notes.slice(0, 4000) } : {}),
      ...(typeof body.contactName === "string" ? { contactName: body.contactName } : {}),
      ...(typeof body.contactTitle === "string" ? { contactTitle: body.contactTitle } : {}),
      ...(typeof body.contactEmail === "string" ? { contactEmail: body.contactEmail } : {}),
      ...(timestampField && !(existing as unknown as Record<string, unknown>)[timestampField]
        ? { [timestampField]: new Date() }
        : {}),
    },
  });

  console.log(`[admin-leads] updated id=${params.id} status=${updated.status}`);

  return NextResponse.json({ status: "saved", lead: updated });
}

/** DELETE /api/admin/leads/[id] — remove a bad lead entirely. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:leads:delete",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await prisma.lead.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  await prisma.lead.delete({ where: { id: params.id } });
  console.log(`[admin-leads] deleted id=${params.id}`);

  return NextResponse.json({ status: "deleted" });
}
