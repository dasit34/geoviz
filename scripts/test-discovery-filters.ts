/**
 * Tests filterDiscoveryRecords() — provider-agnostic pre-import filters.
 * Run: npx tsx scripts/test-discovery-filters.ts
 */
import { filterDiscoveryRecords } from "@/lib/leads/discoveryFilters";
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

function record(overrides: Partial<NormalizedBusinessRecord>): NormalizedBusinessRecord {
  return {
    provider: "test",
    providerId: Math.random().toString(36),
    businessName: "Test Co",
    website: "https://example.com",
    phone: null,
    address: null,
    city: "Columbus",
    state: "OH",
    categoryRaw: "hvac",
    rating: 4.5,
    reviewCount: 30,
    ...overrides,
  };
}

// No filters — everything passes.
{
  const records = [record({}), record({ reviewCount: null })];
  const { passed, filteredOutCount } = filterDiscoveryRecords(records, {});
  assert(passed.length === 2 && filteredOutCount === 0, "no filters configured -> everything passes");
}

// minReviews.
{
  const records = [record({ reviewCount: 50 }), record({ reviewCount: 5 }), record({ reviewCount: null })];
  const { passed, filteredOutCount } = filterDiscoveryRecords(records, { minReviews: 20 });
  assert(passed.length === 1 && filteredOutCount === 2, "minReviews rejects below-threshold and null review counts");
}

// minRating.
{
  const records = [record({ rating: 4.8 }), record({ rating: 3.0 }), record({ rating: null })];
  const { passed, filteredOutCount } = filterDiscoveryRecords(records, { minRating: 4.0 });
  assert(passed.length === 1 && filteredOutCount === 2, "minRating rejects below-threshold and null ratings");
}

// mustHaveWebsite.
{
  const records = [record({ website: "https://has-a-site.com" }), record({ website: null }), record({ website: "" })];
  const { passed, filteredOutCount } = filterDiscoveryRecords(records, { mustHaveWebsite: true });
  assert(passed.length === 1 && filteredOutCount === 2, "mustHaveWebsite rejects null/empty website");
}

// Combined filters (AND semantics).
{
  const records = [
    record({ reviewCount: 50, rating: 4.5, website: "https://a.com" }), // passes all
    record({ reviewCount: 50, rating: 3.0, website: "https://b.com" }), // fails rating
    record({ reviewCount: 5, rating: 4.5, website: "https://c.com" }), // fails reviews
  ];
  const { passed, filteredOutCount } = filterDiscoveryRecords(records, {
    minReviews: 20,
    minRating: 4.0,
    mustHaveWebsite: true,
  });
  assert(passed.length === 1 && filteredOutCount === 2, "combined filters use AND semantics");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
