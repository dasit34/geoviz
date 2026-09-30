import { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";

import type { ModelOutcome, ModelWinLoss } from "./types";
import { windowWhere } from "./windowWhere";

/**
 * Per-provider win/loss for one business across ALL its queries in
 * scope. "Latest" = each provider's single most recent Observation in
 * the window — never averaged across re-runs (see `queryWinLoss`'s
 * doc comment for the same convention).
 *
 * win = latest.mentioned === true || latest.recommended === true
 */
export async function modelWinLoss(args: {
  prisma?: PrismaClient | Prisma.TransactionClient;
  businessId: string;
  windowDays?: number;
}): Promise<ModelWinLoss> {
  const db = args.prisma ?? defaultPrisma;

  const rows = await db.observation.findMany({
    where: { businessId: args.businessId, ...windowWhere(args.windowDays) },
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

  const outcomes: ModelOutcome[] = [...latestByProvider.entries()].map(
    ([provider, row]) => ({
      provider,
      win: row.mentioned === true || row.recommended === true,
      observedAt: row.observedAt.toISOString(),
    }),
  );

  return {
    businessId: args.businessId,
    windowDays: args.windowDays ?? null,
    outcomes,
    wins: outcomes.filter((o) => o.win).length,
    losses: outcomes.filter((o) => !o.win).length,
  };
}
