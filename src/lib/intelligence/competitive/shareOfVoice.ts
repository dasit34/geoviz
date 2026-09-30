import { Prisma, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";

import type { ShareOfVoiceEntry, ShareOfVoiceResult } from "./types";
import { windowWhere } from "./windowWhere";

/**
 * ShareOfVoice(entity, industry, geo, window) =
 *   entity_mentions(entity) / SUM(entity_mentions(e) for every e named
 *   or audited in this industry/geo/window)
 *
 * where entity_mentions(entity) counts, over `competitive_capture`
 * Observation rows scoped to (industryNormalized, geographyRaw,
 * window):
 *   - +1 per Observation with `mentioned = true` and a linked
 *     `businessId` matching `entity` (a GeoViz-audited subject being
 *     named), and
 *   - +1 per `ObservationCompetitorMention` row with
 *     `competitorNormalized` matching `entity` (a named competitor).
 *
 * A plain ratio over counted appearances — reproducible at any time
 * from raw table rows, not a new score. See
 * `docs/COMPETITIVE_METRICS_FORMULAS.md`.
 */
export async function shareOfVoice(args: {
  prisma?: PrismaClient | Prisma.TransactionClient;
  industryNormalized: string;
  geographyRaw: string;
  windowDays?: number;
}): Promise<ShareOfVoiceResult> {
  const db = args.prisma ?? defaultPrisma;

  const scopedObservationWhere = {
    callType: "competitive_capture",
    mentioned: true,
    queryLibraryEntry: {
      industryNormalized: args.industryNormalized,
      geographyRaw: args.geographyRaw,
    },
    ...windowWhere(args.windowDays),
  } satisfies Prisma.ObservationWhereInput;

  const subjectRows = await db.observation.findMany({
    where: { ...scopedObservationWhere, businessId: { not: null } },
    select: { businessId: true },
  });
  const subjectCounts = new Map<string, number>();
  for (const row of subjectRows) {
    if (!row.businessId) continue;
    subjectCounts.set(row.businessId, (subjectCounts.get(row.businessId) ?? 0) + 1);
  }

  const competitorRows = await db.observationCompetitorMention.findMany({
    where: { observation: scopedObservationWhere },
    select: { competitorName: true, competitorNormalized: true },
  });
  const competitorCounts = new Map<string, { name: string; count: number }>();
  for (const row of competitorRows) {
    const existing = competitorCounts.get(row.competitorNormalized);
    if (existing) {
      existing.count += 1;
      existing.name = row.competitorName;
    } else {
      competitorCounts.set(row.competitorNormalized, {
        name: row.competitorName,
        count: 1,
      });
    }
  }

  const businessIds = [...subjectCounts.keys()];
  const businesses = businessIds.length
    ? await db.business.findMany({
        where: { id: { in: businessIds } },
        select: { id: true, normalizedDomain: true, primaryWebsiteUrl: true },
      })
    : [];
  const businessById = new Map(businesses.map((b) => [b.id, b]));

  const entities: ShareOfVoiceEntry[] = [];
  let totalMentions = 0;

  for (const [businessId, mentionCount] of subjectCounts) {
    const biz = businessById.get(businessId);
    entities.push({
      entityName: biz?.primaryWebsiteUrl ?? biz?.normalizedDomain ?? businessId,
      entityNormalized: biz?.normalizedDomain ?? businessId,
      isSubjectBusiness: true,
      mentionCount,
      share: 0,
    });
    totalMentions += mentionCount;
  }
  for (const [entityNormalized, { name, count }] of competitorCounts) {
    entities.push({
      entityName: name,
      entityNormalized,
      isSubjectBusiness: false,
      mentionCount: count,
      share: 0,
    });
    totalMentions += count;
  }

  for (const entity of entities) {
    entity.share = totalMentions === 0 ? 0 : entity.mentionCount / totalMentions;
  }
  entities.sort((a, b) => b.mentionCount - a.mentionCount);

  return {
    industryNormalized: args.industryNormalized,
    geographyRaw: args.geographyRaw,
    windowDays: args.windowDays ?? null,
    totalMentions,
    entities,
  };
}
