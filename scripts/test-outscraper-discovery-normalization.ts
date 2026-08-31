/**
 * Tests OutscraperProvider's pure normalization (toNormalizedRecord)
 * and its enabled()/discoverBusinesses() gating when OUTSCRAPER_API_KEY
 * is unset (this test environment has no real key — that's the point:
 * confirms the "missing key" error path never throws and never crashes).
 * Run: npx tsx scripts/test-outscraper-discovery-normalization.ts
 */
import { toNormalizedRecord, OutscraperProvider } from "@/lib/discovery/providers/outscraper";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

// Full place object.
const full = toNormalizedRecord({
  name: "Rick's Test HVAC",
  place_id: "ChIJabc123",
  full_address: "123 Main St, Columbus, OH 43215",
  city: "Columbus",
  us_state: "Ohio",
  postal_code: "43215",
  latitude: 39.9612,
  longitude: -82.9988,
  website: "https://rickstesthvac.example.com",
  phone: "614-555-0100",
  category: "HVAC contractor",
  rating: 4.7,
  reviews: 132,
  location_link: "https://maps.google.com/?cid=12345",
});
assert(full !== null, "full place normalizes to a non-null record");
assert(full?.provider === "outscraper", "provider is 'outscraper'");
assert(full?.providerId === "ChIJabc123", "providerId maps from place_id");
assert(full?.businessName === "Rick's Test HVAC", "businessName maps from name");
assert(full?.website === "https://rickstesthvac.example.com", "website maps from the verified live field name 'website'");

// Regression guard for the diagnosed bug (2026-08-31): a live Toledo
// HVAC search showed Outscraper returns the site under `website`, not
// `site` as docs.outscraper.com described — that mismapping silently
// nulled every business's website and caused mustHaveWebsite to
// reject 3/3 real results with websites. `site` is kept as a
// defensive fallback only.
const siteFallback = toNormalizedRecord({
  name: "Fallback Co",
  place_id: "ChIJfallback",
  site: "https://fallback.example.com",
});
assert(
  siteFallback?.website === "https://fallback.example.com",
  "falls back to legacy 'site' field when 'website' is absent",
);
const websitePreferred = toNormalizedRecord({
  name: "Both Fields Co",
  place_id: "ChIJboth",
  website: "https://correct.example.com",
  site: "https://stale.example.com",
});
assert(
  websitePreferred?.website === "https://correct.example.com",
  "'website' takes priority over 'site' when both are present",
);
assert(full?.zip === "43215", "zip maps from postal_code");
assert(full?.latitude === 39.9612, "latitude maps through");
assert(full?.longitude === -82.9988, "longitude maps through");
assert(full?.mapsUrl === "https://maps.google.com/?cid=12345", "mapsUrl maps from location_link");
assert(full?.categoryRaw === "HVAC contractor", "categoryRaw maps from category (raw, unnormalized)");
assert(full?.reviewCount === 132, "reviewCount maps from reviews");

// Missing optional fields → nulls, not crashes.
const sparse = toNormalizedRecord({ name: "Bare Co", place_id: "ChIJxyz" });
assert(sparse !== null, "sparse place (name+place_id only) still normalizes");
assert(sparse?.website === null, "missing site -> null website");
assert(sparse?.zip === null, "missing postal_code -> null zip");
assert(sparse?.latitude === null, "missing latitude -> null");
assert(sparse?.rating === null, "missing rating -> null");

// Missing required identity fields → skipped (null), never a half record.
assert(toNormalizedRecord({ name: "No place_id" }) === null, "missing place_id -> null (skipped)");
assert(toNormalizedRecord({ place_id: "ChIJnoname" }) === null, "missing name -> null (skipped)");

// Gating: no key set in this environment.
assert(OutscraperProvider.enabled() === false, "enabled() is false with no OUTSCRAPER_API_KEY set");

(async () => {
  const result = await OutscraperProvider.discoverBusinesses({
    category: "HVAC",
    city: "Columbus",
    state: "OH",
    limit: 5,
  });
  assert(Array.isArray(result.records) && result.records.length === 0, "discoverBusinesses returns empty records when disabled");
  assert(typeof result.error === "string" && result.error.length > 0, "discoverBusinesses returns a clean error string when disabled");
  assert(!result.error!.includes(process.env.OUTSCRAPER_API_KEY ?? "__unset__"), "error message never contains the API key value");

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
})();
