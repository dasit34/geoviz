import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";
import {
  mentionRate,
  recommendationRate,
  modelWinLoss,
  shareOfVoice,
  competitorFrequency,
} from "@/lib/intelligence/competitive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/evidence/stats
 *
 * Backs <AdminEvidencePanel>. Pure read; never mutates — all writes
 * to the evidence layer happen only via
 * `persistObservationEvidence` during normal audit processing.
 * Returns `{ enabled: false }` (200, not an error) when
 * GEO_EVIDENCE_LAYER_ENABLED isn't "true", mirroring
 * `/api/admin/calibration/learning-loop`'s convention.
 *
 * Query params:
 *   businessId          — scopes mentionRate/recommendationRate/modelWinLoss
 *   industryNormalized  — scopes shareOfVoice/competitorFrequency
 *   geographyRaw         (both required together; auto-derived from
 *                         businessId's most recent competitive_capture
 *                         observation when omitted)
 *   windowDays          — optional recency window for all metrics
 */

function isEnabled(): boolean {
  return process.env.GEO_EVIDENCE_LAYER_ENABLED === "true";
}

export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:evidence-stats",
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
    const businessId = url.searchParams.get("businessId");
    let industryNormalized = url.searchParams.get("industryNormalized");
    let geographyRaw = url.searchParams.get("geographyRaw");
    const windowDaysParam = url.searchParams.get("windowDays");
    const windowDays =
      windowDaysParam && Number.isFinite(Number(windowDaysParam))
        ? Number(windowDaysParam)
        : undefined;

    // Auto-derive industry/geo scope from the business's most recent
    // competitive_capture observation when not explicitly supplied —
    // lets the panel work from just a businessId in the common case.
    if (businessId && (!industryNormalized || !geographyRaw)) {
      const recent = await prisma.observation.findFirst({
        where: { businessId, callType: "competitive_capture" },
        orderBy: { observedAt: "desc" },
        select: {
          queryLibraryEntry: {
            select: { industryNormalized: true, geographyRaw: true },
          },
        },
      });
      industryNormalized = industryNormalized ?? recent?.queryLibraryEntry?.industryNormalized ?? null;
      geographyRaw = geographyRaw ?? recent?.queryLibraryEntry?.geographyRaw ?? null;
    }

    const [mention, recommendation, models] = businessId
      ? await Promise.all([
          mentionRate({ businessId, windowDays }),
          recommendationRate({ businessId, windowDays }),
          modelWinLoss({ businessId, windowDays }),
        ])
      : [null, null, null];

    const [voice, frequency] =
      industryNormalized && geographyRaw
        ? await Promise.all([
            shareOfVoice({ industryNormalized, geographyRaw, windowDays }),
            competitorFrequency({ industryNormalized, geographyRaw, windowDays }),
          ])
        : [null, null];

    return NextResponse.json({
      enabled: true,
      businessId: businessId ?? null,
      industryNormalized: industryNormalized ?? null,
      geographyRaw: geographyRaw ?? null,
      windowDays: windowDays ?? null,
      mentionRate: mention,
      recommendationRate: recommendation,
      modelWinLoss: models,
      shareOfVoice: voice,
      competitorFrequency: frequency,
    });
  } catch (err) {
    const e = err as Error;
    console.error(
      `[api:admin:evidence-stats] read failed: ${e.message?.slice(0, 200)}`,
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
