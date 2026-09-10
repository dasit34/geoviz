import type { PrismaClient } from "@prisma/client";

import { stringifyCalibrationNotes } from "@/lib/calibration";
import { findOrCreateBusinessForUrl } from "@/lib/business/find-or-create-business";

import {
  MARKET_STUDY_AUDIT_EMAIL,
  MARKET_STUDY_QUEUED_AT,
  MARKET_STUDY_SESSION_PREFIX,
} from "./constants";
import type { EligibilityLead, EligibilityResult } from "./types";

/** Synthetic id for the `market_study_<id>` stripeSessionId. Same shape
 *  Prisma's cuid uses — only needs to be unique. */
export function syntheticId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export type LeadDecision = {
  lead: EligibilityLead & { category: string | null };
  result: EligibilityResult;
};

export type CreatedEntry = {
  entryId: string;
  leadId: string;
  businessName: string;
  auditOrderId: string;
};

export type SkippedEntry = {
  entryId: string;
  leadId: string;
  businessName: string;
  skipReason: string;
};

export type CreateStudyAuditsResult = {
  created: CreatedEntry[];
  skipped: SkippedEntry[];
};

type CreateArgs = {
  prisma: PrismaClient;
  studyId: string;
  decisions: LeadDecision[];
  /** Injectable for tests. Defaults to the real business resolver. */
  resolveBusinessId?: (url: string) => Promise<string | null>;
};

/**
 * Create one `AuditOrder` + `MarketStudyEntry` per eligible lead, and a
 * skip-only entry per ineligible lead. Mirrors the per-URL loop in
 * `POST /api/admin/calibration` — each lead is isolated in its own
 * try/catch so one failure never blocks the rest of the batch.
 *
 * The audit orders are plain rows on the existing queue:
 *   - `stripeSessionId: market_study_<id>`  → identifiable, never hits Stripe
 *   - `email: market-study@geoviz.invalid`  → suppresses customer emails
 *     (recognized by `isCalibrationOrder`)
 *   - `businessName: <real name>`           → stays OUT of the [CAL] cockpit
 *   - `reportStatus: "queued"` + backdated `reportQueuedAt`
 *     → worker picks them up, but always AFTER any customer order
 *   - `adminNotes`: reuses the calibration-notes JSON envelope purely to
 *     pass the lead's known industry slug to the worker as an
 *     `industryRaw` hint (better cohort classification). It does NOT
 *     make the order a calibration order.
 *
 * The `@@unique([studyId, leadId])` constraint is the final duplicate
 * guard — a P2002 on entry creation is swallowed (the lead is already
 * in the study).
 */
export async function createMarketStudyAudits({
  prisma,
  studyId,
  decisions,
  resolveBusinessId = findOrCreateBusinessForUrl,
}: CreateArgs): Promise<CreateStudyAuditsResult> {
  const created: CreatedEntry[] = [];
  const skipped: SkippedEntry[] = [];

  for (const { lead, result } of decisions) {
    try {
      if (!result.eligible) {
        const entry = await prisma.marketStudyEntry.create({
          data: {
            studyId,
            leadId: lead.id,
            websiteUrl: (lead.website ?? "").trim() || "(none)",
            businessName: lead.businessName,
            skipReason: result.skipReason,
          },
          select: { id: true },
        });
        skipped.push({
          entryId: entry.id,
          leadId: lead.id,
          businessName: lead.businessName,
          skipReason: result.skipReason,
        });
        continue;
      }

      // Best-effort business linking — fail-soft, exactly like checkout.
      let businessId: string | null = null;
      try {
        businessId = await resolveBusinessId(result.websiteUrl);
      } catch {
        businessId = null;
      }

      const order = await prisma.auditOrder.create({
        data: {
          websiteUrl: result.websiteUrl,
          email: MARKET_STUDY_AUDIT_EMAIL,
          businessName: lead.businessName,
          stripeSessionId: `${MARKET_STUDY_SESSION_PREFIX}${syntheticId()}`,
          paymentStatus: "paid",
          auditStatus: "pending",
          reviewStatus: "pending",
          reportStatus: "queued",
          reportQueuedAt: MARKET_STUDY_QUEUED_AT,
          adminNotes: stringifyCalibrationNotes({
            expected: null,
            industry: lead.category ?? null,
          }),
          ...(businessId ? { businessId } : {}),
        },
        select: { id: true },
      });

      const entry = await prisma.marketStudyEntry.create({
        data: {
          studyId,
          leadId: lead.id,
          auditOrderId: order.id,
          websiteUrl: result.websiteUrl,
          businessName: lead.businessName,
        },
        select: { id: true },
      });

      // Backfill the lead's "most recent audit" pointer + business link
      // (display only — the authoritative per-study link is the entry).
      try {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            auditOrderId: order.id,
            ...(businessId ? { businessId } : {}),
          },
        });
      } catch {
        // Non-fatal — the entry link is what matters.
      }

      created.push({
        entryId: entry.id,
        leadId: lead.id,
        businessName: lead.businessName,
        auditOrderId: order.id,
      });
      // eslint-disable-next-line no-console
      console.log(
        `[market-study] queued studyId=${studyId} orderId=${order.id} leadId=${lead.id} url=${result.websiteUrl}`,
      );
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : null;
      if (code === "P2002") {
        // Race with a concurrent run for the same [studyId, leadId] —
        // the lead is already in the study. Treat as skipped, no throw.
        skipped.push({
          entryId: "",
          leadId: lead.id,
          businessName: lead.businessName,
          skipReason: "Already in this study",
        });
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error(
        `[market-study] failed to queue leadId=${lead.id} studyId=${studyId}: ${message}`,
      );
      skipped.push({
        entryId: "",
        leadId: lead.id,
        businessName: lead.businessName,
        skipReason: `Error: ${message}`,
      });
    }
  }

  return { created, skipped };
}
