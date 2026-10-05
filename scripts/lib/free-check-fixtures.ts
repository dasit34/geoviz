/**
 * Synthetic preflight-analyzer fixtures for the free-check scoring tests
 * (scripts/test-free-check-scoring.ts). Shapes mirror what
 * src/lib/intelligence/preflight actually produces.
 */
import type { DeriveChecksInput } from "../../src/lib/free-check/deriveChecks";
import type { OnlineSchemaItemKey, OnlineSchemaSignals } from "../../src/lib/free-check/onlineSchema";

const ONLINE_KEYS: OnlineSchemaItemKey[] = ["organization_name", "organization_url", "organization_logo_or_sameas", "website", "product_name", "product_details"];

/** Online-schema checklist signals with the given items present. */
export function onlineSchema(present: Partial<Record<OnlineSchemaItemKey, boolean>>): OnlineSchemaSignals {
  const items = ONLINE_KEYS.map((key) => ({ key, label: key, present: Boolean(present[key]) }));
  return { items, score: Math.round((items.filter((i) => i.present).length / items.length) * 100), productType: present.product_name ? "SoftwareApplication" : null, productWithOffer: false, articleNodes: 0 };
}

type Overrides = Partial<Omit<DeriveChecksInput, "input">> & { input?: Partial<DeriveChecksInput["input"]> };

const EMPTY_ENTITIES = {
  name: { schema: null, homepage: null, footer: null },
  phone: { schema: null, homepage: null, footer: null },
  address: { schema: null, homepage: null, footer: null },
};

export function fixture(base: DeriveChecksInput, o: Overrides = {}): DeriveChecksInput {
  return { ...base, ...o, input: { ...base.input, ...(o.input ?? {}) } };
}

/** Local roofer with LocalBusiness schema but no address, geo, or hours. */
export const ROOFER_NO_ADDRESS_OR_HOURS: DeriveChecksInput = {
  input: { websiteUrl: "https://acme-roofing.com", businessName: "Acme Roofing", city: "Phoenix", state: "Arizona", category: "Roofing" },
  plainText: "acme roofing is a family roofing company in phoenix offering roof repair and roof replacement for homeowners call today for a free estimate",
  readability: { textLength: 900, parsedByReadability: true, fallbackUsed: false, articleTitle: "Acme Roofing", wordCount: 240, preview: "Acme Roofing is a family roofing company…" },
  schema: { score: 50, presentFields: ["name", "telephone", "url"], missingFields: ["address", "geo", "openingHours"], malformedFields: [], detectedTypes: ["RoofingContractor"], rawJsonLdCount: 1, notes: [] },
  crawlability: { score: 75, findings: [], warnings: [], passedChecks: ["homepage_not_noindex", "robots_txt_exists", "robots_txt_not_blocking_all"], failedChecks: ["sitemap_xml_present"] },
  entityConsistency: {
    score: 67,
    extractedEntities: { name: { schema: "Acme Roofing", homepage: "Acme Roofing", footer: null }, phone: { schema: "6025550100", homepage: "6025550199", footer: null }, address: { schema: null, homepage: null, footer: null } },
    inconsistencies: ["phone differs between schema and homepage"],
    confidence: 0.67,
  },
};

/** No local and no online signals at all — must keep today's (local) scoring. */
export const NO_SIGNALS: DeriveChecksInput = {
  input: { websiteUrl: "https://example-co.com", businessName: "Example Co", city: "", state: "", category: "" },
  plainText: "example co helps customers with their projects contact us to learn more about what we do and how we work",
  readability: { textLength: 700, parsedByReadability: true, fallbackUsed: false, articleTitle: "Example Co", wordCount: 180, preview: "Example Co helps customers…" },
  schema: { score: 33, presentFields: ["name", "url"], missingFields: ["address", "telephone", "geo", "openingHours"], malformedFields: [], detectedTypes: ["Organization", "WebSite"], rawJsonLdCount: 1, notes: [] },
  crawlability: { score: 50, findings: [], warnings: [], passedChecks: ["homepage_not_noindex", "robots_txt_exists"], failedChecks: ["canonical_present", "sitemap_xml_present"] },
  entityConsistency: { score: 50, extractedEntities: { ...EMPTY_ENTITIES, name: { schema: "Example Co", homepage: "Example Co", footer: "Example Inc" } }, inconsistencies: ["name differs in footer"], confidence: 0.5 },
};

/** Roofer WITH a street address whose page also has online cues — must stay local. */
export const ROOFER_WITH_ONLINE_CUES: DeriveChecksInput = fixture(ROOFER_NO_ADDRESS_OR_HOURS, {
  input: { city: "Tucson" },
  plainText: "acme roofing pricing sign up for our newsletter log in to the customer portal roof repair and replacement in phoenix free trial of our maintenance plan",
  entityConsistency: {
    score: 67,
    extractedEntities: { name: { schema: "Acme Roofing", homepage: "Acme Roofing", footer: null }, phone: { schema: "6025550100", homepage: "6025550100", footer: null }, address: { schema: null, homepage: "1500 E Camelback Rd, Phoenix, AZ", footer: null } },
    inconsistencies: [],
    confidence: 0.67,
  },
});

/** SaaS product: SoftwareApplication schema, name/url/telephone, no address or hours. */
export const SAAS: DeriveChecksInput = {
  input: { websiteUrl: "https://ledgerly.app", businessName: "Ledgerly", city: "", state: "", category: "" },
  plainText: "ledgerly is invoicing software for freelancers send invoices track payments and reconcile expenses start your free trial today see pricing log in",
  readability: { textLength: 1600, parsedByReadability: true, fallbackUsed: false, articleTitle: "Ledgerly — invoicing software", wordCount: 420, preview: "Ledgerly is invoicing software…" },
  schema: { score: 50, presentFields: ["name", "telephone", "url"], missingFields: ["address", "geo", "openingHours"], malformedFields: [], detectedTypes: ["SoftwareApplication", "Organization"], rawJsonLdCount: 2, notes: [] },
  onlineSchema: onlineSchema({ organization_name: true, organization_url: true, website: true, product_name: true, product_details: true }),
  crawlability: { score: 100, findings: [], warnings: [], passedChecks: ["homepage_not_noindex", "canonical_present", "robots_txt_exists", "robots_txt_not_blocking_all", "sitemap_xml_present"], failedChecks: [] },
  entityConsistency: {
    score: 100,
    extractedEntities: { name: { schema: "Ledgerly", homepage: "Ledgerly", footer: "Ledgerly" }, phone: { schema: "8005550100", homepage: null, footer: "8005550100" }, address: { schema: null, homepage: null, footer: null } },
    inconsistencies: [],
    confidence: 1,
  },
};
