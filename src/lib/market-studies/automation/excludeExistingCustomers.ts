/**
 * Daily Market Study automation — "existing customer" exclusion.
 *
 * `classifyLeadForAudit()` (the shared Market Study eligibility gate)
 * deliberately does not check this — it only blocks
 * DO_NOT_CONTACT/CLOSED leads and in-study/recent-audit dedup. That's
 * correct for the manual admin flow (an operator hand-picking leads
 * knows what they're doing) but wrong for an unattended daily job,
 * which should never re-spend on a business that already paid for a
 * real audit. This is a new, additive pre-filter layered IN FRONT OF
 * the existing, unmodified eligibility/enqueue functions — it does
 * not touch `eligibility.ts` or affect the manual Market Study UI.
 */

import type { PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";
import { isMarketStudyOrder } from "@/lib/market-studies/isMarketStudyOrder";

/**
 * Returns the subset of `leadIds` whose linked `Business` already has
 * at least one real, paid `AuditOrder` (i.e. NOT a market-study
 * synthetic order — a business that has already been through Market
 * Study itself is not "an existing customer").
 */
export async function findExistingCustomerLeadIds(
  leadIds: string[],
  prisma: PrismaClient = defaultPrisma,
): Promise<Set<string>> {
  if (leadIds.length === 0) return new Set();

  const leads = await prisma.lead.findMany({
    where: { id: { in: leadIds }, businessId: { not: null } },
    select: { id: true, businessId: true },
  });
  const businessIds = Array.from(
    new Set(leads.map((l) => l.businessId).filter((id): id is string => Boolean(id))),
  );
  if (businessIds.length === 0) return new Set();

  const paidOrders = await prisma.auditOrder.findMany({
    where: { businessId: { in: businessIds }, paymentStatus: "paid" },
    select: { businessId: true, stripeSessionId: true },
  });

  const existingCustomerBusinessIds = new Set(
    paidOrders
      .filter((o) => !isMarketStudyOrder(o.stripeSessionId))
      .map((o) => o.businessId)
      .filter((id): id is string => Boolean(id)),
  );
  if (existingCustomerBusinessIds.size === 0) return new Set();

  return new Set(
    leads
      .filter((l) => l.businessId && existingCustomerBusinessIds.has(l.businessId))
      .map((l) => l.id),
  );
}
