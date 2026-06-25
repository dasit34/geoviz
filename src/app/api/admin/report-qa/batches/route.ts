import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type BatchSummary = {
  batchId: string | null;
  label: string;
  createdAt: string;
  total: number;
  generated: number;
  failed: number;
  reviewed: number;
  needsFix: number;
};

export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:report-qa:batches",
    limit: 60,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const orders = await prisma.auditOrder.findMany({
    where: { businessName: { startsWith: "[CAL]" } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      calibrationBatchId: true,
      createdAt: true,
      reportStatus: true,
      reviewStatus: true,
    },
  });

  // Group in-memory — 500 rows is trivial to sort client-side in the API handler.
  const groups = new Map<string, typeof orders>();
  for (const o of orders) {
    const key = o.calibrationBatchId ?? "__legacy__";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(o);
  }

  const batches: BatchSummary[] = Array.from(groups.entries()).map(
    ([key, rows]) => {
      const newest = rows.reduce((a, b) =>
        a.createdAt > b.createdAt ? a : b,
      );
      return {
        batchId: key === "__legacy__" ? null : key,
        label:
          key === "__legacy__"
            ? "Legacy (pre-batchId orders)"
            : key,
        createdAt: newest.createdAt.toISOString(),
        total: rows.length,
        generated: rows.filter((r) => r.reportStatus === "generated").length,
        failed: rows.filter((r) => r.reportStatus === "failed").length,
        reviewed: rows.filter((r) => r.reviewStatus === "approved").length,
        needsFix: rows.filter((r) => r.reviewStatus === "needs_changes").length,
      };
    },
  );

  // Most-recent batch first.
  batches.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  console.log(
    `[report-qa] batches GET total_orders=${orders.length} batch_count=${batches.length}`,
  );

  return NextResponse.json({ batches });
}
