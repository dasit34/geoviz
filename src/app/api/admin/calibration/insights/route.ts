import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import {
  getCategoryWeaknessFrequency,
  getMostUnstableCategory,
  getScoreDistribution,
  type CategoryWeaknessFrequency,
  type UnstableCategoryFinding,
} from "@/lib/intelligence/benchmarks";
import { isValidAdminKey, readAdminKeyFromRequest } from "@/lib/admin-secret";
import { applyApiRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/calibration/insights
 *
 * Returns deterministic, evidence-based insight findings for the
 * Operator Insights panel. Pure read; never mutates. Auth +
 * rate-limit mirror /api/admin/calibration/replays.
 *
 * Each returned finding is a small structured object — the panel
 * itself formats them via printf-style templates. NO LLM
 * synthesis, NO speculative phrasing anywhere in this route or its
 * helpers.
 */

type DriftExtreme = {
  auditId: string;
  delta: number;
  createdAt: string;
  previousBand: string | null;
  currentBand: string | null;
};

type CohortWeakness = {
  industry: string;
  band: string;            // e.g. "Invisible" + "At Risk" — the < 50 bands
  pct: number;             // 0..100
  cohortSize: number;
  asOf: string;            // ISO timestamp
};

type InsightsResponse = {
  weakestCategoryFinding: CategoryWeaknessFrequency | null;
  cohortWeakness: CohortWeakness | null;
  mostUnstableCategory: UnstableCategoryFinding | null;
  largestPositiveDrift: DriftExtreme | null;
  largestNegativeDrift: DriftExtreme | null;
};

const MIN_COHORT_SIZE = 5;

async function findCohortWeakness(): Promise<CohortWeakness | null> {
  // Scan each distinct industry, compute % of its audits scoring
  // below 50 overall. Return the cohort with the highest %, gated
  // by minimum cohort size. Single helper call already does
  // industry-filtered distribution.
  const industries = await prisma.auditIntelligence.groupBy({
    by: ["industryCategoryNormalized"],
    _count: { _all: true },
    where: {
      industryCategoryNormalized: { not: null },
      overallScore: { not: null },
    },
    having: {
      industryCategoryNormalized: { not: null },
    },
  });

  let best: CohortWeakness | null = null;
  for (const ind of industries) {
    if (ind._count._all < MIN_COHORT_SIZE) continue;
    if (!ind.industryCategoryNormalized) continue;
    const dist = await getScoreDistribution({
      industry: ind.industryCategoryNormalized,
    });
    const total = dist.reduce((s, b) => s + b.count, 0);
    if (total < MIN_COHORT_SIZE) continue;
    const belowFifty = dist
      .filter((b) => b.band === "Invisible" || b.band === "At Risk")
      .reduce((s, b) => s + b.count, 0);
    const pct = Math.round((100 * belowFifty) / total);
    if (!best || pct > best.pct) {
      best = {
        industry: ind.industryCategoryNormalized,
        band: "below 50",
        pct,
        cohortSize: total,
        asOf: new Date().toISOString(),
      };
    }
  }
  return best;
}

async function findDriftExtremes(): Promise<{
  positive: DriftExtreme | null;
  negative: DriftExtreme | null;
}> {
  // Stored delta is a plain Int. Top + bottom by signed delta.
  const [topPos, topNeg] = await Promise.all([
    prisma.calibrationReplay.findFirst({
      where: { delta: { gt: 0 } },
      orderBy: { delta: "desc" },
      select: {
        auditId: true,
        delta: true,
        createdAt: true,
        previousBand: true,
        currentBand: true,
      },
    }),
    prisma.calibrationReplay.findFirst({
      where: { delta: { lt: 0 } },
      orderBy: { delta: "asc" },
      select: {
        auditId: true,
        delta: true,
        createdAt: true,
        previousBand: true,
        currentBand: true,
      },
    }),
  ]);
  const toExtreme = (
    r: typeof topPos | typeof topNeg,
  ): DriftExtreme | null =>
    r === null
      ? null
      : {
          auditId: r.auditId,
          delta: r.delta ?? 0,
          createdAt: r.createdAt.toISOString(),
          previousBand: r.previousBand,
          currentBand: r.currentBand,
        };
  return { positive: toExtreme(topPos), negative: toExtreme(topNeg) };
}

export async function GET(req: Request) {
  const limited = applyApiRateLimit({
    req,
    routeKey: "api:admin:calibration-insights",
    limit: 200,
    windowMs: 5 * 60_000,
  });
  if (limited) return limited;

  if (!isValidAdminKey(readAdminKeyFromRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [weaknessFrequency, drift, mostUnstable, cohortWeakness] =
      await Promise.all([
        getCategoryWeaknessFrequency(),
        findDriftExtremes(),
        getMostUnstableCategory({ sinceDays: 7, minObservations: 5 }),
        findCohortWeakness(),
      ]);

    const weakestCategoryFinding =
      weaknessFrequency.length > 0 ? weaknessFrequency[0] : null;

    const body: InsightsResponse = {
      weakestCategoryFinding,
      cohortWeakness,
      mostUnstableCategory: mostUnstable,
      largestPositiveDrift: drift.positive,
      largestNegativeDrift: drift.negative,
    };
    return NextResponse.json(body);
  } catch (err) {
    const e = err as Error;
    console.error(
      `[api:admin:calibration-insights] read failed: ${e.message?.slice(0, 200)}`,
    );
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
