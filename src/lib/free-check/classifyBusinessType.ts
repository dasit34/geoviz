// Business-type classification for the /check free score (scoring v1.3).
//
// GeoViz scores two business types: LOCAL (storefront / service-area) and
// ONLINE (software / SaaS / app). Everything else is recognized but NOT
// scored: PUBLISHER (news / media), ECOMMERCE (online stores), UNCERTAIN
// (conflicting or too-weak evidence) and INSUFFICIENT_EVIDENCE (too little
// readable content, e.g. a JavaScript-only page).
//
// Deterministic; no brand or domain lists. Every outcome carries reasons that
// trace to a computed signal.
//
//   1. Decisive evidence: a LocalBusiness-family schema type → local;
//      NewsMediaOrganization / Periodical → publisher; SoftwareApplication /
//      WebApplication / MobileApplication → online; a city / state the user
//      provided → local; a business category the user provided.
//   2. Evidence points from general page structure (pageSignals.ts) and text:
//        publisher — article schema, og:article meta, headline links,
//                    bylines, date stamps, news/section navigation, feeds,
//                    news phrases
//        ecommerce — Product/Offer/ItemList schema, product/collection links,
//                    one-time prices, cart/checkout navigation, commerce-
//                    platform metadata, store phrases
//        online    — software phrases
//        local     — address/geo/hours in schema, a street address, or a
//                    "City, ST 12345" pattern (weak: stores and publishers
//                    list head-office addresses too)
//   3. The strongest of publisher / ecommerce / online with ≥ 3 points wins
//      (an exact tie is uncertain). Publisher and store evidence override weak
//      local evidence; software phrases alone don't.
//   4. Too little readable content → insufficient_evidence; else uncertain.

import type {
  EntityConsistencyResult,
  SchemaValidationResult,
} from "@/lib/intelligence/preflight/types";
import type { OnlineSchemaSignals } from "./onlineSchema";
import type { PageSignals } from "./pageSignals";

export type BusinessType = "local" | "online" | "publisher" | "ecommerce" | "uncertain" | "insufficient_evidence";

/** Types GeoViz scores. Every other type gets no overall score and no fixes. */
export const SCORED_BUSINESS_TYPES: readonly BusinessType[] = ["local", "online"];

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

const CATEGORY: Array<[Exclude<BusinessType, "local" | "uncertain" | "insufficient_evidence">, RegExp]> = [
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
/** Points a kind needs to be chosen (local's page evidence is weak, so it needs less to stand alone). */
const MIN_POINTS = 3;
/** Fewer readable words than this, with no decisive evidence → insufficient evidence. */
const MIN_READABLE_WORDS = 50;

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
function matchCues(text: string, kind: keyof typeof TEXT_CUES): string[] {
  const hits = TEXT_CUES[kind].filter((c) => cueRegex(c).test(text));
  return hits.filter((c) => !hits.some((o) => o !== c && o.includes(c)));
}

type Evidence = { points: number; reasons: string[] };
function add(e: Evidence, points: number, reason: string): void {
  e.points += points;
  e.reasons.push(reason);
}

export function classifyBusinessType(args: {
  category: string;
  plainText: string;
  schema: SchemaValidationResult | null;
  entityConsistency: EntityConsistencyResult | null;
  onlineSchema?: OnlineSchemaSignals | null;
  pageSignals?: PageSignals | null;
  readableWords?: number;
  city?: string;
  state?: string;
}): BusinessTypeClassification {
  const { category, plainText, schema, entityConsistency, onlineSchema } = args;
  const page = args.pageSignals ?? null;
  const types = schema?.detectedTypes ?? [];
  const find = (set: Set<string>) => types.find((t) => set.has(t));

  // 1. Decisive evidence.
  const localType = find(LOCAL_TYPES);
  if (localType) return { type: "local", reasons: [`${localType} structured data`] };
  const publisherType = find(PUBLISHER_IDENTITY_TYPES);
  if (publisherType) return { type: "publisher", reasons: [`${publisherType} structured data`] };
  const softwareType = find(SOFTWARE_TYPES);
  if (softwareType) return { type: "online", reasons: [`${softwareType} structured data`] };
  if ((args.city ?? "").trim() || (args.state ?? "").trim()) return { type: "local", reasons: ["a city or state was provided for the business"] };
  const cat = category.trim();
  if (cat) {
    const hit = CATEGORY.find(([, re]) => re.test(cat));
    return { type: hit ? hit[0] : "local", reasons: [`the business category "${cat.slice(0, 60)}"`] };
  }

  // 2. Evidence points.
  const publisher: Evidence = { points: 0, reasons: [] };
  const articleNodes = onlineSchema?.articleNodes ?? 0;
  if (types.includes("NewsArticle") || articleNodes >= 2) add(publisher, 3, types.includes("NewsArticle") ? "NewsArticle structured data" : `${articleNodes} article entries in structured data`);
  else if (articleNodes === 1) add(publisher, 2, "article structured data");
  if (page?.ogArticle) add(publisher, 2, "article metadata");
  if ((page?.headlineLinks ?? 0) >= 8) add(publisher, 3, `${page!.headlineLinks} headline links`);
  else if ((page?.headlineLinks ?? 0) >= 4) add(publisher, 2, `${page!.headlineLinks} headline links`);
  if ((page?.bylines ?? 0) >= 3) add(publisher, 2, "author bylines");
  if ((page?.dateStamps ?? 0) >= 3) add(publisher, 2, "publication timestamps");
  if ((page?.newsNavItems.length ?? 0) >= 4) add(publisher, 2, `news section navigation (${page!.newsNavItems.slice(0, 4).join(", ")})`);
  if ((page?.feedLinks ?? 0) > 0) add(publisher, 1, "an RSS / Atom feed");
  const newsCues = matchCues(plainText, "publisher");
  if (newsCues.length >= MIN_TEXT_CUES) add(publisher, 2, `news language (${newsCues.slice(0, 3).join(", ")})`);

  const ecommerce: Evidence = { points: 0, reasons: [] };
  if (onlineSchema?.productWithOffer || types.includes("OnlineStore")) add(ecommerce, 3, onlineSchema?.productWithOffer ? "Product structured data with an offer" : "OnlineStore structured data");
  else if (types.includes("Product") || types.includes("ItemList")) add(ecommerce, 2, `${types.includes("Product") ? "Product" : "ItemList"} structured data`);
  if (page?.commercePlatform) add(ecommerce, 3, `${page.commercePlatform} store metadata`);
  if ((page?.productLinks ?? 0) >= 6) add(ecommerce, 3, `${page!.productLinks} product or collection links`);
  else if ((page?.productLinks ?? 0) >= 3) add(ecommerce, 2, `${page!.productLinks} product or collection links`);
  if ((page?.prices ?? 0) >= 6) add(ecommerce, 2, `${page!.prices} product prices`);
  if ((page?.cartNav ?? 0) > 0) add(ecommerce, 2, "cart or checkout navigation");
  const storeCues = matchCues(plainText, "ecommerce");
  if (storeCues.length >= MIN_TEXT_CUES) add(ecommerce, 2, `store language (${storeCues.slice(0, 3).join(", ")})`);

  const online: Evidence = { points: 0, reasons: [] };
  const softwareCues = matchCues(plainText, "online");
  if (softwareCues.length >= MIN_TEXT_CUES) add(online, 3, `online product language on the homepage (${softwareCues.slice(0, 4).join(", ")})`);

  const localField = schema?.presentFields.find((f) => LOCAL_FIELDS.includes(f));
  const address = entityConsistency?.extractedEntities.address;
  const weakLocal = localField
    ? `${localField} in business structured data`
    : address?.schema || address?.homepage || address?.footer
      ? "a street address on the website"
      : CITY_STATE_ZIP.test(plainText)
        ? "a city, state, and ZIP code on the homepage"
        : null;

  // 3. Decide. The strongest of publisher / ecommerce / online with at least
  //    3 points wins; an exact tie is uncertain. A page address (weak local)
  //    beats software phrases alone — local service sites have "pricing" and
  //    "sign in" too — but not publisher or store evidence.
  const ranked = ([["publisher", publisher], ["ecommerce", ecommerce], ["online", online]] as const)
    .slice()
    .sort((a, b) => b[1].points - a[1].points);
  const [top, next] = ranked;
  if (top[1].points >= MIN_POINTS) {
    if (top[1].points === next[1].points) {
      return { type: "uncertain", reasons: [`mixed signals: ${top[0]} (${top[1].reasons.join("; ")}) and ${next[0]} (${next[1].reasons.join("; ")}) evidence are equally strong`] };
    }
    if (top[0] === "online" && weakLocal) return { type: "local", reasons: [weakLocal] };
    return { type: top[0], reasons: top[1].reasons };
  }
  if (weakLocal) return { type: "local", reasons: [weakLocal] };

  // 4. Not enough evidence either way.
  if ((args.readableWords ?? Infinity) < MIN_READABLE_WORDS) {
    return { type: "insufficient_evidence", reasons: [`only ${args.readableWords} readable words on the homepage`] };
  }
  const partial = [...publisher.reasons, ...ecommerce.reasons, ...online.reasons];
  return { type: "uncertain", reasons: [partial.length ? `too little evidence to decide (${partial.join("; ")})` : "no clear local, online, store, or publisher signals"] };
}
