// Entity-consistency analysis — extracts (business name, phone,
// address) from three surfaces on the homepage and compares them
// against the JSON-LD schema reference:
//   1. The schema markup (the "source of truth" reference).
//   2. The homepage prose (heuristic — h1/title for name, regex for
//      phone + address).
//   3. The footer (heuristic <footer> element).
//
// Strict equality would over-report inconsistency (slight phrasing
// variations don't matter), so we normalize:
//   - name: lowercase, trim, collapse whitespace
//   - phone: keep digits only (strips +, (, ), -, .)
//   - address: lowercase, strip punctuation, collapse whitespace
//
// Returns the spec'd shape:
//   { score, extractedEntities, inconsistencies, confidence }
//
// Where `confidence` is the fraction of non-empty (name, phone, address)
// surfaces where the value matches the schema reference, and `score`
// is `Math.round(confidence * 100)`.
//
// Used by the preflight orchestrator; never throws.

import { JSDOM } from "jsdom";
import type { EntityConsistencyResult } from "./types";

// Stricter than a generic digit-class regex because we want to grab
// the phone number alone — not greedy-extend across "(602) 555-0188.
// 1500 E Camelback" and end up with 14 digits. Matches the common US
// formats: (NNN) NNN-NNNN, NNN-NNN-NNNN, +1 NNN.NNN.NNNN, etc.
const PHONE_REGEX =
  /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const STREET_HINT_REGEX =
  /\b(\d{1,6})\s+([A-Z][A-Za-z]*\s?){1,5}(St(reet)?|Ave(nue)?|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pl|Place|Ct|Court|Hwy|Highway|Pkwy|Pike)\b/;

export function checkEntityConsistency(args: {
  url: string;
  html: string;
}): EntityConsistencyResult {
  const empty = emptyResult();
  if (!args.html || args.html.length === 0) {
    return empty;
  }

  let doc: Document;
  try {
    const dom = new JSDOM(args.html, { url: args.url });
    doc = dom.window.document;
  } catch {
    return empty;
  }

  const schemaEntity = extractFromSchema(doc);
  const homepageEntity = extractFromHomepage(doc);
  const footerEntity = extractFromFooter(doc);

  const extractedEntities = {
    name: {
      schema: schemaEntity.name,
      homepage: homepageEntity.name,
      footer: footerEntity.name,
    },
    phone: {
      schema: schemaEntity.phone,
      homepage: homepageEntity.phone,
      footer: footerEntity.phone,
    },
    address: {
      schema: schemaEntity.address,
      homepage: homepageEntity.address,
      footer: footerEntity.address,
    },
  };

  const inconsistencies: string[] = [];

  let matches = 0;
  let comparisons = 0;

  function compare(
    field: "name" | "phone" | "address",
    normalize: (s: string) => string,
    matchFn: (refN: string, vN: string) => boolean = (refN, vN) => refN === vN,
  ): void {
    const ref = schemaEntity[field];
    if (!ref) return;
    const refN = normalize(ref);
    for (const surface of ["homepage", "footer"] as const) {
      const v = extractedEntities[field][surface];
      if (!v) continue;
      comparisons += 1;
      const vN = normalize(v);
      if (matchFn(refN, vN)) {
        matches += 1;
      } else {
        inconsistencies.push(
          `${field} on ${surface} ("${v}") differs from schema ("${ref}")`,
        );
      }
    }
  }

  compare("name", normName);
  compare("phone", normPhone);
  // Addresses commonly appear in three forms across surfaces:
  // schema may have full "street, locality, region, postal", while the
  // homepage/footer often render just the street ("1500 E Camelback Rd"),
  // or street + locality only. Count a match when one normalized form
  // is a prefix of the other — strict equality over-reports inconsistency
  // for what's actually the same address.
  compare("address", normAddress, (refN, vN) =>
    refN === vN || refN.startsWith(vN) || vN.startsWith(refN),
  );

  // Detect missing surfaces too. If schema has a phone but neither
  // homepage nor footer mentions it, that's an inconsistency too.
  for (const field of ["name", "phone", "address"] as const) {
    const ref = schemaEntity[field];
    if (!ref) continue;
    const surfacesWithValue =
      (extractedEntities[field].homepage ? 1 : 0) +
      (extractedEntities[field].footer ? 1 : 0);
    if (surfacesWithValue === 0) {
      inconsistencies.push(
        `${field} present in schema but missing from homepage and footer prose`,
      );
    }
  }

  if (!schemaEntity.name && !schemaEntity.phone && !schemaEntity.address) {
    inconsistencies.push(
      "no schema reference for name/phone/address — entity consistency cannot be verified",
    );
  }

  const confidence = comparisons === 0 ? 0 : matches / comparisons;
  const score = Math.round(confidence * 100);

  return {
    score,
    extractedEntities,
    inconsistencies,
    confidence,
  };
}

type EntityShape = {
  name: string | null;
  phone: string | null;
  address: string | null;
};

function emptyResult(): EntityConsistencyResult {
  return {
    score: 0,
    extractedEntities: {
      name: { schema: null, homepage: null, footer: null },
      phone: { schema: null, homepage: null, footer: null },
      address: { schema: null, homepage: null, footer: null },
    },
    inconsistencies: ["no homepage HTML available — entity check skipped"],
    confidence: 0,
  };
}

function extractFromSchema(doc: Document): EntityShape {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  const collected: Record<string, unknown>[] = [];
  scripts.forEach((s) => {
    const text = s.textContent ?? "";
    if (!text.trim()) return;
    try {
      collect(JSON.parse(text), collected);
    } catch {
      /* skip malformed */
    }
  });
  // Pick first node that has any business identity fields.
  for (const node of collected) {
    const name = stringField(node, "name");
    const phone = stringField(node, "telephone");
    const address = addressString(node["address"]);
    if (name || phone || address) {
      return { name, phone, address };
    }
  }
  return { name: null, phone: null, address: null };
}

function collect(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  out.push(obj);
  const graph = obj["@graph"];
  if (Array.isArray(graph)) for (const g of graph) collect(g, out);
}

function stringField(node: Record<string, unknown>, key: string): string | null {
  const v = node[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function addressString(v: unknown): string | null {
  if (typeof v === "string") return v.trim().length > 0 ? v.trim() : null;
  if (typeof v !== "object" || v === null) return null;
  const a = v as Record<string, unknown>;
  const parts = [
    a.streetAddress,
    a.addressLocality,
    a.addressRegion,
    a.postalCode,
  ]
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.trim());
  return parts.length > 0 ? parts.join(", ") : null;
}

function extractFromHomepage(doc: Document): EntityShape {
  const title = doc.title?.trim() || null;
  const h1 = doc.querySelector("h1");
  const h1Text = h1?.textContent?.trim() || null;
  // Prefer h1 over title when both exist — title often has marketing
  // suffixes ("Acme Roofing | Free Estimates").
  const name = h1Text ?? cleanTitle(title);

  const bodyText = doc.body?.textContent ?? "";
  const phone = firstPhoneMatch(bodyText);
  const address = firstAddressMatch(bodyText);

  return { name, phone, address };
}

function extractFromFooter(doc: Document): EntityShape {
  const footer = doc.querySelector("footer");
  if (!footer) return { name: null, phone: null, address: null };
  const text = footer.textContent ?? "";
  return {
    name: null, // footers rarely state name plainly — leave null
    phone: firstPhoneMatch(text),
    address: firstAddressMatch(text),
  };
}

function cleanTitle(t: string | null): string | null {
  if (!t) return null;
  // Strip everything after the first " | " or " — " separator (common
  // marketing-suffix pattern).
  const split = t.split(/[|–—\-·]/)[0];
  return split.trim() || null;
}

function firstPhoneMatch(s: string): string | null {
  const m = s.match(PHONE_REGEX);
  if (!m) return null;
  // Filter out matches that are too long (likely IDs) or all-zeros.
  for (const candidate of m) {
    const digits = candidate.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15 && !/^0+$/.test(digits)) {
      return candidate.trim();
    }
  }
  return null;
}

function firstAddressMatch(s: string): string | null {
  const m = s.match(STREET_HINT_REGEX);
  return m ? m[0].trim() : null;
}

function normName(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function normPhone(s: string): string {
  return s.replace(/\D/g, "");
}

function normAddress(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
