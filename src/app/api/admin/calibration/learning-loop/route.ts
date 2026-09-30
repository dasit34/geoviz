import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import { buildAuditChain, computeChainDeltas } from "@/lib/calibration/before-after";
import { normalizeDomain } from "@/lib/business/normalize-domain";
import {
  costRuntimeObservation,
  industryWeaknessObservation,
  modelAgreementObservation,
  recommendationFrequencyObservation,
  reviewQueueObservation,
  scoreDriftObservation,
} from "@/lib/calibration/observations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/calibration/learning-loop
 *
 * Backs <CalibrationLearningLoopPanel>. Pure read; never mutates —
 * writes only happen via `scripts/calibration-batch-runner.ts`.
 * Returns `{ enabled: false }` (200, not an error) when
 * GEO_MODULE_CALIBRATION_ENGINE_ENABLED isn't "true", so the panel
 * can render a simple disabled state.
 *
 * Optional `?websiteUrl=` query param additionally returns a
 * before/after chain for that business. Prefers the durable
 * `businessId` link (Phase 1-2 monitoring foundation) when the domain
 * resolves to an existing Business; falls back to the historic
 * websiteUrl-equality convention for domains not yet linked (unlinked
 * historic rows, or a domain that's simply never been looked up here
 * before) so behavior for unbackfilled data is unchanged.
 */

const BATCH_HISTORY_LIMIT = 20;
const LEADERBOARD_LIMIT = 25;

function isEnabled(): boolean {
  return process.env.GEO_MODULE_CALIBRATION_ENGINE_ENABLED === "true";
}

export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:calibration-learning-loop",
    limit: 200,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  try {
    const url = new URL(req.url);
    const websiteUrl = url.searchParams.get("websiteUrl");

    const [batchHistory, recommendationLeaderboard, industryLeaderboard, reviewQueueRows] =
      await Promise.all([
        prisma.calibrationBatch.findMany({
          orderBy: { batchNumber: "desc" },
          take: BATCH_HISTORY_LIMIT,
        }),
        prisma.recommendationFrequency.findMany({
          orderBy: { timesGenerated: "desc" },
          take: LEADERBOARD_LIMIT,
        }),
        prisma.industryBenchmarks.findMany({
          orderBy: { auditCount: "desc" },
          take: LEADERBOARD_LIMIT,
        }),
        prisma.auditSnapshot.findMany({
          where: { needsReview: true, reviewResolvedAt: null },
          orderBy: { snapshotAt: "desc" },
          take: 100,
          select: {
            auditOrderId: true,
            websiteUrl: true,
            businessName: true,
            needsReviewReasons: true,
            snapshotAt: true,
          },
        }),
      ]);

    const [latest, previous] = batchHistory;
    const latestObservations: string[] = [];
    if (latest) {
      const overallRecFreq = (
        latest.recommendationFrequency as unknown as Array<{ id: string; count: number }>
      ).slice(0, 5);
      for (const { id, count } of overallRecFreq) {
        latestObservations.push(
          recommendationFrequencyObservation({
            recommendationId: id,
            count,
            batchSize: latest.batchSize,
            batchNumber: latest.batchNumber,
          }),
        );
      }
      for (const row of industryLeaderboard) {
        if (row.avgScore === null || latest.avgScore === null) continue;
        latestObservations.push(
          industryWeaknessObservation({
            industry: row.industry,
            avgScore: row.avgScore,
            corpusAvg: latest.avgScore,
            count: row.auditCount,
          }),
        );
      }
      latestObservations.push(
        scoreDriftObservation({
          batchNumber: latest.batchNumber,
          currentAvg: latest.avgScore,
          previousAvg: previous?.avgScore ?? null,
        }),
      );
      latestObservations.push(
        modelAgreementObservation({
          batchNumber: latest.batchNumber,
          currentPct: latest.modelAgreementPct,
          previousPct: previous?.modelAgreementPct ?? null,
        }),
      );
      const reasonCounts: Record<string, number> = {};
      for (const row of reviewQueueRows) {
        for (const reason of row.needsReviewReasons as unknown as string[]) {
          reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
        }
      }
      latestObservations.push(
        reviewQueueObservation({
          batchNumber: latest.batchNumber,
          needsReviewCount: latest.needsReviewCount,
          reasonCounts,
        }),
      );
      latestObservations.push(
        costRuntimeObservation({
          batchNumber: latest.batchNumber,
          avgCostUsd: latest.avgCostUsd === null ? null : Number(latest.avgCostUsd),
          avgRuntimeMs: latest.avgRuntimeMs,
          previousAvgCostUsd:
            previous?.avgCostUsd === undefined || previous?.avgCostUsd === null
              ? null
              : Number(previous.avgCostUsd),
          previousAvgRuntimeMs: previous?.avgRuntimeMs ?? null,
        }),
      );
    }

    let beforeAfter: {
      websiteUrl: string;
      chain: ReturnType<typeof buildAuditChain>;
      deltas: ReturnType<typeof computeChainDeltas>;
    } | null = null;
    if (websiteUrl) {
      const domain = normalizeDomain(websiteUrl);
      const business = domain
        ? await prisma.business.findUnique({ where: { normalizedDomain: domain } })
        : null;
      const orders = await prisma.auditOrder.findMany({
        where: business ? { businessId: business.id } : { websiteUrl },
        orderBy: { createdAt: "asc" },
        include: {
          intelligence: { select: { overallScore: true, deterministicScore: true } },
        },
      });
      const chain = buildAuditChain(orders);
      beforeAfter = { websiteUrl, chain, deltas: computeChainDeltas(chain) };
    }

    return NextResponse.json({
      enabled: true,
      batchHistory: batchHistory.map((b) => ({
        batchNumber: b.batchNumber,
        batchSize: b.batchSize,
        computedAt: b.computedAt.toISOString(),
        avgScore: b.avgScore,
        medianScore: b.medianScore,
        avgRuntimeMs: b.avgRuntimeMs,
        avgCostUsd: b.avgCostUsd === null ? null : Number(b.avgCostUsd),
        modelAgreementPct: b.modelAgreementPct,
        failureCount: b.failureCount,
        needsReviewCount: b.needsReviewCount,
        reportPath: b.reportPath,
      })),
      recommendationLeaderboard,
      industryLeaderboard,
      reviewQueue: reviewQueueRows.map((r) => ({
        auditOrderId: r.auditOrderId,
        websiteUrl: r.websiteUrl,
        businessName: r.businessName,
        reasons: r.needsReviewReasons as unknown as string[],
        snapshotAt: r.snapshotAt.toISOString(),
      })),
      latestObservations,
      beforeAfter,
    });
  } catch (err) {
    const e = err as Error;
    console.error(
      `[api:admin:calibration-learning-loop] read failed: ${e.message?.slice(0, 200)}`,
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/calibration/learning-loop
 * Body: { auditSnapshotId: string }
 *
 * Marks an auto-flagged AuditSnapshot as resolved (sets
 * `reviewResolvedAt`). This is the queue's own resolution action,
 * distinct from — and additional to — the existing operatorVerdict
 * tagging editor already in the cockpit. Does not touch
 * AuditIntelligence or any scoring field.
 */
export async function PATCH(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:calibration-learning-loop-patch",
    limit: 200,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isEnabled()) {
    return NextResponse.json({ error: "Calibration Engine disabled" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as { auditSnapshotId?: unknown };
    const auditSnapshotId =
      typeof body.auditSnapshotId === "string" ? body.auditSnapshotId : null;
    if (!auditSnapshotId) {
      return NextResponse.json({ error: "auditSnapshotId required" }, { status: 400 });
    }

    await prisma.auditSnapshot.update({
      where: { id: auditSnapshotId },
      data: { reviewResolvedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const e = err as Error;
    console.error(
      `[api:admin:calibration-learning-loop] patch failed: ${e.message?.slice(0, 200)}`,
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
