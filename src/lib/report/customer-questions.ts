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

/** Strip a trailing/leading article and tidy a detected "reads as" business
 *  type into a usable noun ("an AI visibility intelligence service" → "AI
 *  visibility intelligence services"). Best-effort; falls back to a generic. */
function nounFromBusinessType(businessType: string | null): { noun: string; singular: string } {
  const fallback = { noun: "businesses like this", singular: "business" };
  if (!businessType) return fallback;
  let t = businessType.trim().replace(/^(an?|the)\s+/i, "").trim();
  if (!t) return fallback;
  // Lowercase the leading word unless it looks like an acronym (AI, SaaS, HVAC).
  if (!/^[A-Z]{2,}/.test(t)) t = t.charAt(0).toLowerCase() + t.slice(1);
  const singular = t;
  // Naive pluralization for the "best X" phrasing.
  const noun = /(s|sh|ch|x|z)$/i.test(t)
    ? `${t}es`
    : /[^aeiou]y$/i.test(t)
      ? `${t.slice(0, -1)}ies`
      : `${t}s`;
  return { noun, singular };
}

/** Pick the city token for phrasing. Keeps the detected location verbatim
 *  (e.g. "Toledo, OH" / "Northwest Ohio") but trims a trailing "area"/"region"/
 *  "metro" so "near {city}" doesn't read "near Northwest Ohio area". */
function cityPhrase(city: string | null): string | null {
  const t = (city ?? "").trim().replace(/\s+(area|region|metro)\.?$/i, "").trim();
  return t.length > 0 ? t : null;
}

/** Lowercase the leading character of a detected service so it reads naturally
 *  mid-sentence ("a Roof replacement company" → "a roof replacement company"),
 *  unless it starts with an acronym ("HVAC", "AI"). */
function lowerLead(s: string): string {
  const t = s.trim();
  if (!t || /^[A-Z]{2,}/.test(t)) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
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
  const service = input.services.find((s) => s.trim().length > 0)?.trim() ?? null;

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
    add(`Can you recommend a ${svc} company in ${city}?`);
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
    // Non-local / general business — category-neutral, no city.
    add(`Who are the best ${noun} to consider?`);
    add(`Can you recommend a reliable ${svc}?`);
    add(`Is ${name} trustworthy and legitimate?`);
    add(`What should I look for when choosing a ${singular}?`);
    add(`Which ${noun} should I consider?`);
  }

  return out.slice(0, 5);
}
