/**
 * customer-questions.ts — deterministic "Customer Questions Tested".
 *
 * Generates the buyer-intent questions a real customer would ask an AI before
 * choosing a business, built ENTIRELY from data the audit already has (business
 * name, industry slug, detected city, detected services). No LLM, no network,
 * no scoring impact — same inputs always produce the same questions, so the
 * report stays reproducible.
 *
 * Customer-facing rule: these are "questions", never "prompts". And we never
 * invent a city the audit didn't actually detect — when location is unknown we
 * fall back to area-neutral phrasing.
 */

/** Per-vertical question vocabulary. `noun` is plural ("roofers") for "best X";
 *  `singular` is for "Is {business} a trustworthy {singular}?"; `urgentProblem`
 *  powers the "who should I call for ..." question; `service` powers the
 *  "recommend a ... company" question. */
type VerticalProfile = {
  noun: string;
  singular: string;
  urgentProblem: string | null;
  service: string;
};

const VERTICAL_QUESTION_PROFILES: Record<string, VerticalProfile> = {
  roofing: { noun: "roofers", singular: "roofer", urgentProblem: "a roof leak", service: "roof repair" },
  hvac: { noun: "HVAC companies", singular: "HVAC company", urgentProblem: "no heat or AC", service: "HVAC repair" },
  plumbing: { noun: "plumbers", singular: "plumber", urgentProblem: "a burst pipe", service: "plumbing repair" },
  electrical: { noun: "electricians", singular: "electrician", urgentProblem: "an electrical problem", service: "electrical work" },
  landscaping: { noun: "landscapers", singular: "landscaper", urgentProblem: "urgent yard cleanup", service: "landscaping" },
  legal: { noun: "lawyers", singular: "lawyer", urgentProblem: "urgent legal help", service: "legal representation" },
  dental: { noun: "dentists", singular: "dentist", urgentProblem: "a dental emergency", service: "a dental checkup" },
  medical: { noun: "medical providers", singular: "medical provider", urgentProblem: "an urgent medical concern", service: "a consultation" },
  restaurant: { noun: "restaurants", singular: "restaurant", urgentProblem: null, service: "a reservation" },
  salon: { noun: "salons", singular: "salon", urgentProblem: "a last-minute appointment", service: "a haircut or styling" },
  real_estate: { noun: "real estate agents", singular: "real estate agent", urgentProblem: "help buying or selling a home", service: "a home valuation" },
  automotive: { noun: "auto shops", singular: "auto shop", urgentProblem: "a car breakdown", service: "auto repair" },
  contractor: { noun: "contractors", singular: "contractor", urgentProblem: "an urgent home repair", service: "a renovation" },
  local_services: { noun: "local service providers", singular: "service provider", urgentProblem: "an urgent job", service: "this service" },
  home_services: { noun: "home service companies", singular: "home service company", urgentProblem: "an urgent home repair", service: "this service" },
};

/** Construction/service nouns that are uncountable — never pluralized, so a
 *  question never reads "best sidings" / "best roofings". */
const UNCOUNTABLE_NOUNS = new Set([
  "siding", "roofing", "remodeling", "remodelling", "fencing", "flooring",
  "framing", "decking", "plumbing", "paving", "landscaping", "contracting",
  "consulting", "marketing", "insurance", "software", "analytics", "hvac",
]);

/** Collapse a long detected business-type phrase to its head noun so generated
 *  questions stay short and natural. "home remodeling contractor specializing in
 *  windows, doors, roofing, and siding" → "home remodeling contractor". */
function simplifyBusinessType(phrase: string): string {
  let t = phrase.trim();
  // Drop a trailing qualifier clause ("… specializing in …", "… offering …").
  t = t.split(
    /\s+(?:specializing|specialising|specializes|specialises|offering|providing|serving|focused|focusing)\b/i,
  )[0];
  // Drop a trailing list clause introduced by a comma or dash.
  t = t.split(/[,—–]| - /)[0];
  t = t.replace(/\s+/g, " ").trim();
  // Still long? Keep the head noun phrase (last 3 words — the noun usually
  // trails: "… remodeling contractor").
  const words = t.split(" ");
  if (words.length > 4) t = words.slice(-3).join(" ");
  return t.trim();
}

/** Pluralize ONLY the last word of a noun phrase ("home remodeling contractor"
 *  → "home remodeling contractors"), leaving uncountable trailing nouns alone. */
function pluralizeLastWord(phrase: string): string {
  const words = phrase.split(" ");
  const i = words.length - 1;
  const last = words[i];
  if (!last || UNCOUNTABLE_NOUNS.has(last.toLowerCase())) return phrase;
  words[i] = /(s|sh|ch|x|z)$/i.test(last)
    ? `${last}es`
    : /[^aeiou]y$/i.test(last)
      ? `${last.slice(0, -1)}ies`
      : `${last}s`;
  return words.join(" ");
}

/** Strip a trailing/leading article and tidy a detected "reads as" business
 *  type into a usable noun. Long phrases are simplified to a head noun, and
 *  pluralization acts on the last word only ("home remodeling contractor
 *  specializing in …, siding" → singular "home remodeling contractor", plural
 *  "home remodeling contractors"). Best-effort; falls back to a generic. */
function nounFromBusinessType(businessType: string | null): { noun: string; singular: string } {
  const fallback = { noun: "businesses like this", singular: "business" };
  if (!businessType) return fallback;
  let t = simplifyBusinessType(businessType.trim().replace(/^(an?|the)\s+/i, "").trim());
  if (!t) return fallback;
  // Lowercase the leading word unless it looks like an acronym (AI, SaaS, HVAC).
  if (!/^[A-Z]{2,}/.test(t)) t = t.charAt(0).toLowerCase() + t.slice(1);
  const singular = t;
  const noun = pluralizeLastWord(t);
  return { noun, singular };
}

/** Pick the city token for phrasing. Keeps a real detected location verbatim
 *  (e.g. "Toledo, OH" / "Northwest Ohio") but sanitizes the model-supplied
 *  string so internal caveats never leak into a customer-facing question:
 *   • Strips parenthetical asides — a model sometimes returns
 *     "Ohio (inferred from business name; service area not specified)".
 *   • Cuts a trailing caveat clause after ;/:/dash (NOT comma — keeps the
 *     state in "Toledo, OH").
 *   • Trims a trailing "area"/"region"/"metro" so "near {city}" doesn't read
 *     "near Northwest Ohio area".
 *   • Returns null when only caveat residue remains, so phrasing falls back to
 *     the area-neutral form rather than inventing or leaking a location. */
function cityPhrase(city: string | null): string | null {
  let t = (city ?? "").trim();
  // Drop parenthetical caveats first (the caveat carries its own ; and would
  // otherwise survive the separator split below).
  t = t.replace(/\s*\([^)]*\)/g, " ").replace(/\s*\([^)]*$/, "");
  // Cut a trailing caveat clause introduced by a separator — comma excluded so
  // "Toledo, OH" keeps its state.
  t = t.split(/[;:–—]| - /)[0] ?? "";
  t = t.replace(/\s+(area|region|metro)\.?$/i, "").replace(/\s+/g, " ").trim();
  // Reject caveat-only / non-location residue.
  if (
    !t ||
    !/[a-z]/i.test(t) ||
    /^(not|no|inferred|unknown|unspecified|n\/?a)\b/i.test(t)
  ) {
    return null;
  }
  return t;
}

/** Lowercase the leading character of a detected service so it reads naturally
 *  mid-sentence ("a Roof replacement company" → "a roof replacement company"),
 *  unless it starts with an acronym ("HVAC", "AI"). */
function lowerLead(s: string): string {
  const t = s.trim();
  if (!t || /^[A-Z]{2,}/.test(t)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

/** Pick "a" / "an" for the word that follows. Vowel-sound aware, with acronym
 *  handling: an initialism whose first letter is spoken with a leading vowel
 *  sound ("AI", "HVAC", "MRI") takes "an"; "roofer" takes "a". Keeps generated
 *  questions grammatical regardless of the detected business noun. */
function indefiniteArticle(nextWord: string): "a" | "an" {
  const first = nextWord.trim().split(/\s+/)[0] ?? "";
  if (!first) return "a";
  // Initialism (2+ caps): decide by the spoken name of its first letter.
  if (/^[A-Z]{2,}/.test(first)) return /^[AEFHILMNORSX]/.test(first) ? "an" : "a";
  return /^[aeiou]/i.test(first) ? "an" : "a";
}

/** A detected service is only usable in "recommend a {service}" phrasing when it
 *  reads as a short noun phrase. Long, sentence-like detections (e.g. "testing
 *  business visibility across major AI systems") are rejected so the question
 *  falls back to the vertical / business-type noun instead of leaking a phrase. */
function usableService(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 28 && t.split(/\s+/).length <= 3;
}

const SUPPLIER_RE =
  /\b(supply|supplies|supplier|suppliers|distribution|distributor|distributors|wholesale|wholesaler|wholesalers|materials|building products)\b/i;

/** A supplier / distributor / wholesaler / materials business sells products —
 *  it is NOT a contractor who performs the trade, so it must not get
 *  "best roofers"-style contractor questions. Detected from the business name
 *  or the model-detected "reads as" type. */
function isSupplierBusiness(name: string, businessType: string | null): boolean {
  return SUPPLIER_RE.test(name) || (businessType ? SUPPLIER_RE.test(businessType) : false);
}

const SUPPLY_CATEGORY_RE =
  /\b([a-z][a-z-]+)\s+(?:supply|supplies|materials|distribution|distributors?|wholesale|wholesalers?)\b/i;
const TRADE_ADJECTIVES = new Set([
  "roofing", "hvac", "plumbing", "electrical", "flooring", "lumber", "masonry",
  "concrete", "paint", "hardware", "landscaping", "building", "industrial",
]);

/** Category adjective for supplier phrasing: the word before the supply keyword
 *  in the name ("Beacon Roofing Supply" → "roofing"); else a known trade slug;
 *  else the neutral "building products". */
function supplierCategory(name: string, slug: string | null | undefined): string {
  const m = name.match(SUPPLY_CATEGORY_RE);
  if (m && m[1] && m[1].toLowerCase() !== "the") return m[1].toLowerCase();
  if (slug && TRADE_ADJECTIVES.has(slug.toLowerCase())) return slug.toLowerCase();
  return "building products";
}

/** Buyer-intent questions for a supplier/distributor — products, not a trade. */
function buildSupplierQuestions(
  name: string,
  category: string,
  city: string | null,
): string[] {
  const isGeneric = category === "building products";
  const catPlural = isGeneric ? "building products suppliers" : `${category} supply companies`;
  const materialsSupplier = isGeneric ? "building products supplier" : `${category} materials supplier`;
  const materialsPhrase = isGeneric ? "building products" : `${category} materials`;
  const near = city ? `near ${city}` : "near me";
  return [
    `Who are the best ${catPlural} ${near}?`,
    `Where can I buy reliable ${materialsPhrase}?`,
    `Is ${name} trustworthy and legitimate?`,
    `What should I look for when choosing ${indefiniteArticle(materialsSupplier)} ${materialsSupplier}?`,
    `Which ${catPlural} should I compare?`,
  ];
}

export type CustomerQuestionInput = {
  businessName: string;
  industrySlug: string | null | undefined;
  /** A model-detected location, or null when none was found. */
  city: string | null;
  /** Detected services (already de-duplicated), may be empty. */
  services: string[];
  /** Detected "reads as" business type — used as a noun fallback for non-local. */
  businessType: string | null;
  isLocal: boolean;
};

/**
 * Build up to 5 buyer-intent customer questions. Always returns at least the
 * trust + choice questions, which need no location/service data.
 */
export function buildCustomerQuestions(input: CustomerQuestionInput): string[] {
  const name = input.businessName?.trim() || "this business";
  const city = cityPhrase(input.city);

  // Supplier / distributor / wholesaler / materials businesses are not
  // contractors — give them product-buying questions, never "best roofers".
  if (isSupplierBusiness(name, input.businessType)) {
    return buildSupplierQuestions(
      name,
      supplierCategory(name, input.industrySlug),
      city,
    );
  }

  const service = input.services.find((s) => usableService(s))?.trim() ?? null;

  const profile = input.industrySlug
    ? VERTICAL_QUESTION_PROFILES[input.industrySlug]
    : undefined;

  // Resolve nouns: prefer the vertical profile; else derive from the detected
  // "reads as" business type; else a neutral fallback.
  const { noun, singular } = profile
    ? { noun: profile.noun, singular: profile.singular }
    : nounFromBusinessType(input.businessType);
  const svc = lowerLead(service ?? profile?.service ?? singular);
  const urgent = profile?.urgentProblem ?? null;

  const out: string[] = [];
  const add = (q: string) => {
    if (q && !out.includes(q)) out.push(q);
  };

  if (input.isLocal && city) {
    add(`Who are the best ${noun} near ${city}?`);
    add(`Can you recommend ${indefiniteArticle(svc)} ${svc} company in ${city}?`);
    add(`Is ${name} a trustworthy ${singular}?`);
    if (urgent) add(`Who should I call for ${urgent} near ${city}?`);
    add(`Which ${noun} should I consider near ${city}?`);
  } else if (input.isLocal) {
    // Local vertical but no detected city — never invent one.
    add(`Who are the best ${noun} in your area?`);
    add(`Can you recommend a reliable ${svc} provider nearby?`);
    add(`Is ${name} a trustworthy ${singular}?`);
    if (urgent) add(`Who should I call for ${urgent} nearby?`);
    add(`Which ${noun} should I consider?`);
  } else {
    // Non-local / general business — category-neutral, no city. Questions
    // revolve around the business-type noun (a detected service phrase here is
    // often plural/sentence-like and reads wrong after "a reliable …").
    add(`Who are the best ${noun} to consider?`);
    add(`Can you recommend a reliable ${singular}?`);
    add(`Is ${name} trustworthy and legitimate?`);
    add(`What should I look for when choosing ${indefiniteArticle(singular)} ${singular}?`);
    add(`Which ${noun} should I consider?`);
  }

  return out.slice(0, 5);
}
