/**
 * Live-DB test: proves an Outscraper-shaped NormalizedBusinessRecord
 * flows through the UNMODIFIED importDiscoveredBusiness() dedup engine
 * correctly, and that re-import only backfills blank Phase-3 fields
 * (zip/latitude/longitude/mapsUrl) without overwriting existing
 * non-null values. Creates throwaway rows against the real DB and
 * cleans them up unconditionally (even on failure).
 * Run: npx tsx scripts/test-outscraper-dedupe-live.ts
 */
import { prisma } from "@/lib/db";
import { importDiscoveredBusiness } from "@/lib/leads/dedupe";
import type { NormalizedBusinessRecord } from "@/lib/discovery/types";

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
    await prisma.leadSourceRef.deleteMany({ where: { leadId: { in: createdLeadIds } } });
    await prisma.lead.deleteMany({ where: { id: { in: createdLeadIds } } });
  }
}

async function main() {
  const website = "https://outscraper-dedupe-live-test.example.com";

  // 1. First import — full Phase 3 fields.
  const first: NormalizedBusinessRecord = {
    provider: "outscraper",
    providerId: "ChIJliveTest1",
    businessName: "Outscraper Dedupe Live Test Co",
    website,
    phone: "614-555-0101",
    address: "1 Test St",
    city: "Columbus",
    state: "OH",
    categoryRaw: "hvac",
    rating: 4.5,
    reviewCount: 40,
    zip: "43215",
    latitude: 39.9612,
    longitude: -82.9988,
    mapsUrl: "https://maps.google.com/?cid=111",
  };
  const outcome1 = await importDiscoveredBusiness(first);
  createdLeadIds.push(outcome1.lead.id);
  assert(!outcome1.matched, "first import creates a new lead");
  assert(outcome1.lead.zip === "43215", "new lead gets zip from the record");
  assert(outcome1.lead.mapsUrl === "https://maps.google.com/?cid=111", "new lead gets mapsUrl from the record");

  // 2. Re-import same providerId with DIFFERENT/blank Phase 3 fields —
  // must dedup (provider_id match) and must NOT overwrite existing values.
  const second: NormalizedBusinessRecord = {
    ...first,
    zip: null,
    mapsUrl: "https://maps.google.com/?cid=DIFFERENT",
  };
  const outcome2 = await importDiscoveredBusiness(second);
  assert(outcome2.matched && outcome2.matchedOn === "provider_id", "re-import with same providerId matches via provider_id");
  assert(outcome2.lead.id === outcome1.lead.id, "re-import does not create a second lead row");
  assert(outcome2.lead.zip === "43215", "existing non-null zip is NOT overwritten by a blank incoming value");
  assert(
    outcome2.lead.mapsUrl === "https://maps.google.com/?cid=111",
    "existing non-null mapsUrl is NOT overwritten by a different incoming value (backfill-only, matching dedupe.ts's philosophy)",
  );

  // 3. A different provider, same domain, brings NEW info the first
  // provider didn't have — must backfill only the genuinely-blank field.
  const thirdDomainOnly: NormalizedBusinessRecord = {
    provider: "google_places",
    providerId: "places-live-test-1",
    businessName: "Outscraper Dedupe Live Test Co",
    website,
    phone: null,
    address: null,
    city: null,
    state: null,
    categoryRaw: null,
    rating: null,
    reviewCount: null,
    latitude: 40.111, // different from the stored 39.9612 — must NOT overwrite
  };
  const outcome3 = await importDiscoveredBusiness(thirdDomainOnly);
  assert(outcome3.matched && outcome3.matchedOn === "domain", "a different provider on the same domain matches cross-provider via domain");
  assert(outcome3.lead.latitude === 39.9612, "cross-provider backfill does not overwrite an existing non-null latitude");

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
