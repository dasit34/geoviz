// Business-type classification for the /check free score (scoring v1.3).
//
// GeoViz scores two business types with full rubrics — LOCAL (storefront /
// service-area) and ONLINE (software / SaaS / app) — and scores UNCERTAIN
// sites on the checks that apply to any business. PUBLISHER (news / media)
// and ECOMMERCE (online stores) are recognized but deliberately outside the
// supported scoring scope: they get no overall score and no storefront advice.
//
// Deterministic and evidence-ordered; no brand or domain lists. Every
// outcome carries plain-language reasons that trace to a computed signal.
//
//   1. Declared schema types, strongest first: LocalBusiness family → local;
//      NewsMediaOrganization / Periodical → publisher; SoftwareApplication /
//      WebApplication / MobileApplication → online; Product with an Offer /
//      OnlineStore → ecommerce; NewsArticle or 3+ Article/BlogPosting nodes
//      → publisher.
//   2. Local evidence. A city / state the user provided is decisive. Address /
//      geo / openingHours in the business schema, a street address on the
//      page, or a "City, ST 12345" pattern is WEAK evidence (online stores and
//      publishers list a head-office address too): with 3+ store or news cues
//      on the homepage it becomes uncertain instead of local.
//   3. The user's category (the /check form; the MCP tool's optional input).
//   4. Text cues: 3+ distinct cues of one kind (software / store / publisher);
//      the kind with the most cues wins, a tie is uncertain.
//   5. Otherwise uncertain — never a silent default to local.

import type {
  EntityConsistencyResult,
  SchemaValidationResult,
} from "@/lib/intelligence/preflight/types";
import type { OnlineSchemaSignals } from "./onlineSchema";

export type BusinessType = "local" | "online" | "publisher" | "ecommerce" | "uncertain";

/** Types GeoViz scores. Publisher and ecommerce are recognized but not scored. */
export const SCORED_BUSINESS_TYPES: readonly BusinessType[] = ["local", "online", "uncertain"];

export type BusinessTypeClassification = {
  type: BusinessType;
  /** Plain-language reasons for the decision. */
  reasons: string[];
};

// LocalBusiness-family @types. Plain "Organization" is intentionally absent:
// online companies and publishers use it too.
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
const PUBLISHER_IDENTITY_TYPES = new Set(["NewsMediaOrganization", "Periodical"]);
const SOFTWARE_TYPES = new Set(["SoftwareApplication", "WebApplication", "MobileApplication"]);
const ARTICLE_NODES_MIN = 3;

const CATEGORY: Array<[Exclude<BusinessType, "local" | "uncertain">, RegExp]> = [
  ["ecommerce", /\b(e-?commerce|online (store|shop)|webshop)\b/i],
  ["online", /\b(software|saas|apps?|web ?app|platform|online)\b/i],
  ["publisher", /\b(news|media|publisher|publishing|magazine)\b/i],
];

const TEXT_CUES: Record<"online" | "ecommerce" | "publisher", string[]> = {
  online: ["free trial", "sign up", "log in", "sign in", "pricing", "api", "integrations", "per month", "app store", "google play", "start for free", "get started for free"],
  ecommerce: ["add to cart", "add to bag", "checkout", "free shipping", "shop now", "shop all", "free returns", "your cart", "in stock", "out of stock", "gift card"],
  publisher: ["breaking news", "latest news", "top headlines", "headlines", "top stories", "most read", "most popular", "editor's picks", "live updates", "opinion"],
};
const MIN_TEXT_CUES = 3;

// The free check's plain text joins adjacent elements without spaces
// ("06pricingstart", "$99per month"), so a cue only needs no LETTER right
// before it — that still rejects "design in" / "catalog in". Short "api"
// also needs a right-hand boundary ("rapid", "apiary").
function cueRegex(cue: string): RegExp {
  const escaped = cue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z])${escaped}${cue === "api" ? "(?![a-z])" : ""}`);
}

const US_STATES = "al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy|dc";
// "denver, co 80202" — a city, a comma, a state code, a ZIP (lowercased text).
const CITY_STATE_ZIP = new RegExp(`[a-z]{3,},\\s*(?:${US_STATES})\\s+\\d{5}(?:-\\d{4})?(?!\\d)`);

/** Distinct cues of each kind found in the text; a cue contained in a longer matched cue isn't counted twice. */
function matchCues(text: string): Array<{ kind: keyof typeof TEXT_CUES; cues: string[] }> {
  return (Object.keys(TEXT_CUES) as Array<keyof typeof TEXT_CUES>).map((kind) => {
    const hits = TEXT_CUES[kind].filter((c) => cueRegex(c).test(text));
    return { kind, cues: hits.filter((c) => !hits.some((o) => o !== c && o.includes(c))) };
  });
}

export function classifyBusinessType(args: {
  category: string;
  plainText: string;
  schema: SchemaValidationResult | null;
  entityConsistency: EntityConsistencyResult | null;
  onlineSchema?: OnlineSchemaSignals | null;
  city?: string;
  state?: string;
}): BusinessTypeClassification {
  const { category, plainText, schema, entityConsistency, onlineSchema } = args;
  const types = schema?.detectedTypes ?? [];
  const find = (set: Set<string>) => types.find((t) => set.has(t));

  // 1. Declared schema types, strongest first.
  const localType = find(LOCAL_TYPES);
  if (localType) return { type: "local", reasons: [`${localType} structured data`] };
  const publisherType = find(PUBLISHER_IDENTITY_TYPES);
  if (publisherType) return { type: "publisher", reasons: [`${publisherType} structured data`] };
  const softwareType = find(SOFTWARE_TYPES);
  if (softwareType) return { type: "online", reasons: [`${softwareType} structured data`] };
  if (onlineSchema?.productWithOffer || types.includes("OnlineStore")) {
    return { type: "ecommerce", reasons: [onlineSchema?.productWithOffer ? "Product structured data with an offer" : "OnlineStore structured data"] };
  }
  const articleNodes = onlineSchema?.articleNodes ?? 0;
  if (types.includes("NewsArticle") || articleNodes >= ARTICLE_NODES_MIN) {
    return { type: "publisher", reasons: [types.includes("NewsArticle") ? "NewsArticle structured data" : `${articleNodes} article entries in structured data`] };
  }

  // 2. Local evidence: a user-provided city / state is decisive; page
  //    evidence is weak and yields to strong store / news language.
  if ((args.city ?? "").trim() || (args.state ?? "").trim()) return { type: "local", reasons: ["a city or state was provided for the business"] };
  const cueMatches = matchCues(plainText);
  const localField = schema?.presentFields.find((f) => LOCAL_FIELDS.includes(f));
  const address = entityConsistency?.extractedEntities.address;
  const weakLocal = localField
    ? `${localField} in business structured data`
    : address?.schema || address?.homepage || address?.footer
      ? "a street address on the website"
      : CITY_STATE_ZIP.test(plainText)
        ? "a city, state, and ZIP code on the homepage"
        : null;
  if (weakLocal) {
    const conflict = cueMatches.find((c) => (c.kind === "ecommerce" || c.kind === "publisher") && c.cues.length >= MIN_TEXT_CUES);
    if (conflict) {
      const label = conflict.kind === "ecommerce" ? "online store" : "news / publishing";
      return { type: "uncertain", reasons: [`mixed signals: ${weakLocal}, but also ${label} language (${conflict.cues.slice(0, 4).join(", ")})`] };
    }
    return { type: "local", reasons: [weakLocal] };
  }

  // 3. The user's category (a non-matching category, e.g. "Roofing", is local intent).
  const cat = category.trim();
  if (cat) {
    const hit = CATEGORY.find(([, re]) => re.test(cat));
    return { type: hit ? hit[0] : "local", reasons: [`the business category "${cat.slice(0, 60)}"`] };
  }

  // 4. Text cues — the kind with the most distinct cues (at least 3) wins.
  const qualifying = cueMatches
    .filter((c) => c.cues.length >= MIN_TEXT_CUES)
    .sort((a, b) => b.cues.length - a.cues.length);
  if (qualifying.length > 0 && (qualifying.length === 1 || qualifying[0]!.cues.length > qualifying[1]!.cues.length)) {
    const top = qualifying[0]!;
    const label = { online: "online product", ecommerce: "online store", publisher: "news / publishing" }[top.kind];
    return { type: top.kind, reasons: [`${label} language on the homepage (${top.cues.slice(0, 4).join(", ")})`] };
  }
  if (qualifying.length > 1) {
    return { type: "uncertain", reasons: [`mixed signals on the homepage (${qualifying.map((q) => q.kind).join(" and ")} language)`] };
  }

  // 5. Not enough evidence either way.
  return { type: "uncertain", reasons: ["no clear local, online, store, or publisher signals"] };
}
