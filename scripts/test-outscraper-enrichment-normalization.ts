/**
 * Tests OutscraperEnrichmentProvider's pure normalization
 * (pickBestContact) and gating when OUTSCRAPER_API_KEY is unset.
 * Run: npx tsx scripts/test-outscraper-enrichment-normalization.ts
 */
import { pickBestContact, OutscraperEnrichmentProvider } from "@/lib/enrichment/providers/outscraper";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

// Prefers a business-domain email over others.
{
  const contact = pickBestContact("example.com", {
    emails: [
      { value: "someone@gmail.com" },
      { value: "info@example.com" },
      { value: "sales@example.com" },
    ],
  });
  assert(contact?.contactEmail === "info@example.com", "prefers first business-domain email over free-mail/other domains");
  assert(
    (contact?.alternateEmails ?? []).includes("someone@gmail.com") &&
      (contact?.alternateEmails ?? []).includes("sales@example.com"),
    "preserves the other emails as alternateEmails",
  );
}

// Falls back to first email when no domain match.
{
  const contact = pickBestContact("example.com", {
    emails: [{ value: "contact@other.com" }],
  });
  assert(contact?.contactEmail === "contact@other.com", "falls back to first email when none match the domain");
}

// Never invents a name or title.
{
  const contact = pickBestContact("example.com", { emails: [{ value: "a@example.com" }] });
  assert(contact?.contactName === null, "contactName is always null (endpoint never returns a person)");
  assert(contact?.contactTitle === null, "contactTitle is always null (endpoint never returns a person)");
}

// No emails -> null (no contact found), not a crash.
{
  const contact = pickBestContact("example.com", { emails: [] });
  assert(contact === null, "empty emails array -> null contact");
}
{
  const contact = pickBestContact("example.com", {});
  assert(contact === null, "missing emails field entirely -> null contact");
}

// Dedup + case-insensitive matching.
{
  const contact = pickBestContact("Example.com", {
    emails: [{ value: "Info@Example.com" }, { value: "info@example.com" }],
  });
  assert(contact?.contactEmail === "info@example.com", "email comparison is case-insensitive");
  assert((contact?.alternateEmails ?? []).length === 0, "duplicate emails (case-insensitive) are deduped");
}

// Cap alternate emails at 5.
{
  const contact = pickBestContact("example.com", {
    emails: Array.from({ length: 10 }, (_, i) => ({ value: `person${i}@other.com` })),
  });
  assert((contact?.alternateEmails ?? []).length === 5, "alternateEmails capped at 5");
}

// Socials only included when non-empty.
{
  const withSocials = pickBestContact("example.com", {
    emails: [{ value: "a@example.com" }],
    socials: { facebook: "https://facebook.com/x", linkedin: "" },
  });
  assert(
    withSocials?.socials !== null && Object.keys(withSocials!.socials!).length === 1,
    "only non-empty social values are kept",
  );

  const noSocials = pickBestContact("example.com", { emails: [{ value: "a@example.com" }] });
  assert(noSocials?.socials === null, "socials is null when none returned");
}

// Gating: no key set in this environment.
assert(OutscraperEnrichmentProvider.enabled() === false, "enabled() is false with no OUTSCRAPER_API_KEY set");

(async () => {
  const result = await OutscraperEnrichmentProvider.findContact({
    businessName: "Test Co",
    domain: "example.com",
    website: "https://example.com",
  });
  assert(result.contact === null, "findContact returns null contact when disabled");
  assert(typeof result.error === "string" && result.error.length > 0, "findContact returns a clean error string when disabled");
  assert(!result.error!.includes(process.env.OUTSCRAPER_API_KEY ?? "__unset__"), "error message never contains the API key value");

  const noDomain = await OutscraperEnrichmentProvider.findContact({
    businessName: "Test Co",
    domain: null,
    website: null,
  });
  assert(noDomain.contact === null && noDomain.error === "No domain available to enrich.", "no-domain input short-circuits before any HTTP call");

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll assertions passed.");
})();
