import { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";

import type { QueryOutcome, QueryWinLoss } from "./types";

/**
 * Per-provider win/loss for one business against one QueryLibraryEntry.
 * "Latest" = each provider's single most recent Observation for this
 * (business, query) pair — NEVER averaged across a provider's re-runs,
 * consistent with append-only-means-newest-wins-for-current-state reads
 * elsewhere in this codebase (e.g. RecommendationFrequency's upsert
 * pattern vs. AuditSnapshot's frozen-history pattern).
 *
 * win = latest.mentioned === true || latest.recommended === true
 */
export async function queryWinLoss(args: {
  prisma?: PrismaClient | Prisma.TransactionClient;
  businessId: string;
  queryLibraryEntryId: string;
}): Promise<QueryWinLoss> {
  const db = args.prisma ?? defaultPrisma;

  const rows = await db.observation.findMany({
    where: {
      businessId: args.businessId,
      queryLibraryEntryId: args.queryLibraryEntryId,
    },
    select: {
      provider: true,
      mentioned: true,
      recommended: true,
      observedAt: true,
    },
    orderBy: { observedAt: "desc" },
  });

  const latestByProvider = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByProvider.has(row.provider)) {
      latestByProvider.set(row.provider, row);
    }
  }

  const outcomes: QueryOutcome[] = [...latestByProvider.entries()].map(
    ([provider, row]) => ({
      provider,
      win: row.mentioned === true || row.recommended === true,
      observedAt: row.observedAt.toISOString(),
    }),
  );

  return {
    businessId: args.businessId,
    queryLibraryEntryId: args.queryLibraryEntryId,
    outcomes,
    wins: outcomes.filter((o) => o.win).length,
    losses: outcomes.filter((o) => !o.win).length,
  };
}
