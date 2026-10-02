/**
 * Evaluate a task's expectation against an independently fetched page
 * (pure). Outcomes:
 *   verified          — the expected change is present on the page now
 *   not_found         — page fetched, change not present ("Change not found yet")
 *   could_not_verify  — page couldn't be fetched/checked (never treated as pass or fail)
 * Presence of content on a page says nothing about indexing or rankings.
 */
import type { ExtractedPage } from "../website/extract";
import type { PageFetchStatus } from "../website/scanner";
import type { Expectation } from "./drafts";
import { digits } from "./facts";
import { untrustedText } from "./sanitize";

export type VerificationOutcome = "verified" | "not_found" | "could_not_verify";

export type CheckedPage = { url: string; fetchStatus: PageFetchStatus; httpStatus: number | null; extracted: ExtractedPage | null };

export type Evaluation = { outcome: VerificationOutcome; expected: string; observed: string };

const LB = /LocalBusiness|HVACBusiness|Plumber|RoofingContractor|Electrician|GeneralContractor|HomeAndConstructionBusiness|LegalService|Attorney|Dentist|MedicalBusiness|RealEstateAgent|AutoRepair|BeautySalon|Restaurant|ProfessionalService/;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Which URL a check fetches (null → cannot verify without one). */
export function checkUrlFor(exp: Expectation, implementationUrl: string | null): string | null {
  switch (exp.type) {
    case "structured_data":
    case "title_description":
    case "identity_match":
    case "page_available":
      return exp.url;
    case "page_with_keyword":
    case "faq_present":
      return implementationUrl;
    default:
      return null;
  }
}

export function describeExpected(exp: Expectation): string {
  switch (exp.type) {
    case "structured_data":
      return `LocalBusiness structured data on the homepage${exp.phoneDigits ? ` with phone ${exp.phoneDigits}` : ""}${exp.name ? ` and name "${exp.name}"` : ""}`;
    case "title_description":
      return `A new page title or description${exp.mustIncludeAny.length ? ` that mentions ${exp.mustIncludeAny.map((s) => `"${s}"`).join(" or ")}` : ""}`;
    case "page_with_keyword":
      return `A published page whose title or main heading mentions "${exp.keyword}"`;
    case "faq_present":
      return `At least one of the drafted questions (or FAQ structured data) on the published page`;
    case "identity_match":
      return `Homepage shows the confirmed${exp.name ? ` name "${exp.name}"` : ""}${exp.phoneDigits ? ` and phone ${exp.phoneDigits}` : ""}`;
    case "page_available":
      return "The page loads again (or redirects to another page on your site)";
    default:
      return exp.instructions;
  }
}

export function evaluate(exp: Expectation, page: CheckedPage): Evaluation {
  const expected = describeExpected(exp);
  if (exp.type === "manual") return { outcome: "could_not_verify", expected, observed: "Needs an operator check." };

  if (exp.type === "page_available") {
    if (page.fetchStatus === "ok") return { outcome: "verified", expected, observed: `Page loaded (HTTP ${page.httpStatus ?? 200})` };
    if (page.fetchStatus === "not_found") return { outcome: "not_found", expected, observed: `Still returns HTTP ${page.httpStatus ?? 404}` };
    return { outcome: "could_not_verify", expected, observed: `Couldn't fetch the page (${page.fetchStatus})` };
  }
  if (page.fetchStatus !== "ok" || !page.extracted) {
    if (page.fetchStatus === "not_found" && (exp.type === "page_with_keyword" || exp.type === "faq_present")) {
      return { outcome: "not_found", expected, observed: `The page address returns HTTP ${page.httpStatus ?? 404}` };
    }
    return { outcome: "could_not_verify", expected, observed: `Couldn't fetch the page (${page.fetchStatus}${page.httpStatus ? `, HTTP ${page.httpStatus}` : ""})` };
  }
  const x = page.extracted;
  const show = (s: string | null) => (s ? `"${untrustedText(s, 140)}"` : "none");

  switch (exp.type) {
    case "structured_data": {
      const lb = x.structuredData.localBusiness;
      const hasType = x.structuredData.types.some((t) => LB.test(t));
      const phoneOk = !exp.phoneDigits || digits(lb?.telephone ?? null) === exp.phoneDigits;
      const nameOk = !exp.name || norm(lb?.name ?? "").includes(norm(exp.name));
      const observed = hasType ? `Found ${x.structuredData.types.filter((t) => LB.test(t)).join(", ")}; name ${show(lb?.name ?? null)}, phone ${show(lb?.telephone ?? null)}` : `No LocalBusiness structured data (types: ${x.structuredData.types.join(", ") || "none"})`;
      return { outcome: hasType && phoneOk && nameOk ? "verified" : "not_found", expected, observed };
    }
    case "title_description": {
      const changed = norm(x.title) !== norm(exp.beforeTitle) || norm(x.metaDescription) !== norm(exp.beforeDescription);
      const mentions = exp.mustIncludeAny.length === 0 || exp.mustIncludeAny.some((m) => norm(`${x.title} ${x.metaDescription}`).includes(norm(m)));
      return { outcome: changed && mentions ? "verified" : "not_found", expected, observed: `Title ${show(x.title)}; description ${show(x.metaDescription)}` };
    }
    case "page_with_keyword": {
      const k = norm(exp.keyword);
      const hit = !!k && [x.title, ...x.headings.h1, ...x.headings.h2].some((h) => norm(h).includes(k));
      return { outcome: hit ? "verified" : "not_found", expected, observed: `Title ${show(x.title)}; main heading ${show(x.headings.h1[0] ?? null)}` };
    }
    case "faq_present": {
      const text = norm([...x.headings.h2, ...x.headings.h3, ...x.contentBlocks].join(" "));
      const found = exp.questions.filter((q) => norm(q).length > 8 && text.includes(norm(q)));
      const faqSchema = x.structuredData.types.includes("FAQPage");
      return { outcome: found.length > 0 || faqSchema ? "verified" : "not_found", expected, observed: `${found.length} of ${exp.questions.length} drafted questions found${faqSchema ? "; FAQPage structured data present" : ""}` };
    }
    case "identity_match": {
      const nameOk = !exp.name || norm(x.identity.name).includes(norm(exp.name));
      const phoneOk = !exp.phoneDigits || digits(x.identity.phone) === exp.phoneDigits;
      const streetOk = !exp.street || norm(x.identity.address).includes(norm(exp.street));
      return { outcome: nameOk && phoneOk && streetOk ? "verified" : "not_found", expected, observed: `Name ${show(x.identity.name)}, phone ${show(x.identity.phone)}, address ${show(x.identity.address)}` };
    }
  }
}
