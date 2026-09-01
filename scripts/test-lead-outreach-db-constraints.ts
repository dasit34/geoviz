/**
 * Live-DB test: proves (a) LeadOutreach's unique constraint
 * (provider, providerCampaignId, leadId) is enforced at the DATABASE
 * level, not just by application-side pre-checks, and (b) every
 * tracked field round-trips correctly through a real write + read.
 * Creates throwaway rows against the real DB and cleans up
 * unconditionally (even on failure).
 * Run: npx tsx scripts/test-lead-outreach-db-constraints.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

const createdLeadIds: string[] = [];
async function cleanup() {
  if (createdLeadIds.length > 0) {
    await prisma.leadOutreach.deleteMany({ where: { leadId: { in: createdLeadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
  }
}

async function main() {
  const lead = await prisma.lead.create({
    data: {
      businessName: "DB Constraint Test Co",
      businessNameNormalized: "db constraint test co",
      website: "https://db-constraint-test.example.com",
      domain: "db-constraint-test.example.com",
      contactEmail: "test@db-constraint-test.example.com",
      source: "manual",
      status: "QUALIFIED",
    },
  });
  createdLeadIds.push(lead.id);

  const sentAt = new Date();
  const rawPayload = { status: "interested", raw_field: "example" };

  // 1. Full-field round-trip.
  const row = await prisma.leadOutreach.create({
    data: {
      leadId: lead.id,
      provider: "instantly",
      providerCampaignId: "camp_constraint_test",
      campaignName: "Constraint Test Campaign",
      providerLeadId: "instantly_lead_xyz",
      status: "SENT_TO_INSTANTLY",
      sentAt,
      lastSyncedAt: sentAt,
      failureReason: null,
      lastProviderPayload: rawPayload as Prisma.InputJsonValue,
    },
  });

  const reread = await prisma.leadOutreach.findUniqueOrThrow({ where: { id: row.id } });
  assert(reread.provider === "instantly", "provider round-trips correctly");
  assert(reread.providerCampaignId === "camp_constraint_test", "providerCampaignId round-trips correctly");
  assert(reread.providerLeadId === "instantly_lead_xyz", "providerLeadId round-trips correctly");
  assert(reread.status === "SENT_TO_INSTANTLY", "status round-trips correctly");
  assert(reread.sentAt?.getTime() === sentAt.getTime(), "sentAt round-trips correctly");
  assert(reread.lastSyncedAt?.getTime() === sentAt.getTime(), "lastSyncedAt round-trips correctly");
  assert(reread.failureReason === null, "failureReason round-trips correctly (null case)");
  assert(
    JSON.stringify(reread.lastProviderPayload) === JSON.stringify(rawPayload),
    "lastProviderPayload round-trips correctly",
  );

  // failureReason on a FAILED row, separately, since the first row used null.
  const failedLead = await prisma.lead.create({
    data: {
      businessName: "DB Constraint Test Co 2",
      businessNameNormalized: "db constraint test co 2",
      contactEmail: "test2@db-constraint-test.example.com",
      source: "manual",
      status: "QUALIFIED",
    },
  });
  createdLeadIds.push(failedLead.id);
  const failedRow = await prisma.leadOutreach.create({
    data: {
      leadId: failedLead.id,
      provider: "instantly",
      providerCampaignId: "camp_constraint_test",
      status: "FAILED",
      failureReason: "Instantly did not confirm this lead was created (duplicated=1)",
    },
  });
  const rereadFailed = await prisma.leadOutreach.findUniqueOrThrow({ where: { id: failedRow.id } });
  assert(
    rereadFailed.failureReason === "Instantly did not confirm this lead was created (duplicated=1)",
    "failureReason round-trips correctly (populated case)",
  );
  assert(rereadFailed.sentAt === null, "sentAt stays null for a row that was never actually sent");

  // 2. DB-level unique constraint — the actual guarantee, not just the
  // application-level filterSendEligibleLeads() pre-check.
  let threwUniqueViolation = false;
  try {
    await prisma.leadOutreach.create({
      data: {
        leadId: lead.id, // same lead
        provider: "instantly", // same provider
        providerCampaignId: "camp_constraint_test", // same campaign — exact duplicate of `row`
        status: "QUEUED",
      },
    });
  } catch (err) {
    threwUniqueViolation = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
  }
  assert(threwUniqueViolation, "DB-level unique constraint (provider, providerCampaignId, leadId) rejects a true duplicate with P2002");

  // Sanity: a DIFFERENT campaign for the same lead is NOT blocked by the constraint.
  const differentCampaignRow = await prisma.leadOutreach.create({
    data: {
      leadId: lead.id,
      provider: "instantly",
      providerCampaignId: "camp_constraint_test_OTHER",
      status: "QUEUED",
    },
  });
  assert(!!differentCampaignRow.id, "the same lead CAN have outreach rows for different campaigns — constraint is per-campaign, not per-lead");

  await cleanup();

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("TEST FAILED", e);
    await cleanup().catch(() => {});
    await prisma.$disconnect();
    process.exit(1);
  });
