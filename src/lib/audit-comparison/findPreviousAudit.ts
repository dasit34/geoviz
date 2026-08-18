/**
 * Finds the most recent COMPLETED prior audit for a business — the
 * one thing checkout order-creation and the admin "link as re-audit"
 * action both need. Mirrors the businessId-first/websiteUrl-fallback
 * pattern already proven in `src/lib/audit-intelligence.ts`'s
 * `score_stability_index` lookup — reused, not reinvented.
 *
 * "Appropriate" prior audit means: not the order being created/linked
 * itself, `reportStatus === "generated"`, and it actually has a
 * deterministic score to compare against (pre-`scoring@1.0.0` rows
 * have none — the comparison engine marks that section unavailable
 * rather than fabricating one, but there's no point linking to an
 * audit with nothing comparable in the first place).
 *
 * The websiteUrl fallback (when `businessId` is null — common, since
 * business-linking is fail-soft and not wired into every order-
 * creation path) matches on `normalizeDomain()` equality, NOT raw
 * `websiteUrl` string equality. Found via real production data: two
 * genuinely-the-same-business orders differed only by a trailing
 * slash (`https://www.flagstat.games` vs
 * `https://www.flagstat.games/`) — a raw string match would have
 * silently failed to link them. Domain equality is computed in JS
 * over a bounded candidate set (not a DB `contains`) specifically to
 * avoid any substring false-positive risk, e.g. a domain that happens
 * to contain another domain's name as a substring.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeDomain } from "@/lib/business/normalize-domain";

// Bounded scan size for the fallback path. Current table size is a
// few hundred rows total; this comfortably covers it. Revisit if
// audit volume grows enough that this stops being true.
const FALLBACK_SCAN_LIMIT = 500;

export async function findPreviousCompletedAuditOrderId(args: {
  businessId: string | null;
  websiteUrl: string;
  excludeOrderId?: string;
}): Promise<string | null> {
  const baseWhere = {
    reportStatus: "generated" as const,
    intelligence: { deterministicScore: { not: Prisma.JsonNull } },
    ...(args.excludeOrderId ? { id: { not: args.excludeOrderId } } : {}),
  };

  if (args.businessId) {
    const prior = await prisma.auditOrder.findFirst({
      where: { ...baseWhere, businessId: args.businessId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return prior?.id ?? null;
  }

  const targetDomain = normalizeDomain(args.websiteUrl);
  if (!targetDomain) return null;

  const candidates = await prisma.auditOrder.findMany({
    where: baseWhere,
    orderBy: { createdAt: "desc" },
    select: { id: true, websiteUrl: true },
    take: FALLBACK_SCAN_LIMIT,
  });

  const match = candidates.find(
    (c) => normalizeDomain(c.websiteUrl) === targetDomain,
  );
  return match?.id ?? null;
}
