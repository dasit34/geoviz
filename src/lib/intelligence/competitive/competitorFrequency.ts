import { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";

import type { CompetitorFrequencyEntry } from "./types";
import { windowWhere } from "./windowWhere";

/**
 * Ranked count of how often each competitor identity was named across
 * `competitive_capture` observations scoped to (industryNormalized,
 * geographyRaw, window). `competitorNormalized` is a best-effort
 * lowercase/trim match — documented partial entity resolution, not
 * full dedup (see `ObservationCompetitorMention`'s doc comment).
 */
export async function competitorFrequency(args: {
  prisma?: PrismaClient | Prisma.TransactionClient;
  industryNormalized: string;
  geographyRaw: string;
  windowDays?: number;
}): Promise<CompetitorFrequencyEntry[]> {
  const db = args.prisma ?? defaultPrisma;

  const rows = await db.observationCompetitorMention.findMany({
    where: {
      observation: {
        callType: "competitive_capture",
        queryLibraryEntry: {
          industryNormalized: args.industryNormalized,
          geographyRaw: args.geographyRaw,
        },
        ...windowWhere(args.windowDays),
      },
    },
    select: { competitorName: true, competitorNormalized: true },
  });

  const counts = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    const existing = counts.get(row.competitorNormalized);
    if (existing) {
      existing.count += 1;
      existing.name = row.competitorName;
    } else {
      counts.set(row.competitorNormalized, {
        name: row.competitorName,
        count: 1,
      });
    }
  }

  return [...counts.entries()]
    .map(([competitorNormalized, { name, count }]) => ({
      competitorNormalized,
      competitorName: name,
      mentionCount: count,
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount);
}
