/**
 * Route-level test for POST /api/admin/leads/outbound/sync — mocked
 * global.fetch (so the real InstantlyProvider is exercised, but with
 * no live network) combined with a real throwaway DB row. Proves the
 * route correctly matches returned statuses to existing LeadOutreach
 * rows by providerLeadId, normalizes + persists the status, and never
 * creates a new row for a providerLeadId it doesn't recognize.
 * Run: npx tsx scripts/test-outbound-sync-route.ts
 */
import { prisma } from "@/lib/db";
import { POST as syncPOST } from "../src/app/api/admin/leads/outbound/sync/route";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
if (!ADMIN_SECRET) {
  console.error("ADMIN_SECRET not set — cannot run.");
  process.exit(1);
}
process.env.INSTANTLY_API_KEY = "test-fake-key-never-real-1234567890";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

const originalFetch = globalThis.fetch;
function mockFetchOnce(body: unknown) {
  globalThis.fetch = (async () => ({ ok: true, json: async () => body })) as unknown as typeof fetch;
}
function restoreFetch() {
  globalThis.fetch = originalFetch;
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET! },
    body: JSON.stringify(body),
  });
}

const createdLeadIds: string[] = [];
async function cleanup() {
  if (createdLeadIds.length > 0) {
    await prisma.leadOutreach.deleteMany({ where: { leadId: { in: createdLeadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
  }
  restoreFetch();
}

async function main() {
  const lead = await prisma.lead.create({
    data: {
      businessName: "Sync Route Test Co",
      businessNameNormalized: "sync route test co",
      contactEmail: "test@sync-route-test.example.com",
      source: "manual",
      status: "QUALIFIED",
    },
  });
  createdLeadIds.push(lead.id);

  const outreach = await prisma.leadOutreach.create({
    data: {
      leadId: lead.id,
      provider: "instantly",
      providerCampaignId: "camp_sync_test",
      providerLeadId: "instantly_lead_sync_1",
      status: "SENT_TO_INSTANTLY",
    },
  });

  // Mocked Instantly response: this lead is now bounced, plus one
  // status for a providerLeadId GeoViz has no record of.
  mockFetchOnce({
    items: [
      { id: "instantly_lead_sync_1", email: "test@sync-route-test.example.com", status_summary: "bounced" },
      { id: "instantly_lead_UNKNOWN", email: "someone-else@example.com", status_summary: "interested" },
    ],
  });

  const res = await syncPOST(jsonRequest("http://localhost/api/admin/leads/outbound/sync", { campaignId: "camp_sync_test" }));
  const data = await res.json();

  assert(res.status === 200, "sync route responds 200");
  assert(data.fetched === 2, "sync route reports the 2 statuses it fetched from the (mocked) provider");
  assert(data.updated === 1, "sync route updates exactly the 1 row it recognizes, ignoring the unknown providerLeadId");

  const updated = await prisma.leadOutreach.findUniqueOrThrow({ where: { id: outreach.id } });
  assert(updated.status === "BOUNCED", "the matched row's status was normalized from 'bounced' and persisted");
  assert(updated.lastSyncedAt !== null, "lastSyncedAt was stamped");
  assert(
    JSON.stringify(updated.lastProviderPayload) === JSON.stringify("bounced"),
    "the raw provider payload was preserved verbatim",
  );

  const rowCountAfter = await prisma.leadOutreach.count({ where: { leadId: lead.id } });
  assert(rowCountAfter === 1, "no new LeadOutreach row was created for the unknown providerLeadId — sync never creates, only updates");

  // Sanity: unconfigured provider still fails cleanly at the route level (belt and suspenders, re-proving Phase 4's own guarantee).
  delete process.env.INSTANTLY_API_KEY;
  const res2 = await syncPOST(jsonRequest("http://localhost/api/admin/leads/outbound/sync", { campaignId: "camp_sync_test" }));
  assert(res2.status === 409, "sync route still fails cleanly (409) when the provider isn't configured");

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
