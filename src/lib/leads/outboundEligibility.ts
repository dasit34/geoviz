/**
 * Pre-send eligibility filter for "Send to Instantly" (and any future
 * outbound provider) — provider-agnostic, lives in `src/lib/leads/`
 * per the same convention as `discoveryFilters.ts`. Applied server-
 * side on EVERY call to the send route, including the confirmed send
 * — never trusts a client-supplied "these are eligible" list.
 */

const APPROVED_STATUSES = new Set(["QUALIFIED", "READY_FOR_CONTACT", "CONTACTED", "RESPONDED"]);
const BLOCKED_PRIOR_OUTREACH_STATUSES = new Set(["BOUNCED", "UNSUBSCRIBED"]);
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Free, static heuristic only — NOT real deliverability/catch-all
// verification. That would require a paid third-party provider
// (e.g. ZeroBounce/NeverBounce/Hunter Verify, roughly $0.003-$0.01
// per email) and is explicitly out of scope until requested. This
// list only catches the most common disposable/temp-mail domains —
// obvious junk, not a comprehensive verification system.
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getnada.com",
  "discard.email",
  "maildrop.cc",
  "mailnesia.com",
  "fakeinbox.com",
  "dispostable.com",
]);

/**
 * Trim + lowercase only — never alters the actual address, never
 * fabricates or guesses a value. Applied before both the eligibility
 * check and the value actually sent to the provider so a stray
 * whitespace/casing difference can't cause a mismatch between what
 * was validated and what was sent.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type EligibilityLead = {
  leadId: string;
  email: string | null;
  status: string;
};

export type EligibilityOutreachRow = {
  providerCampaignId: string;
  status: string;
};

export type SkippedLead = { leadId: string; reason: string };

export type EligibilityResult = {
  eligible: EligibilityLead[];
  skipped: SkippedLead[];
};

/**
 * `outreachByLeadId` should contain every existing LeadOutreach row
 * (any campaign, any provider) for the leads being checked — used
 * both for "already sent to this exact campaign" and "previously
 * bounced/unsubscribed anywhere" (requirement: "not obviously
 * invalid/bounced if that information exists" — we only know this
 * once at least one prior send exists).
 *
 * `campaignId` is nullable to support the mock/local payload-preview
 * mode (no Instantly account / campaign selected yet) — when null,
 * every check still runs EXCEPT "already sent to this exact campaign"
 * (there's no campaign to check against). A real send always supplies
 * a real campaignId; only the no-key preview path omits it.
 */
export function filterSendEligibleLeads(
  leads: EligibilityLead[],
  opts: { campaignId: string | null; outreachByLeadId: Map<string, EligibilityOutreachRow[]> },
): EligibilityResult {
  const eligible: EligibilityLead[] = [];
  const skipped: SkippedLead[] = [];

  for (const lead of leads) {
    if (lead.status === "DO_NOT_CONTACT") {
      skipped.push({ leadId: lead.leadId, reason: "Lead is marked DO_NOT_CONTACT." });
      continue;
    }
    if (!APPROVED_STATUSES.has(lead.status)) {
      skipped.push({
        leadId: lead.leadId,
        reason: `Lead status "${lead.status}" is not in an approved/qualified state.`,
      });
      continue;
    }
    if (!lead.email) {
      skipped.push({ leadId: lead.leadId, reason: "No valid email address on file." });
      continue;
    }
    const normalizedEmail = normalizeEmail(lead.email);
    if (!EMAIL_FORMAT_RE.test(normalizedEmail)) {
      skipped.push({ leadId: lead.leadId, reason: "No valid email address on file." });
      continue;
    }
    const emailDomain = normalizedEmail.split("@")[1];
    if (emailDomain && DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
      skipped.push({ leadId: lead.leadId, reason: "Email uses a disposable/temporary domain." });
      continue;
    }

    const priorOutreach = opts.outreachByLeadId.get(lead.leadId) ?? [];
    if (opts.campaignId && priorOutreach.some((r) => r.providerCampaignId === opts.campaignId)) {
      skipped.push({ leadId: lead.leadId, reason: "Already sent to this campaign." });
      continue;
    }
    const badPrior = priorOutreach.find((r) => BLOCKED_PRIOR_OUTREACH_STATUSES.has(r.status));
    if (badPrior) {
      skipped.push({
        leadId: lead.leadId,
        reason: `Lead previously ${badPrior.status.toLowerCase()} in another campaign — skipped as a safety precaution.`,
      });
      continue;
    }

    eligible.push(lead);
  }

  return { eligible, skipped };
}
