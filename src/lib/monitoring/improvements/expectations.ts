/**
 * Evaluate a task's expectation against an independently fetched page
 * (pure). Outcomes:
 *   verified          — the expected change is present on the page now
 *   not_found         — page fetched, change not present ("Change not found yet")
 *   already_present   — the proposed content is there, but it was already on the
 *                       site before the task (baseline snapshot) — not verified
 * For FAQ and new-page tasks only the PROPOSED content counts (drafted
 * questions / the page keyword) — unrelated FAQ markup never does — and it
 * must be NEW relative to the frozen baseline. Without a baseline the result
 * is "could not verify", never verified.
 *   could_not_verify  — page couldn't be fetched/checked (never treated as pass or fail)
 * Presence of content on a page says nothing about indexing or rankings.
 */
import type { ExtractedPage } from "../website/extract";
import type { PageFetchStatus } from "../website/scanner";
import { normalizePageUrl } from "../website/discover";
import type { ContentBaseline, Expectation } from "./drafts";
import { digits } from "./facts";
import { untrustedText } from "./sanitize";

export type VerificationOutcome = "verified" | "not_found" | "already_present" | "could_not_verify";

export type CheckedPage = { url: string; fetchStatus: PageFetchStatus; httpStatus: number | null; extracted: ExtractedPage | null };

export type Evaluation = { outcome: VerificationOutcome; expected: string; observed: string };

const LB = /LocalBusiness|HVACBusiness|Plumber|RoofingContractor|Electrician|GeneralContractor|HomeAndConstructionBusiness|LegalService|Attorney|Dentist|MedicalBusiness|RealEstateAgent|AutoRepair|BeautySalon|Restaurant|ProfessionalService/;
const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const stem = (w: string) => (w.length > 4 && w.endsWith("es") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w);
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 3).map(stem);
const overlap = (item: string, text: string) => {
  const need = Array.from(new Set(words(item)));
  if (need.length === 0) return 0;
  const have = new Set(words(text));
  return need.filter((w) => have.has(w)).length / need.length;
};

/**
 * A proposed FAQ question is present only as a question-sized unit — a
 * heading, or a block not much longer than the question — containing ≥ 85%
 * of its significant words (light plural stemming tolerates small edits). A
 * paragraph that merely shares common words (business name, city, "HVAC
 * company") never counts.
 */
export function textMatches(item: string, texts: string[]): boolean {
  const maxLen = Math.round(item.length * 1.6) + 30;
  return texts.some((t) => t.length <= maxLen && overlap(item, t) >= 0.85);
}

/** A page keyword must appear in full in the title or a heading. */
export function keywordMatches(keyword: string, titleAndHeadings: string[]): boolean {
  return words(keyword).length > 0 && titleAndHeadings.some((t) => overlap(keyword, t) === 1);
}

export type BaselinePage = { url: string; normalizedUrl: string; title: string | null; headings: { h1: string[]; h2: string[]; h3: string[] }; contentBlocks: string[] };

type PageText = { title?: string | null; headings: { h1: string[]; h2: string[]; h3: string[] }; contentBlocks: string[] };
const faqTexts = (p: PageText) => [...p.headings.h1, ...p.headings.h2, ...p.headings.h3, ...p.contentBlocks];
const keywordTexts = (p: PageText) => [...(p.title ? [p.title] : []), ...p.headings.h1, ...p.headings.h2, ...p.headings.h3];
const matchesOn = (kind: "faq_present" | "page_with_keyword", item: string, p: PageText) =>
  kind === "faq_present" ? textMatches(item, faqTexts(p)) : keywordMatches(item, keywordTexts(p));

/** Baseline for FAQ / keyword checks from a scan completed BEFORE implementation (pure). */
export function buildContentBaseline(args: {
  exp: Expectation;
  implementationUrl: string | null;
  scan: { id: string; completedAt: Date; discoveredUrls: string[] } | null;
  pages: BaselinePage[];
}): ContentBaseline | null {
  if (!args.scan) return null;
  const items = args.exp.type === "faq_present" ? args.exp.questions : args.exp.type === "page_with_keyword" ? [args.exp.keyword] : [];
  const implKey = args.implementationUrl ? normalizePageUrl(args.implementationUrl) : null;
  const present: ContentBaseline["present"] = [];
  for (const item of items) {
    const pages = args.exp.type === "page_with_keyword" ? args.pages.filter((p) => p.normalizedUrl === implKey) : args.pages;
    const kind = args.exp.type as "faq_present" | "page_with_keyword";
    const hit = pages.find((p) => matchesOn(kind, item, p));
    if (hit) present.push({ text: item, url: hit.url });
  }
  return {
    scanId: args.scan.id,
    at: args.scan.completedAt.toISOString(),
    present,
    implementationPage: { captured: !!implKey && args.pages.some((p) => p.normalizedUrl === implKey), discovered: !!implKey && args.scan.discoveredUrls.includes(implKey) },
  };
}

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
      return `A new page whose title or headings mention "${exp.keyword}" (not already on your site before this task)`;
    case "faq_present":
      return `At least one of the ${exp.questions.length} drafted FAQ questions on the published page, newly added since your site was last scanned (other FAQ content doesn't count)`;
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
    case "page_with_keyword":
    case "faq_present":
      return evaluateProposedContent(exp, x, expected, show);
    case "identity_match": {
      const nameOk = !exp.name || norm(x.identity.name).includes(norm(exp.name));
      const phoneOk = !exp.phoneDigits || digits(x.identity.phone) === exp.phoneDigits;
      const streetOk = !exp.street || norm(x.identity.address).includes(norm(exp.street));
      return { outcome: nameOk && phoneOk && streetOk ? "verified" : "not_found", expected, observed: `Name ${show(x.identity.name)}, phone ${show(x.identity.phone)}, address ${show(x.identity.address)}` };
    }
  }
}

const day = (iso: string) => iso.slice(0, 10);

/** FAQ / new-page checks: proposed content only, and it must be new vs. the baseline. */
function evaluateProposedContent(
  exp: Extract<Expectation, { type: "faq_present" | "page_with_keyword" }>,
  x: ExtractedPage,
  expected: string,
  show: (s: string | null) => string,
): Evaluation {
  const items = exp.type === "faq_present" ? exp.questions : [exp.keyword];
  const found = items.filter((q) => q && matchesOn(exp.type, q, x));
  const label = exp.type === "faq_present" ? "drafted questions" : "keyword";
  if (found.length === 0) {
    const note = exp.type === "faq_present" && x.structuredData.types.includes("FAQPage") ? " (the page has other FAQ content, which doesn't count)" : "";
    return { outcome: "not_found", expected, observed: exp.type === "faq_present" ? `Proposed content not found: 0 of ${items.length} drafted questions on the page${note}` : `Proposed content not found: title ${show(x.title)}; main heading ${show(x.headings.h1[0] ?? null)}` };
  }
  const b = exp.baseline ?? null;
  if (!b) {
    return { outcome: "could_not_verify", expected, observed: `Found ${found.length} ${label} on the page, but there's no earlier snapshot of your site to show ${found.length === 1 ? "it's" : "they're"} new.` };
  }
  if (!b.implementationPage.captured && b.implementationPage.discovered) {
    return { outcome: "could_not_verify", expected, observed: `Found ${found.length} ${label}, but this page existed before and wasn't captured in the ${day(b.at)} snapshot, so we can't tell whether the content is new.` };
  }
  const before = new Set(b.present.map((p) => p.text));
  const fresh = found.filter((q) => !before.has(q));
  const old = found.filter((q) => before.has(q));
  const list = (qs: string[]) => qs.map((q) => `"${untrustedText(q, 100)}"`).join(", ");
  if (fresh.length > 0) {
    return { outcome: "verified", expected, observed: `Newly observed after your change: ${list(fresh)}${old.length ? `; already on your site before (${day(b.at)} snapshot): ${list(old)}` : ""}` };
  }
  return { outcome: "already_present", expected, observed: `Proposed content was already on your site before this task (${day(b.at)} snapshot): ${list(old)}` };
}
