/**
 * "Prepare for Outreach" — orchestration layer over the EXISTING
 * qualification and enrichment services. Deliberately does not
 * duplicate either: it imports and calls `qualifyLead()` and
 * `enrichOneLead()` exactly as they exist today (see
 * `src/lib/leads/qualifyLead.ts`, `src/lib/leads/enrichLead.ts`) and
 * adds only the sequencing/idempotency/status-transition logic that
 * doesn't exist anywhere yet:
 *
 *   - Per-lead branching so a mixed selection (NEW, already
 *     QUALIFIED, already enriched, blocked, etc.) is handled safely
 *     in one pass — see `processLead()`.
 *   - The "already enriched, don't spend again" guard: `enrichOneLead`
 *     itself has no such check (calling it twice re-spends the paid
 *     provider) — this orchestrator checks `lead.contactEmail != null`
 *     BEFORE calling it.
 *   - The one new status-write in this feature: a `QUALIFIED` lead
 *     with a usable contact email (fresh or pre-existing) is promoted
 *     to `READY_FOR_CONTACT`. Never fires on blocked/not-qualified
 *     leads and never downgrades a lead already at `READY_FOR_CONTACT`/
 *     `CONTACTED`/`RESPONDED`.
 *
 * `qualifyFn`/`enrichFn` are injectable (mirrors
 * `createMarketStudyAudits`'s injectable `resolveBusinessId`) so
 * tests exercise the full decision tree without any live HTTP call or
 * paid provider spend.
 */

import type { Lead, PrismaClient } from "@prisma/client";

import { prisma as defaultPrisma } from "@/lib/db";
import { qualifyLead } from "@/lib/leads/qualifyLead";
import { enrichOneLead, type EnrichOneLeadResult } from "@/lib/leads/enrichLead";
import { isUsableEmailFormat } from "@/lib/leads/outboundEligibility";

type QualifyFn = typeof qualifyLead;
type EnrichFn = typeof enrichOneLead;

/** Lead statuses the orchestrator treats as "already blocked" — stop entirely, no qualify, no enrich. */
const BLOCKED_STATUSES: ReadonlySet<string> = new Set(["DO_NOT_CONTACT", "CLOSED"]);

/** Lead statuses the orchestrator treats as "already qualified" for this run's purposes. */
const QUALIFIED_LIKE_STATUSES: ReadonlySet<string> = new Set([
  "QUALIFIED",
  "READY_FOR_CONTACT",
  "CONTACTED",
  "RESPONDED",
]);

export type LeadOutcome = {
  id: string;
  businessName: string;
  isQualified: boolean;
  enrichmentAttempted: boolean;
  /** null = enrichment was never attempted for this lead this run. */
  enrichedSuccessfully: boolean | null;
  hasValidContact: boolean;
  failed: boolean;
  reason: string;
  /** Final values, so the caller (the admin UI) can patch its local row state without a refetch. */
  status: string | null;
  contactEmail: string | null;
  qualificationScore: number | null;
};

export type PrepareForOutreachSummary = {
  selected: number;
  qualified: number;
  notQualified: number;
  enrichmentAttempted: number;
  enrichedSuccessfully: number;
  noValidContact: number;
  readyForInstantly: number;
  failed: number;
};

export type PrepareForOutreachResult = {
  summary: PrepareForOutreachSummary;
  details: LeadOutcome[];
};

function leadOutcome(
  lead: Pick<Lead, "id" | "businessName" | "status" | "contactEmail" | "qualificationScore">,
  partial: Partial<LeadOutcome>,
): LeadOutcome {
  return {
    id: lead.id,
    businessName: lead.businessName,
    isQualified: false,
    enrichmentAttempted: false,
    enrichedSuccessfully: null,
    hasValidContact: false,
    failed: false,
    reason: "",
    status: lead.status,
    contactEmail: lead.contactEmail,
    qualificationScore: lead.qualificationScore,
    ...partial,
  };
}

function failedOutcome(id: string, businessName: string, reason: string): LeadOutcome {
  return {
    id,
    businessName,
    isQualified: false,
    enrichmentAttempted: false,
    enrichedSuccessfully: null,
    hasValidContact: false,
    failed: true,
    reason,
    status: null,
    contactEmail: null,
    qualificationScore: null,
  };
}

async function processLead(
  leadId: string,
  prisma: PrismaClient,
  qualifyFn: QualifyFn,
  enrichFn: EnrichFn,
): Promise<LeadOutcome> {
  let lead: Lead | null = null;
  try {
    lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return failedOutcome(leadId, "(unknown lead)", "Lead not found.");

    if (BLOCKED_STATUSES.has(lead.status)) {
      return leadOutcome(lead, { isQualified: false, reason: `Lead status is ${lead.status} — skipped.` });
    }

    let current = lead;

    if (current.status === "NEW") {
      const result = await qualifyFn({
        website: current.website,
        category: current.category,
        rating: current.rating,
        reviewCount: current.reviewCount,
      });
      current = await prisma.lead.update({
        where: { id: current.id },
        data: {
          qualificationScore: result.score,
          qualificationReasons: result.reasons,
          status: result.qualified ? "QUALIFIED" : "NOT_QUALIFIED",
          qualifiedAt: new Date(),
        },
      });
      if (!result.qualified) {
        return leadOutcome(current, {
          isQualified: false,
          reason: `Qualification score ${result.score} did not meet the threshold — not enriched.`,
        });
      }
    } else if (!QUALIFIED_LIKE_STATUSES.has(current.status)) {
      // NOT_QUALIFIED already decided (or any other non-blocked,
      // non-qualified status) — do not re-qualify, do not enrich.
      return leadOutcome(current, {
        isQualified: false,
        reason: `Lead status is ${current.status} — not eligible for enrichment.`,
      });
    }

    // `current.status` is now one of QUALIFIED_LIKE_STATUSES.
    if (current.contactEmail) {
      // Already enriched (or manually filled in) — never re-spend the
      // paid provider on a lead that already has a contact.
      const valid = isUsableEmailFormat(current.contactEmail);
      if (valid && current.status === "QUALIFIED") {
        current = await prisma.lead.update({ where: { id: current.id }, data: { status: "READY_FOR_CONTACT" } });
      }
      return leadOutcome(current, {
        isQualified: true,
        hasValidContact: valid,
        reason: valid
          ? "Already had a usable contact email — skipped enrichment."
          : "Already has a contact email on file, but it isn't usable (format/disposable) — left as-is.",
      });
    }

    const enrichResult: EnrichOneLeadResult = await enrichFn(current.id);
    if (!enrichResult.ok) {
      return leadOutcome(current, {
        isQualified: true,
        enrichmentAttempted: true,
        enrichedSuccessfully: false,
        reason: enrichResult.error,
      });
    }

    const valid = isUsableEmailFormat(enrichResult.lead.contactEmail);
    let finalLead = enrichResult.lead;
    if (valid && finalLead.status === "QUALIFIED") {
      finalLead = await prisma.lead.update({ where: { id: finalLead.id }, data: { status: "READY_FOR_CONTACT" } });
    }
    return leadOutcome(finalLead, {
      isQualified: true,
      enrichmentAttempted: true,
      enrichedSuccessfully: true,
      hasValidContact: valid,
      reason: valid
        ? "Enriched successfully — ready for Instantly."
        : "Enrichment found a contact, but the email isn't usable (format/disposable).",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[prepare-for-outreach] leadId=${leadId} threw: ${message}`);
    return failedOutcome(leadId, lead?.businessName ?? "(unknown lead)", message);
  }
}

export async function prepareLeadsForOutreach(
  ids: string[],
  opts?: { prisma?: PrismaClient; qualifyFn?: QualifyFn; enrichFn?: EnrichFn },
): Promise<PrepareForOutreachResult> {
  const prisma = opts?.prisma ?? defaultPrisma;
  const qualifyFn = opts?.qualifyFn ?? qualifyLead;
  const enrichFn = opts?.enrichFn ?? enrichOneLead;

  const details: LeadOutcome[] = [];
  for (const id of ids) {
    details.push(await processLead(id, prisma, qualifyFn, enrichFn));
  }

  const summary: PrepareForOutreachSummary = {
    selected: ids.length,
    qualified: details.filter((d) => !d.failed && d.isQualified).length,
    notQualified: details.filter((d) => !d.failed && !d.isQualified).length,
    enrichmentAttempted: details.filter((d) => d.enrichmentAttempted).length,
    enrichedSuccessfully: details.filter((d) => d.enrichedSuccessfully === true).length,
    noValidContact: details.filter((d) => d.enrichmentAttempted && d.enrichedSuccessfully === false).length,
    readyForInstantly: details.filter((d) => !d.failed && d.isQualified && d.hasValidContact).length,
    failed: details.filter((d) => d.failed).length,
  };

  console.log(
    `[prepare-for-outreach] processed=${ids.length} qualified=${summary.qualified} notQualified=${summary.notQualified} enrichmentAttempted=${summary.enrichmentAttempted} enrichedSuccessfully=${summary.enrichedSuccessfully} noValidContact=${summary.noValidContact} readyForInstantly=${summary.readyForInstantly} failed=${summary.failed}`,
  );

  return { summary, details };
}
