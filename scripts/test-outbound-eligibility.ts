/**
 * Tests filterSendEligibleLeads() — the "Send to Instantly" pre-send
 * eligibility gate. Run: npx tsx scripts/test-outbound-eligibility.ts
 */
import { filterSendEligibleLeads } from "@/lib/leads/outboundEligibility";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

const CAMPAIGN_A = "camp_a";
const CAMPAIGN_B = "camp_b";

// Valid qualified lead, no prior outreach -> eligible.
{
  const { eligible, skipped } = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "QUALIFIED" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId: new Map() },
  );
  assert(eligible.length === 1 && skipped.length === 0, "a valid qualified lead with no prior outreach is eligible");
}

// DO_NOT_CONTACT is always skipped.
{
  const { eligible, skipped } = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "DO_NOT_CONTACT" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId: new Map() },
  );
  assert(eligible.length === 0 && skipped[0]?.reason.includes("DO_NOT_CONTACT"), "DO_NOT_CONTACT is always skipped, with a clear reason");
}

// Non-approved status is skipped.
{
  const { eligible, skipped } = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "NEW" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId: new Map() },
  );
  assert(eligible.length === 0 && skipped.length === 1, "an un-qualified status (NEW) is skipped");
}

// Missing / malformed email is skipped.
{
  const r1 = filterSendEligibleLeads(
    [{ leadId: "l1", email: null, status: "QUALIFIED" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId: new Map() },
  );
  assert(r1.eligible.length === 0, "null email is skipped");
  const r2 = filterSendEligibleLeads(
    [{ leadId: "l1", email: "not-an-email", status: "QUALIFIED" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId: new Map() },
  );
  assert(r2.eligible.length === 0, "malformed email is skipped");
}

// Already sent to THIS campaign -> skipped (the duplicate-send guard).
{
  const outreachByLeadId = new Map([["l1", [{ providerCampaignId: CAMPAIGN_A, status: "SENT_TO_INSTANTLY" }]]]);
  const { eligible, skipped } = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "QUALIFIED" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId },
  );
  assert(eligible.length === 0 && skipped[0]?.reason.includes("Already sent"), "already sent to this exact campaign is skipped");
}

// Sent to a DIFFERENT campaign, not bounced -> still eligible for a new campaign.
{
  const outreachByLeadId = new Map([["l1", [{ providerCampaignId: CAMPAIGN_B, status: "ACTIVE" }]]]);
  const { eligible } = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "QUALIFIED" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId },
  );
  assert(eligible.length === 1, "prior send to a DIFFERENT campaign (non-bounced) does not block a new campaign");
}

// Previously bounced/unsubscribed in ANY campaign -> blocked everywhere.
{
  const bouncedElsewhere = new Map([["l1", [{ providerCampaignId: CAMPAIGN_B, status: "BOUNCED" }]]]);
  const r1 = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "QUALIFIED" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId: bouncedElsewhere },
  );
  assert(r1.eligible.length === 0 && r1.skipped[0]?.reason.includes("bounced"), "previously bounced in another campaign blocks a new send");

  const unsubbedElsewhere = new Map([["l1", [{ providerCampaignId: CAMPAIGN_B, status: "UNSUBSCRIBED" }]]]);
  const r2 = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "QUALIFIED" }],
    { campaignId: CAMPAIGN_A, outreachByLeadId: unsubbedElsewhere },
  );
  assert(r2.eligible.length === 0 && r2.skipped[0]?.reason.includes("unsubscribed"), "previously unsubscribed in another campaign blocks a new send");
}

// Multiple leads, mixed outcomes, correct partition.
{
  const outreachByLeadId = new Map([["l2", [{ providerCampaignId: CAMPAIGN_A, status: "SENT_TO_INSTANTLY" }]]]);
  const { eligible, skipped } = filterSendEligibleLeads(
    [
      { leadId: "l1", email: "a@example.com", status: "QUALIFIED" },
      { leadId: "l2", email: "b@example.com", status: "QUALIFIED" },
      { leadId: "l3", email: null, status: "QUALIFIED" },
      { leadId: "l4", email: "d@example.com", status: "DO_NOT_CONTACT" },
    ],
    { campaignId: CAMPAIGN_A, outreachByLeadId },
  );
  assert(eligible.length === 1 && eligible[0].leadId === "l1", "mixed batch: exactly the one genuinely-eligible lead passes");
  assert(skipped.length === 3, "mixed batch: the other three are all skipped with distinct reasons");
}

// campaignId: null (mock/local preview mode, no campaign selected yet)
// -> "already sent to this campaign" check is skipped, everything else
// still runs.
{
  const outreachByLeadId = new Map([["l2", [{ providerCampaignId: CAMPAIGN_A, status: "SENT_TO_INSTANTLY" }]]]);
  const { eligible, skipped } = filterSendEligibleLeads(
    [
      { leadId: "l1", email: "a@example.com", status: "QUALIFIED" },
      { leadId: "l2", email: "b@example.com", status: "QUALIFIED" },
      { leadId: "l3", email: "c@example.com", status: "DO_NOT_CONTACT" },
    ],
    { campaignId: null, outreachByLeadId },
  );
  assert(eligible.length === 2, "null campaignId (mock preview mode): a lead already sent to a real campaign is still eligible since there's no campaign to compare against");
  assert(skipped.length === 1 && skipped[0].leadId === "l3", "null campaignId: other eligibility rules (DO_NOT_CONTACT etc.) still apply in preview mode");
}

// campaignId: null still blocks previously bounced/unsubscribed leads
// — that check has nothing to do with which campaign is selected.
{
  const outreachByLeadId = new Map([["l1", [{ providerCampaignId: CAMPAIGN_B, status: "BOUNCED" }]]]);
  const { eligible, skipped } = filterSendEligibleLeads(
    [{ leadId: "l1", email: "a@example.com", status: "QUALIFIED" }],
    { campaignId: null, outreachByLeadId },
  );
  assert(eligible.length === 0 && skipped[0]?.reason.includes("bounced"), "null campaignId: previously-bounced-anywhere guard still applies in preview mode");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
