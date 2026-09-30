import { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";

import type { MentionRate } from "./types";
import { windowWhere } from "./windowWhere";

/**
 * MentionRate(business, window) = mentionedCount / totalObservations
 * over Observation rows for this business where `mentioned` is
 * non-null (i.e. `callType = "competitive_capture"` rows only — the
 * only call type with a real mention signal; `self_assessment` rows
 * always have `mentioned = null` and are excluded here, not counted
 * as "not mentioned").
 */
export async function mentionRate(args: {
  prisma?: PrismaClient | Prisma.TransactionClient;
  businessId: string;
  windowDays?: number;
}): Promise<MentionRate> {
  const db = args.prisma ?? defaultPrisma;
  const rows = await db.observation.findMany({
    where: {
      businessId: args.businessId,
      mentioned: { not: null },
      ...windowWhere(args.windowDays),
    },
    select: { mentioned: true },
  });

  const totalObservations = rows.length;
  const mentionedCount = rows.filter((r) => r.mentioned === true).length;

  return {
    businessId: args.businessId,
    totalObservations,
    mentionedCount,
    rate: totalObservations === 0 ? null : mentionedCount / totalObservations,
  };
}
