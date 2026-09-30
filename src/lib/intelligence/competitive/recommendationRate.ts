import { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";

import type { RecommendationRate } from "./types";
import { windowWhere } from "./windowWhere";

/**
 * RecommendationRate(business, window) = recommendedCount / totalObservations
 * over Observation rows for this business where `recommended` is
 * non-null (i.e. `callType = "self_assessment"` rows only —
 * `competitive_capture` rows always have `recommended = null` and are
 * excluded here, not counted as "not recommended").
 */
export async function recommendationRate(args: {
  prisma?: PrismaClient | Prisma.TransactionClient;
  businessId: string;
  windowDays?: number;
}): Promise<RecommendationRate> {
  const db = args.prisma ?? defaultPrisma;
  const rows = await db.observation.findMany({
    where: {
      businessId: args.businessId,
      recommended: { not: null },
      ...windowWhere(args.windowDays),
    },
    select: { recommended: true },
  });

  const totalObservations = rows.length;
  const recommendedCount = rows.filter((r) => r.recommended === true).length;

  return {
    businessId: args.businessId,
    totalObservations,
    recommendedCount,
    rate:
      totalObservations === 0 ? null : recommendedCount / totalObservations,
  };
}
