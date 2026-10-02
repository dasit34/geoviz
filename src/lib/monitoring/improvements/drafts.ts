/**
 * Deterministic fix-package drafts (pure). Templates only — no LLM. Every
 * business fact comes from the CONFIRMED fact sheet; anything missing is
 * listed and shown as [MISSING: …], never invented. Website-observed text is
 * untrusted: it may appear only as a quoted "currently on your site"
 * excerpt and never inside generated JSON-LD values.
 */
import { buildCustomerQuestions } from "@/lib/report/customer-questions";

import { digits, FACT_LABELS, type BusinessFacts } from "./facts";
import { safeJsonLd, untrustedText } from "./sanitize";
import type { FixKind } from "./workflow";

export const GENERATOR_VERSION = "improvement-drafts@1.0.0";

const SCHEMA_TYPE: Record<string, string> = {
  hvac: "HVACBusiness",
  plumbing: "Plumber",
  roofing: "RoofingContractor",
  electrical: "Electrician",
  contractor: "GeneralContractor",
  home_services: "HomeAndConstructionBusiness",
  landscaping: "HomeAndConstructionBusiness",
  legal: "LegalService",
  dental: "Dentist",
  medical: "MedicalBusiness",
  real_estate: "RealEstateAgent",
  automotive: "AutoRepair",
  salon: "BeautySalon",
  restaurant: "Restaurant",
};

export type Expectation =
  | { type: "structured_data"; url: string; name: string | null; phoneDigits: string | null }
  | { type: "title_description"; url: string; beforeTitle: string | null; beforeDescription: string | null; mustIncludeAny: string[] }
  | { type: "page_with_keyword"; keyword: string; baseline?: ContentBaseline | null }
  | { type: "faq_present"; questions: string[]; baseline?: ContentBaseline | null }
  | { type: "identity_match"; url: string; name: string | null; phoneDigits: string | null; street: string | null }
  | { type: "page_available"; url: string }
  | { type: "manual"; instructions: string };

/**
 * What the site looked like BEFORE the implementation claim: the latest
 * successful scan completed before `implementedAt`. Frozen when the check is
 * queued, so later scans or draft edits can't move it.
 */
export type ContentBaseline = {
  scanId: string;
  at: string;
  /** Proposed items (questions / keyword) already on captured pages. */
  present: Array<{ text: string; url: string }>;
  /** Was the implementation page captured / at least discovered in that scan? */
  implementationPage: { captured: boolean; discovered: boolean };
};

export type ObservedPage = {
  url: string;
  title: string | null;
  description: string | null;
  identity: { name: string | null; phone: string | null; address: string | null } | null;
  schemaTypes: string[];
};

export type DraftInput = {
  fixKind: FixKind;
  dedupeKey: string;
  taskUrl: string | null;
  siteUrl: string;
  facts: BusinessFacts | null;
  industrySlug: string | null;
  trackedQuestions: string[];
  /** Citation domains actually observed (citation intel opportunities). */
  citationSources: Array<{ domain: string; answers: number }>;
  /** Untrusted: latest snapshot of the relevant page / homepage. */
  observed: ObservedPage | null;
  /** Previous title of a removed page (from the change record), untrusted. */
  removedPageTitle?: string | null;
};

export type Draft = {
  kind: FixKind;
  format: "jsonld" | "text" | "markdown" | "checklist";
  content: string;
  missingFacts: string[];
  expectation: Expectation;
};

/** Lowercase for mid-sentence use, keeping acronyms (HVAC, AC) intact. */
const lowerKeepAcronyms = (s: string) => s.split(" ").map((w) => (w.length > 1 && w === w.toUpperCase() ? w : w.toLowerCase())).join(" ");

/** Industry from confirmed services when the audit didn't classify one. */
export function inferIndustry(slug: string | null, services: string[]): string | null {
  if (slug) return slug;
  const s = services.join(" ").toLowerCase();
  if (/hvac|heating|cooling|furnace|air condition|heat pump/.test(s)) return "hvac";
  if (/plumb|drain|water heater/.test(s)) return "plumbing";
  if (/roof/.test(s)) return "roofing";
  if (/electric/.test(s)) return "electrical";
  if (/dental|dentist/.test(s)) return "dental";
  return null;
}

const MISSING = (k: keyof BusinessFacts) => `[MISSING: ${FACT_LABELS[k].toLowerCase()}]`;
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const homepage = (siteUrl: string) => {
  try {
    return new URL(siteUrl).origin + "/";
  } catch {
    return siteUrl;
  }
};

function requireFacts(f: BusinessFacts, keys: Array<keyof BusinessFacts>): string[] {
  return keys.filter((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length === 0 : !v;
  }).map((k) => FACT_LABELS[k]);
}

function topicFromKey(dedupeKey: string): string | null {
  const m = /^website:competitor_topic:[^:]+:(.+)$/.exec(dedupeKey);
  return m ? title(untrustedText(m[1], 60)) : null;
}

/** Facts sheet must exist before any draft that needs facts. */
function noFacts(kind: FixKind, expectation: Expectation): Draft {
  return {
    kind,
    format: "text",
    content: "Confirm your business facts (name, phone, address, services, service areas) in the Business facts section above. Drafts use only facts you've confirmed.",
    missingFacts: ["Confirmed business facts"],
    expectation,
  };
}

export function generateDraft(raw: DraftInput): Draft {
  const input = { ...raw, industrySlug: inferIndustry(raw.industrySlug, raw.facts?.services ?? []) };
  const f = input.facts;
  const home = homepage(input.siteUrl);
  const url = input.taskUrl ?? home;
  const obsTitle = untrustedText(input.observed?.title ?? "", 160) || null;
  const obsDesc = untrustedText(input.observed?.description ?? "", 300) || null;

  switch (input.fixKind) {
    case "structured_data": {
      const expectation: Expectation = { type: "structured_data", url: home, name: f?.name ?? null, phoneDigits: f?.phone ? digits(f.phone) : null };
      if (!f) return noFacts("structured_data", expectation);
      const missing = requireFacts(f, ["name", "phone", "street", "city", "region", "postal"]);
      const ld: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": SCHEMA_TYPE[input.industrySlug ?? ""] ?? "LocalBusiness",
        name: f.name ?? MISSING("name"),
        url: home,
        telephone: f.phone ?? MISSING("phone"),
        address: {
          "@type": "PostalAddress",
          streetAddress: f.street ?? MISSING("street"),
          addressLocality: f.city ?? MISSING("city"),
          addressRegion: f.region ?? MISSING("region"),
          postalCode: f.postal ?? MISSING("postal"),
          addressCountry: "US",
        },
      };
      if (f.hours) ld.openingHours = f.hours;
      if (f.serviceAreas.length) ld.areaServed = f.serviceAreas.map((a) => ({ "@type": "Place", name: a }));
      if (f.services.length) {
        ld.hasOfferCatalog = { "@type": "OfferCatalog", name: "Services", itemListElement: f.services.map((s) => ({ "@type": "Offer", itemOffered: { "@type": "Service", name: s } })) };
      }
      const body = `<script type="application/ld+json">\n${safeJsonLd(ld)}\n</script>`;
      const note = missing.length
        ? `\n\n<!-- Replace every [MISSING: …] value before publishing. Confirm these facts first: ${missing.join(", ")}. -->`
        : "";
      return { kind: "structured_data", format: "jsonld", content: body + note, missingFacts: missing, expectation };
    }

    case "title_description": {
      const expectation: Expectation = { type: "title_description", url, beforeTitle: obsTitle, beforeDescription: obsDesc, mustIncludeAny: [f?.name, f?.city].filter((x): x is string => !!x) };
      if (!f) return noFacts("title_description", expectation);
      const missing = requireFacts(f, ["name", "city", "services"]);
      const name = f.name ?? MISSING("name");
      const city = f.city ? `${f.city}${f.region ? `, ${f.region}` : ""}` : MISSING("city");
      const svc = f.services[0] ?? MISSING("services");
      const cap = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);
      const titles = [`${svc} in ${city} | ${name}`, `${name} | ${svc} & ${f.services[1] ?? "Service"} in ${f.city ?? city}`, `${name} — ${svc}, ${f.city ?? city}`].map((t) => cap(t, 60));
      const desc = cap(`${name} provides ${f.services.slice(0, 3).join(", ") || svc} in ${f.serviceAreas.slice(0, 3).join(", ") || city}.${f.phone ? ` Call ${f.phone}.` : ""}`, 155);
      const lines = [
        `Page: ${url}`,
        `Currently on your site (title): ${obsTitle ? `"${obsTitle}"` : "none found"}`,
        `Currently on your site (description): ${obsDesc ? `"${obsDesc}"` : "none found"}`,
        "",
        "Suggested titles (pick one, ≤ 60 characters):",
        ...titles.map((t, i) => `  ${i + 1}. ${t}`),
        "",
        "Suggested meta description (≤ 155 characters):",
        `  ${desc}`,
      ];
      return { kind: "title_description", format: "text", content: lines.join("\n"), missingFacts: missing, expectation };
    }

    case "page_outline": {
      const fromKey = topicFromKey(input.dedupeKey);
      const confirmed = [...(f?.services ?? []), ...(f?.serviceAreas ?? [])];
      const topic = fromKey ?? f?.services[0] ?? null;
      const isConfirmed = !!topic && confirmed.some((c) => c.toLowerCase().includes(topic.toLowerCase()) || topic.toLowerCase().includes(c.toLowerCase()));
      const expectation: Expectation = { type: "page_with_keyword", keyword: topic ?? "" };
      if (!f) return noFacts("page_outline", expectation);
      if (!topic) {
        return { kind: "page_outline", format: "text", content: "Add your services in Business facts so we can outline a page for one of them.", missingFacts: ["Services"], expectation };
      }
      if (!isConfirmed) {
        return {
          kind: "page_outline",
          format: "text",
          content: `Confirm you offer "${topic}" before building this page — add it to Services (or Service areas) in Business facts. We don't create pages for services you haven't confirmed.`,
          missingFacts: [`Confirm you offer: ${topic}`],
          expectation,
        };
      }
      const missing = requireFacts(f, ["name", "phone", "city", "licenses"]);
      const area = f.serviceAreas[0] ?? f.city ?? MISSING("city");
      const md = [
        `# ${topic} in ${area} — ${f.name ?? MISSING("name")}`,
        "",
        "## What we do",
        `- Describe your ${lowerKeepAcronyms(topic)} service in plain language (what's included, who it's for).`,
        "",
        "## Where we provide it",
        `- ${(f.serviceAreas.length ? f.serviceAreas : [f.city ?? MISSING("city")]).join(", ")}`,
        "",
        "## Why customers choose us",
        f.licenses.length ? `- Licenses / certifications: ${f.licenses.join(", ")}` : `- ${MISSING("licenses")} (only list credentials you actually hold)`,
        "- Add real details only: years in business, warranties, response times you can stand behind.",
        "",
        "## Common questions",
        `- How much does ${lowerKeepAcronyms(topic)} cost in ${area}? [answer with your real pricing approach]`,
        `- How quickly can you schedule ${lowerKeepAcronyms(topic)}? [answer with your real availability]`,
        "",
        "## Contact",
        `- ${f.phone ?? MISSING("phone")}${f.hours ? ` · ${f.hours}` : ""}`,
        "",
        "Link to this page from your homepage and services menu. After publishing, enter the page address when you mark this task implemented.",
      ].join("\n");
      return { kind: "page_outline", format: "markdown", content: md, missingFacts: missing, expectation };
    }

    case "faq": {
      const city = f?.city ?? null;
      const generated = buildCustomerQuestions({ businessName: f?.name ?? "", industrySlug: input.industrySlug, city, services: f?.services ?? [], businessType: null, isLocal: true });
      // Without a known industry the generic fallback questions read poorly ("a business company") — keep only
      // the customer's own tracked questions plus the trust question in that case.
      const usable = input.industrySlug ? generated : generated.filter((q) => f?.name && q.includes(f.name));
      const questions = Array.from(new Set([...input.trackedQuestions.map((q) => untrustedText(q, 200)), ...usable])).filter(Boolean).slice(0, 6);
      const expectation: Expectation = { type: "faq_present", questions };
      if (!f) return noFacts("faq", expectation);
      const missing = requireFacts(f, ["name", "phone", "city", "hours"]);
      const answerHint = (q: string) => {
        const facts = [f.name && `name: ${f.name}`, f.serviceAreas.length && `areas: ${f.serviceAreas.join(", ")}`, f.services.length && `services: ${f.services.slice(0, 4).join(", ")}`, f.hours && `hours: ${f.hours}`, f.phone && `phone: ${f.phone}`].filter(Boolean).join("; ");
        return `[Write a 2–3 sentence answer using only true details${facts ? ` (${facts})` : ""}${/when|hour|open|emergency|today/i.test(q) && !f.hours ? `; ${MISSING("hours")}` : ""}]`;
      };
      const md = [
        "## Frequently asked questions",
        "",
        ...questions.flatMap((q) => [`### ${q}`, answerHint(q), ""]),
        "Optional: once your answers are final, add FAQPage structured data with the same questions and answers.",
      ].join("\n");
      return { kind: "faq", format: "markdown", content: md, missingFacts: missing, expectation };
    }

    case "identity_checklist": {
      const expectation: Expectation = { type: "identity_match", url: home, name: f?.name ?? null, phoneDigits: f?.phone ? digits(f.phone) : null, street: f?.street ?? null };
      if (!f) return noFacts("identity_checklist", expectation);
      const missing = requireFacts(f, ["name", "phone", "street", "city"]);
      const o = input.observed?.identity ?? null;
      const mark = (confirmed: string | null, observed: string | null | undefined, cmp: (a: string, b: string) => boolean) => {
        const obs = untrustedText(observed ?? "", 160);
        if (!confirmed) return `missing — confirm it first${obs ? ` (your site shows "${obs}")` : ""}`;
        if (!obs) return `not found on your homepage — add "${confirmed}"`;
        return cmp(confirmed, obs) ? `matches ("${obs}")` : `MISMATCH — your site shows "${obs}"`;
      };
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
      const lines = [
        `Homepage checked: ${home}`,
        `[ ] Business name: ${f.name ?? "—"} — ${mark(f.name, o?.name, (a, b) => norm(b).includes(norm(a)))}`,
        `[ ] Phone: ${f.phone ?? "—"} — ${mark(f.phone, o?.phone, (a, b) => digits(a) === digits(b))}`,
        `[ ] Address: ${[f.street, f.city, f.region, f.postal].filter(Boolean).join(", ") || "—"} — ${mark(f.street, o?.address, (a, b) => norm(b).includes(norm(a)))}`,
        "",
        "Make these match exactly everywhere your business is listed:",
        "[ ] Your website header/footer and contact page",
        "[ ] Your website's LocalBusiness structured data",
        "[ ] Google Business Profile",
        "[ ] Bing Places, Apple Business Connect, Yelp",
        "[ ] Industry directories and your social profiles",
      ];
      return { kind: "identity_checklist", format: "checklist", content: lines.join("\n"), missingFacts: missing, expectation };
    }

    case "citation": {
      const expectation: Expectation = { type: "manual", instructions: "An operator checks each listed source for an accurate listing of the business and records the URL." };
      if (input.citationSources.length === 0) {
        return { kind: "citation", format: "text", content: "No citation sources have been observed in your tracked AI answers yet. This draft fills in after a tracking run.", missingFacts: [], expectation };
      }
      const lines = [
        "Sources AI answers cited when naming competitors, but not when naming you (observed in your tracked answers):",
        ...input.citationSources.slice(0, 8).map((s) => `[ ] ${untrustedText(s.domain, 100)} — cited in ${s.answers} answer${s.answers === 1 ? "" : "s"}. Check whether your business has an accurate, complete listing there.`),
        "",
        "Use exactly the business name, phone, and address from your Business facts. A listing may help AI systems confirm your business; it doesn't guarantee you'll be cited or recommended.",
      ];
      return { kind: "citation", format: "checklist", content: lines.join("\n"), missingFacts: f ? requireFacts(f, ["name", "phone", "street"]) : ["Confirmed business facts"], expectation };
    }

    case "restore_page": {
      const expectation: Expectation = { type: "page_available", url };
      const prev = untrustedText(input.removedPageTitle ?? "", 160);
      const lines = [
        `Page: ${url}`,
        `It previously showed: ${prev ? `"${prev}"` : "(title not recorded)"}`,
        "",
        "Choose one:",
        "[ ] Restore the page at the same address, or",
        "[ ] Add a permanent (301) redirect from this address to the closest current page on your site.",
        "",
        "Then mark this task implemented — we'll re-check the address.",
      ];
      return { kind: "restore_page", format: "checklist", content: lines.join("\n"), missingFacts: [], expectation };
    }

    default:
      return {
        kind: "general",
        format: "text",
        content: "This finding needs a manual fix. Follow the proposed fix above; a GeoViz operator reviews it after you mark it implemented.",
        missingFacts: [],
        expectation: { type: "manual", instructions: "Operator review of the change described in the proposed fix." },
      };
  }
}
