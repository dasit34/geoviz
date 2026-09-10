import { NextResponse } from "next/server";

import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import {
  MARKET_STUDY_MAX_BATCH,
  MARKET_STUDY_QUEUED_AT,
  MARKET_STUDY_SESSION_PREFIX,
} from "@/lib/market-studies/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/market-studies/[id]/retry-failed
 *
 * Re-queues the audit orders of every FAILED entry in the study. No
 * new orders, no new provider spend beyond the retried audits — just
 * flips `reportStatus` back to "queued" (with the backdated
 * `reportQueuedAt` so customers still win). Bounded to
 * MARKET_STUDY_MAX_BATCH per call.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:market-studies:retry",
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (limited) return limited;
  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const study = await prisma.marketStudy.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!study) {
    return NextResponse.json({ error: "Study not found" }, { status: 404 });
  }

  const failed = await prisma.marketStudyEntry.findMany({
    where: {
      studyId: params.id,
      auditOrder: {
        stripeSessionId: { startsWith: MARKET_STUDY_SESSION_PREFIX },
        reportStatus: "failed",
      },
    },
    select: { auditOrderId: true },
    take: MARKET_STUDY_MAX_BATCH,
  });
  const orderIds = failed
    .map((e) => e.auditOrderId)
    .filter((x): x is string => Boolean(x));

  if (orderIds.length === 0) {
    return NextResponse.json({ requeued: 0 });
  }

  const res = await prisma.auditOrder.updateMany({
    where: { id: { in: orderIds }, reportStatus: "failed" },
    data: {
      reportStatus: "queued",
      reportQueuedAt: MARKET_STUDY_QUEUED_AT,
      reportStartedAt: null,
      reportError: null,
      failureReason: null,
    },
  });

  console.log(
    `[market-study] retry-failed studyId=${params.id} requeued=${res.count}`,
  );
  return NextResponse.json({ requeued: res.count });
}
