/* eslint-disable no-console */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import {
  isBenchmarkTag,
  isOperatorConfidence,
  isOperatorVerdict,
} from "@/lib/intelligence/calibration";

/**
 * PATCH /api/admin/audit-intelligence/[id]
 *
 * Updates the operator-judgment calibration fields on an existing
 * `AuditIntelligence` row, keyed by the parent `AuditOrder.id`.
 * Lightweight write — admin-gated, rate-limited, no scoring change.
 *
 * Accepted body shape (all optional; only sent keys are written):
 *
 *   {
 *     operatorVerdict?:    "accurate" | "slightly_high" | "too_high"
 *                          | "slightly_low" | "too_low" | null,
 *     operatorConfidence?: "high" | "medium" | "low" | null,
 *     benchmarkTag?:       "excellent_example" | "average_example"
 *                          | "weak_example" | "edge_case" | null,
 *     calibrationNotes?:   string | null,  // capped at 2000 chars
 *   }
 *
 * Sending `null` for any field clears it. Unknown values → 400. The
 * intelligence row must already exist (run the worker or the
 * backfill script first); we don't auto-create here because a row
 * built from no audit data would be missing the required `Json`
 * columns. 404 surfaces clearly if missing.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALIBRATION_NOTES_MAX = 2000;

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:audit-intelligence-update",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    console.warn(
      `[audit-intelligence-update] unauthorized for orderId=${params.id}`,
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    operatorVerdict?: unknown;
    operatorConfidence?: unknown;
    benchmarkTag?: unknown;
    calibrationNotes?: unknown;
  };
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Validate + build the update data object. Anything omitted from the
  // body is omitted from the update (Prisma will leave the column
  // unchanged). Sending `null` explicitly is how the operator clears
  // a field.
  const data: Record<string, string | null> = {};

  if ("operatorVerdict" in body) {
    const v = body.operatorVerdict;
    if (v === null) {
      data.operatorVerdict = null;
    } else if (typeof v === "string" && isOperatorVerdict(v)) {
      data.operatorVerdict = v;
    } else {
      return NextResponse.json(
        { error: "Invalid operatorVerdict value." },
        { status: 400 },
      );
    }
  }

  if ("operatorConfidence" in body) {
    const v = body.operatorConfidence;
    if (v === null) {
      data.operatorConfidence = null;
    } else if (typeof v === "string" && isOperatorConfidence(v)) {
      data.operatorConfidence = v;
    } else {
      return NextResponse.json(
        { error: "Invalid operatorConfidence value." },
        { status: 400 },
      );
    }
  }

  if ("benchmarkTag" in body) {
    const v = body.benchmarkTag;
    if (v === null) {
      data.benchmarkTag = null;
    } else if (typeof v === "string" && isBenchmarkTag(v)) {
      data.benchmarkTag = v;
    } else {
      return NextResponse.json(
        { error: "Invalid benchmarkTag value." },
        { status: 400 },
      );
    }
  }

  if ("calibrationNotes" in body) {
    const v = body.calibrationNotes;
    if (v === null) {
      data.calibrationNotes = null;
    } else if (typeof v === "string") {
      const trimmed = v.trim();
      if (trimmed.length > CALIBRATION_NOTES_MAX) {
        return NextResponse.json(
          {
            error: `calibrationNotes exceeds ${CALIBRATION_NOTES_MAX} chars.`,
          },
          { status: 400 },
        );
      }
      data.calibrationNotes = trimmed.length === 0 ? null : trimmed;
    } else {
      return NextResponse.json(
        { error: "Invalid calibrationNotes value." },
        { status: 400 },
      );
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No recognized fields in body." },
      { status: 400 },
    );
  }

  try {
    const updated = await prisma.auditIntelligence.update({
      where: { auditOrderId: params.id },
      data,
      select: {
        auditOrderId: true,
        operatorVerdict: true,
        operatorConfidence: true,
        benchmarkTag: true,
        calibrationNotes: true,
      },
    });
    console.log(
      `[audit-intelligence-update] orderId=${params.id} verdict=${updated.operatorVerdict ?? "-"} confidence=${updated.operatorConfidence ?? "-"} bench=${updated.benchmarkTag ?? "-"} notesBytes=${updated.calibrationNotes?.length ?? 0}`,
    );
    return NextResponse.json({ success: true, intelligence: updated });
  } catch (err) {
    // Prisma error code P2025 is "record to update not found." Surface
    // a clear 404 so the operator knows to run the backfill first.
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code: unknown }).code)
        : null;
    if (code === "P2025") {
      return NextResponse.json(
        {
          error:
            "AuditIntelligence row not found for this order. Run `npm run backfill:audit-intelligence` first.",
        },
        { status: 404 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[audit-intelligence-update] orderId=${params.id} failed: ${message}`,
    );
    return NextResponse.json(
      { error: "Update failed." },
      { status: 500 },
    );
  }
}
