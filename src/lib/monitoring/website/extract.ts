/**
 * HTML → page snapshot fields (pure, deterministic).
 *
 * Reuses the preflight analyzers for structured data and business
 * identity. Visible content is captured AFTER removing routine noise
 * (navigation, header, footer, aside, scripts, forms, cookie/consent
 * banners, hidden elements), and the content fingerprint is computed over
 * text with dates, times, copyright years, and relative timestamps
 * normalized away — so a footer year bump or "updated 3 days ago" never
 * registers as a change.
 */
import { createHash } from "node:crypto";

import { JSDOM } from "jsdom";

import { checkEntityConsistency } from "@/lib/intelligence/preflight/entityConsistency";
import { validateSchema } from "@/lib/intelligence/preflight/schemaValidation";

export const SCANNER_VERSION = "site-scanner@1.0.0";

const MAX_BLOCKS = 150;
const MAX_BLOCK_CHARS = 600;

export type ExtractedPage = {
  title: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  headings: { h1: string[]; h2: string[]; h3: string[] };
  contentBlocks: string[];
  contentFingerprint: string;
  structuredData: { types: string[]; presentFields: string[]; localBusiness: LocalBusinessFields | null };
  identity: { name: string | null; phone: string | null; address: string | null };
  services: string[];
  locations: string[];
  links: Array<{ href: string; text: string }>;
};

export type LocalBusinessFields = {
  name: string | null;
  telephone: string | null;
  address: string | null;
  areaServed: string[];
  services: string[];
};

const NOISE_SELECTOR = [
  "script", "style", "noscript", "template", "iframe", "svg", "form", "nav", "header", "footer", "aside",
  "[role=navigation]", "[role=banner]", "[role=contentinfo]", "[aria-hidden=true]", "[hidden]",
].join(",");
const NOISE_CLASS = /(cookie|consent|gdpr|newsletter|popup|modal|banner|breadcrumb|skip-link|menu)/i;

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/** Text normalized for fingerprints and diffs: routine time-varying tokens removed. */
export function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .replace(/(©|&copy;|copyright)\s*(\d{4}\s*[-–]\s*)?\d{4}/g, "© <year>")
    .replace(new RegExp(`\\b(${MONTHS})\\.?\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{4}\\b`, "g"), "<date>")
    .replace(new RegExp(`\\b\\d{1,2}\\s+(${MONTHS})\\.?\\s+\\d{4}\\b`, "g"), "<date>")
    .replace(/\b\d{4}-\d{2}-\d{2}(t[\d:.]+z?)?\b/g, "<date>")
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, "<date>")
    .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?\b/g, "<time>")
    .replace(/\b\d+\s+(second|minute|hour|day|week|month|year)s?\s+ago\b/g, "<ago>")
    .replace(/\s+/g, " ")
    .trim();
}

function jsonLdBlocks(doc: Document): unknown[] {
  const out: unknown[] = [];
  for (const s of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const v = JSON.parse(s.textContent ?? "");
      const items = Array.isArray(v) ? v : [v];
      for (const it of items) {
        const graph = (it as { "@graph"?: unknown[] })?.["@graph"];
        if (Array.isArray(graph)) out.push(...graph);
        else out.push(it);
      }
    } catch {
      /* malformed JSON-LD is reported by validateSchema */
    }
  }
  return out;
}

const asText = (v: unknown): string | null => {
  if (typeof v === "string") return clean(v) || null;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string") return clean(o.name) || null;
    const parts = [o.streetAddress, o.addressLocality, o.addressRegion, o.postalCode].filter((x) => typeof x === "string") as string[];
    if (parts.length) return clean(parts.join(", "));
  }
  return null;
};
const asList = (v: unknown): string[] => (Array.isArray(v) ? v : v ? [v] : []).map(asText).filter((x): x is string => !!x);

function localBusinessFrom(items: unknown[]): LocalBusinessFields | null {
  const lb = items.find((it) => {
    const t = (it as { "@type"?: unknown })?.["@type"];
    const types = (Array.isArray(t) ? t : [t]).map(String);
    return types.some((x) => /LocalBusiness|HVACBusiness|HomeAndConstructionBusiness|Plumber|Electrician|RoofingContractor|GeneralContractor|ProfessionalService|Organization/i.test(x));
  }) as Record<string, unknown> | undefined;
  if (!lb) return null;
  const offers = asList((lb.makesOffer as unknown) ?? null).concat(
    asList(((lb.hasOfferCatalog as { itemListElement?: unknown })?.itemListElement as unknown) ?? null),
  );
  const serviceTypes = items
    .filter((it) => String((it as { "@type"?: unknown })?.["@type"] ?? "") === "Service")
    .map((it) => asText((it as { name?: unknown; serviceType?: unknown }).name ?? (it as { serviceType?: unknown }).serviceType))
    .filter((x): x is string => !!x);
  return {
    name: asText(lb.name),
    telephone: asText(lb.telephone),
    address: asText(lb.address),
    areaServed: asList(lb.areaServed),
    services: Array.from(new Set([...offers, ...serviceTypes])),
  };
}

const SERVICE_PATH = /(service|repair|install|replacement|maintenance|heating|cooling|furnace|ac-|air-condition|hvac|plumb|duct|heat-pump|water-heater|roof|drain)/i;
const LOCATION_RE = /\b([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+){0,2}),\s?(OH|Ohio|IN|MI|PA|KY|WV)\b/g;

export function extractPage(html: string, url: string): ExtractedPage {
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const title = clean(doc.querySelector("title")?.textContent) || null;
  const metaDescription = clean(doc.querySelector('meta[name="description"]')?.getAttribute("content")) || null;
  const canonicalHref = doc.querySelector('link[rel="canonical"]')?.getAttribute("href");
  let canonicalUrl: string | null = null;
  try {
    canonicalUrl = canonicalHref ? new URL(canonicalHref, url).toString() : null;
  } catch {
    canonicalUrl = null;
  }

  const links = Array.from(doc.querySelectorAll("a[href]"))
    .map((a) => ({ href: a.getAttribute("href") ?? "", text: clean(a.textContent) }))
    .filter((l) => l.href && !l.href.startsWith("#") && !/^(mailto|tel|javascript):/i.test(l.href));

  const items = jsonLdBlocks(doc);
  const schema = validateSchema(html, url);
  const localBusiness = localBusinessFrom(items);
  const entity = checkEntityConsistency({ url, html }).extractedEntities;
  const pick = (f: { schema: string | null; homepage: string | null; footer: string | null }) => f.schema ?? f.homepage ?? f.footer ?? null;

  // Remove noise, then read headings + content blocks in document order.
  for (const el of Array.from(doc.querySelectorAll(NOISE_SELECTOR))) el.remove();
  for (const el of Array.from(doc.querySelectorAll("[class],[id]"))) {
    const sig = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
    if (NOISE_CLASS.test(sig) && (el.textContent ?? "").length < 2_000) el.remove();
  }
  const headings = { h1: [] as string[], h2: [] as string[], h3: [] as string[] };
  for (const lvl of ["h1", "h2", "h3"] as const) {
    headings[lvl] = Array.from(new Set(Array.from(doc.querySelectorAll(lvl)).map((h) => clean(h.textContent)).filter(Boolean))).slice(0, 40);
  }
  const seen = new Set<string>();
  const contentBlocks: string[] = [];
  for (const el of Array.from(doc.body?.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,dd,td") ?? [])) {
    if (el.querySelector("p,li")) continue; // avoid double-counting containers
    const t = clean(el.textContent);
    if (t.length < 25) continue;
    const key = normalizeForCompare(t);
    if (seen.has(key)) continue;
    seen.add(key);
    contentBlocks.push(t.slice(0, MAX_BLOCK_CHARS));
    if (contentBlocks.length >= MAX_BLOCKS) break;
  }
  const contentFingerprint = createHash("sha256").update(contentBlocks.map(normalizeForCompare).join("\n")).digest("hex");

  const path = new URL(url).pathname;
  const headingServices = SERVICE_PATH.test(path) ? [...headings.h1, ...headings.h2].filter((h) => h.length <= 80) : [];
  const services = Array.from(new Set([...(localBusiness?.services ?? []), ...headingServices])).slice(0, 40);
  const locText = [title ?? "", ...headings.h1, ...headings.h2, metaDescription ?? ""].join(" | ");
  const locations = Array.from(new Set([
    ...(localBusiness?.areaServed ?? []),
    ...Array.from(locText.matchAll(LOCATION_RE)).map((m) => `${m[1]}, ${m[2]}`),
  ])).slice(0, 40);

  return {
    title,
    metaDescription,
    canonicalUrl,
    headings,
    contentBlocks,
    contentFingerprint,
    structuredData: { types: schema.detectedTypes, presentFields: schema.presentFields, localBusiness },
    identity: {
      name: localBusiness?.name ?? pick(entity.name),
      phone: localBusiness?.telephone ?? pick(entity.phone),
      address: localBusiness?.address ?? pick(entity.address),
    },
    services,
    locations,
    links,
  };
}
