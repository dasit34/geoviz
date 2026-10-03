// Business-type classification for the /check free score (scoring v1.1).
//
// Decides whether a site should be scored as a LOCAL business (storefront /
// service-area: address, city, opening hours matter) or an ONLINE business
// (software, SaaS, e-commerce: those storefront fields don't apply).
//
// Deliberately conservative — local is the default, and ANY local signal
// wins over online signals, so a local business can never gain points by
// being misread as online because its page says "pricing" or "log in".
// Every reason traces to a signal the preflight analyzers computed.

import type {
  EntityConsistencyResult,
  SchemaValidationResult,
} from "@/lib/intelligence/preflight/types";

export type BusinessType = "local" | "online";

export type BusinessTypeClassification = {
  type: BusinessType;
  /** Plain-language reasons for the decision (empty for the default local case). */
  reasons: string[];
};

// LocalBusiness-family @types. Plain "Organization" is intentionally absent:
// online companies use it too.
const LOCAL_TYPES = new Set([
  "LocalBusiness",
  "ProfessionalService",
  "Restaurant",
  "Store",
  "AutoRepair",
  "Dentist",
  "LegalService",
  "MedicalBusiness",
  "RealEstateAgent",
  "RoofingContractor",
  "HVACBusiness",
  "Plumber",
  "Electrician",
  "GeneralContractor",
  "HomeAndConstructionBusiness",
  "HealthAndBeautyBusiness",
  "BeautySalon",
  "DaySpa",
]);

const LOCAL_FIELDS = ["address", "geo", "openingHours"];

const ONLINE_TYPES = new Set([
  "SoftwareApplication",
  "WebApplication",
  "MobileApplication",
  "OnlineBusiness",
  "OnlineStore",
]);

const ONLINE_CATEGORY = /\b(software|saas|apps?|online|e-?commerce|web ?app|platform)\b/i;

const ONLINE_TEXT_CUES = [
  "free trial",
  "sign up",
  "log in",
  "sign in",
  "pricing",
  "api",
  "integrations",
  "per month",
  "app store",
  "google play",
  "start for free",
  "get started for free",
];
const MIN_TEXT_CUES = 3;

// The free check's plain text joins adjacent elements without spaces
// ("06pricingstart", "$99per month"), so a cue only needs no LETTER right
// before it — that still rejects "design in" / "catalog in". Short "api"
// also needs a right-hand boundary ("rapid", "apiary").
function cueRegex(cue: string): RegExp {
  return new RegExp(`(?<![a-z])${cue}${cue === "api" ? "(?![a-z])" : ""}`);
}

export function classifyBusinessType(args: {
  category: string;
  plainText: string;
  schema: SchemaValidationResult | null;
  entityConsistency: EntityConsistencyResult | null;
}): BusinessTypeClassification {
  const { category, plainText, schema, entityConsistency } = args;
  const types = schema?.detectedTypes ?? [];

  const localType = types.find((t) => LOCAL_TYPES.has(t));
  const localField = schema?.presentFields.find((f) => LOCAL_FIELDS.includes(f));
  const address = entityConsistency?.extractedEntities.address;
  const addressFound = Boolean(address?.schema || address?.homepage || address?.footer);
  if (localType || localField || addressFound) {
    return { type: "local", reasons: [] };
  }

  const reasons: string[] = [];
  const onlineType = types.find((t) => ONLINE_TYPES.has(t));
  if (onlineType) reasons.push(`${onlineType} structured data`);
  if (category.trim() && ONLINE_CATEGORY.test(category)) reasons.push("an online business category");
  const cues = ONLINE_TEXT_CUES.filter((c) => cueRegex(c).test(plainText));
  if (cues.length >= MIN_TEXT_CUES) reasons.push(`online product language on the homepage (${cues.slice(0, 4).join(", ")})`);

  return reasons.length > 0 ? { type: "online", reasons } : { type: "local", reasons: [] };
}
