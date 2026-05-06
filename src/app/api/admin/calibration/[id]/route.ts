import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import {
  CALIBRATION_PREFIX,
  parseCalibrationNotes,
  stringifyCalibrationNotes,
} from "@/lib/calibration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH  /api/admin/calibration/[id]   — set expectedScore / notes.
 * DELETE /api/admin/calibration/[id]   — remove a calibration row.
 *
 * Both routes require admin auth and refuse to operate on rows that
 * don't carry the calibration prefix, so a stray request can't
 * mutate or delete a real customer order.
 */

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order || !order.businessName?.startsWith(CALIBRATION_PREFIX)) {
    return NextResponse.json(
      { error: "Calibration entry not found" },
      { status: 404 },
    );
  }

  let body: { expected?: number | null; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const existing = parseCalibrationNotes(order.adminNotes) ?? {
    expected: null,
  };
  const next = stringifyCalibrationNotes({
    expected:
      body.expected === null
        ? null
        : typeof body.expected === "number"
          ? clamp(Math.round(body.expected), 0, 100)
          : existing.expected,
    notes:
      typeof body.notes === "string" || body.notes === null
        ? body.notes
        : existing.notes ?? null,
  });

  await prisma.auditOrder.update({
    where: { id: order.id },
    data: { adminNotes: next },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const order = await prisma.auditOrder.findUnique({
    where: { id: params.id },
  });
  if (!order || !order.businessName?.startsWith(CALIBRATION_PREFIX)) {
    return NextResponse.json(
      { error: "Calibration entry not found" },
      { status: 404 },
    );
  }

  await prisma.auditOrder.delete({ where: { id: order.id } });
  console.log(`[calibration] deleted orderId=${order.id}`);
  return NextResponse.json({ ok: true });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
