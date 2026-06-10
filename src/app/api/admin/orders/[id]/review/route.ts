import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { sendCustomerSuccessEmail } from "@/lib/customer-emails";
import { isModelTestingComplete } from "@/lib/report/model-testing";
import { CALIBRATION_PREFIX } from "@/lib/calibration";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    allowIncompleteModels?: unknown;
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
    include: { intelligence: { select: { aiValidations: true } } },
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

  // Auto-send the customer "Report ready" email on the moment of
  // approval transition. Single-fire is enforced by the pre-update
  // reviewStatus check (must have been non-approved) plus the
  // !reportSentToCustomerAt guard. Failures here are non-fatal —
  // the operator can still hit the manual Send Report button.
  // Never auto-send a real paid report whose cross-model AI testing returned
  // NO usable results, unless the admin explicitly overrides. The approval is
  // still recorded; the operator must then send explicitly (with the
  // incomplete override). [CAL]/test orders are exempt.
  const allowIncompleteModels = body.allowIncompleteModels === true;
  const isTestOrder = (order.businessName ?? "").startsWith(CALIBRATION_PREFIX);
  const modelTestingComplete = isModelTestingComplete(
    order.intelligence?.aiValidations,
  );
  const modelGateBlocks =
    !isTestOrder && !allowIncompleteModels && !modelTestingComplete;

  const shouldAutoSend =
    reviewStatus === "approved" &&
    order.reviewStatus !== "approved" &&
    order.reportStatus === "generated" &&
    !order.reportSentToCustomerAt &&
    EMAIL_RE.test(order.email) &&
    !modelGateBlocks;

  if (modelGateBlocks && reviewStatus === "approved") {
    console.warn(
      `[admin-review] orderId=${order.id} approved but auto-send SKIPPED — model testing incomplete (0 usable cross-model results)`,
    );
  }

  if (shouldAutoSend) {
    try {
      const ok = await sendCustomerSuccessEmail({
        orderId: order.id,
        businessName: order.businessName,
        customerEmail: order.email,
        websiteUrl: order.websiteUrl,
      });
      if (ok) {
        await prisma.auditOrder.update({
          where: { id: order.id },
          data: {
            reportSentToCustomerAt: new Date(),
            sentTo: order.email,
            auditStatus: "completed",
          },
        });
        console.log(
          `[admin-review] auto-sent success email orderId=${order.id} to=${order.email}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[admin-review] auto-send error (non-fatal) orderId=${order.id}: ${message.slice(0, 200)}`,
      );
    }
  }

  return NextResponse.json({
    status: "saved",
    reviewStatus: updated.reviewStatus,
    adminNotes: updated.adminNotes,
    qualityScore: updated.qualityScore,
    modelTesting: modelTestingComplete ? "complete" : "incomplete",
    autoSendSkippedReason: modelGateBlocks ? "model_testing_incomplete" : null,
  });
}
