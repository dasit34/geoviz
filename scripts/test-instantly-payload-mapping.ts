/**
 * Tests toOutboundLeadInput() — the Lead -> Instantly payload mapping.
 * Confirms no invented names/emails/personalization and correct field
 * mapping, using synthetic Lead-shaped objects (no live DB needed).
 * Run: npx tsx scripts/test-instantly-payload-mapping.ts
 */
import type { Lead } from "@prisma/client";
import { toOutboundLeadInput } from "@/lib/leads/toOutboundLeadInput";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

function makeLead(overrides: Partial<Lead>): Lead {
  return {
    id: "lead_1",
    businessName: "Rick's Test HVAC",
    businessNameNormalized: "ricks test hvac",
    website: "https://rickstesthvac.example.com",
    domain: "rickstesthvac.example.com",
    phoneNormalized: null,
    addressNormalized: null,
    category: "hvac",
    city: "Toledo",
    state: "OH",
    address: null,
    phone: "419-555-0100",
    zip: null,
    latitude: null,
    longitude: null,
    mapsUrl: null,
    source: "outscraper",
    sourceId: "ChIJtest",
    rating: 4.5,
    reviewCount: 100,
    contactName: null,
    contactTitle: null,
    contactEmail: "rick@rickstesthvac.example.com",
    contactSource: "outscraper",
    contactAlternateEmails: null,
    contactSocials: null,
    qualificationScore: 82,
    qualificationReasons: null,
    status: "QUALIFIED",
    notes: null,
    discoveredAt: new Date(),
    qualifiedAt: new Date(),
    enrichedAt: new Date(),
    contactedAt: null,
    respondedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    businessId: null,
    freeCheckSubmissionId: null,
    auditOrderId: null,
    ...overrides,
  } as Lead;
}

// Full mapping.
{
  const lead = makeLead({ contactName: "Rick Owens" });
  const input = toOutboundLeadInput(lead);
  assert(input.leadId === "lead_1", "leadId maps through");
  assert(input.email === "rick@rickstesthvac.example.com", "email maps from contactEmail");
  assert(input.firstName === "Rick", "firstName is the first token of contactName");
  assert(input.lastName === "Owens", "lastName is the remainder of contactName");
  assert(input.companyName === "Rick's Test HVAC", "companyName maps from businessName");
  assert(input.website === "https://rickstesthvac.example.com", "website maps through");
  assert(input.city === "Toledo" && input.state === "OH", "city/state map through");
  assert(input.phone === "419-555-0100", "phone maps through");
  assert(input.customVariables.geoviz_lead_id === "lead_1", "customVariables carries the GeoViz lead id");
  assert(input.customVariables.geoviz_opportunity_score === 82, "customVariables carries the real qualification score");
  assert(input.customVariables.category === "hvac", "customVariables carries category");
}

// No contact name at all -> never invents one.
{
  const lead = makeLead({ contactName: null });
  const input = toOutboundLeadInput(lead);
  assert(input.firstName === null, "no contactName -> firstName is null, never invented");
  assert(input.lastName === null, "no contactName -> lastName is null, never invented");
}

// Single-word contact name -> firstName only, no invented last name.
{
  const lead = makeLead({ contactName: "Cher" });
  const input = toOutboundLeadInput(lead);
  assert(input.firstName === "Cher", "single-word name becomes firstName");
  assert(input.lastName === null, "single-word name never invents a lastName");
}

// Email is normalized (trim/lowercase) on the way out — never altered otherwise.
{
  const lead = makeLead({ contactEmail: "  Rick@RicksTestHVAC.example.com  " });
  const input = toOutboundLeadInput(lead);
  assert(input.email === "rick@rickstesthvac.example.com", "email sent to Instantly is trimmed and lowercased, same address");
}

// Null qualification score is never coerced to a fake number.
{
  const lead = makeLead({ qualificationScore: null });
  const input = toOutboundLeadInput(lead);
  assert(input.customVariables.geoviz_opportunity_score === null, "missing qualification score stays null, never fabricated");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll assertions passed.");
