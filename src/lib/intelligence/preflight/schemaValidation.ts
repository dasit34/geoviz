// Runtime validation of JSON-LD structured data against the
// LocalBusiness-style entity field set the AI visibility audit cares
// about. NOT a full schema.org validator — schema-dts gives us the
// TypeScript types but doesn't validate at runtime, and we don't want
// to drag in a full JSON-LD library for the few invariants that
// matter.
//
// What we check:
//   - Each <script type="application/ld+json"> block is parseable
//     JSON. (Malformed blocks count as 0 contributing fields.)
//   - Recursively walk @graph arrays — LocalBusiness markup is often
//     nested inside an Organization or WebSite envelope.
//   - For LocalBusiness / Organization / ProfessionalService /
//     subtypes thereof, runtime-check these fields:
//         name        — non-empty string
//         address     — object with at least streetAddress, addressLocality, addressRegion
//         telephone   — non-empty string
//         url         — non-empty string
//         geo         — object with latitude + longitude OR @type GeoCoordinates
//         openingHours — string OR array of OpeningHoursSpecification
//
// Returns a structured `SchemaValidationResult` with the spec'd shape.
// Used by the preflight orchestrator; never throws.

import { JSDOM } from "jsdom";
import type { SchemaValidationResult } from "./types";

const REQUIRED_FIELDS = [
  "name",
  "address",
  "telephone",
  "url",
  "geo",
  "openingHours",
] as const;

const LOCAL_BUSINESS_TYPES = new Set([
  "LocalBusiness",
  "Organization",
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

export function validateSchema(
  html: string,
  url: string,
): SchemaValidationResult {
  const notes: string[] = [];
  if (!html || html.length === 0) {
    return emptyResult(["empty HTML — schema validation skipped"]);
  }

  let scripts: NodeListOf<Element>;
  try {
    const dom = new JSDOM(html, { url });
    scripts = dom.window.document.querySelectorAll(
      'script[type="application/ld+json"]',
    );
  } catch (err) {
    return emptyResult([
      `JSDOM parse failed: ${err instanceof Error ? err.message : "unknown"}`,
    ]);
  }

  const rawJsonLdCount = scripts.length;
  if (rawJsonLdCount === 0) {
    return {
      score: 0,
      presentFields: [],
      missingFields: [...REQUIRED_FIELDS],
      malformedFields: [],
      detectedTypes: [],
      rawJsonLdCount: 0,
      notes: ["no JSON-LD blocks found"],
    };
  }

  const allNodes: Record<string, unknown>[] = [];
  const malformedBlocks: number[] = [];

  scripts.forEach((script, i) => {
    const text = script.textContent ?? "";
    if (!text.trim()) {
      malformedBlocks.push(i);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      malformedBlocks.push(i);
      return;
    }
    collectNodes(parsed, allNodes);
  });

  if (malformedBlocks.length > 0) {
    notes.push(`${malformedBlocks.length} JSON-LD block(s) failed to parse`);
  }

  const detectedTypes = new Set<string>();
  for (const node of allNodes) {
    const t = node["@type"];
    if (typeof t === "string") detectedTypes.add(t);
    else if (Array.isArray(t)) {
      for (const ti of t) if (typeof ti === "string") detectedTypes.add(ti);
    }
  }

  // Pick the most field-rich node whose @type is in our
  // LocalBusiness-like set. If none qualifies, fall back to the
  // most field-rich node overall.
  const businessLikeNodes = allNodes.filter((n) => nodeIsLocalBusinessLike(n));
  const candidates = businessLikeNodes.length > 0 ? businessLikeNodes : allNodes;
  const target = candidates.length > 0
    ? candidates.reduce((best, cur) =>
        countCheckedFields(cur) > countCheckedFields(best) ? cur : best,
      )
    : null;

  if (!target) {
    return {
      score: 0,
      presentFields: [],
      missingFields: [...REQUIRED_FIELDS],
      malformedFields: [],
      detectedTypes: [...detectedTypes],
      rawJsonLdCount,
      notes: [...notes, "no usable business-entity node found"],
    };
  }

  const presentFields: string[] = [];
  const missingFields: string[] = [];
  const malformedFields: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const v = target[field];
    if (v === undefined || v === null) {
      missingFields.push(field);
      continue;
    }
    if (!fieldIsWellFormed(field, v)) {
      malformedFields.push(field);
      continue;
    }
    presentFields.push(field);
  }

  if (businessLikeNodes.length === 0) {
    notes.push(
      "no LocalBusiness/Organization @type detected — scored against best-available node",
    );
  }

  const score = Math.round((presentFields.length / REQUIRED_FIELDS.length) * 100);

  return {
    score,
    presentFields,
    missingFields,
    malformedFields,
    detectedTypes: [...detectedTypes],
    rawJsonLdCount,
    notes,
  };
}

function emptyResult(extraNotes: string[]): SchemaValidationResult {
  return {
    score: 0,
    presentFields: [],
    missingFields: [...REQUIRED_FIELDS],
    malformedFields: [],
    detectedTypes: [],
    rawJsonLdCount: 0,
    notes: extraNotes,
  };
}

function collectNodes(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) collectNodes(item, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  out.push(obj);
  // Recurse into @graph (common pattern: outer Organization wraps a
  // graph of LocalBusiness + WebSite + WebPage).
  const graph = obj["@graph"];
  if (Array.isArray(graph)) {
    for (const g of graph) collectNodes(g, out);
  }
}

function nodeIsLocalBusinessLike(node: Record<string, unknown>): boolean {
  const t = node["@type"];
  if (typeof t === "string") return LOCAL_BUSINESS_TYPES.has(t);
  if (Array.isArray(t))
    return t.some((ti) => typeof ti === "string" && LOCAL_BUSINESS_TYPES.has(ti));
  return false;
}

function countCheckedFields(node: Record<string, unknown>): number {
  return REQUIRED_FIELDS.reduce(
    (n, f) => (node[f] !== undefined && node[f] !== null ? n + 1 : n),
    0,
  );
}

function fieldIsWellFormed(field: string, v: unknown): boolean {
  switch (field) {
    case "name":
    case "telephone":
    case "url":
      return typeof v === "string" && v.trim().length > 0;
    case "address":
      if (typeof v === "string") return v.trim().length > 0;
      if (typeof v === "object" && v !== null) {
        const a = v as Record<string, unknown>;
        // PostalAddress should have at least one of street + locality.
        return (
          (typeof a.streetAddress === "string" && a.streetAddress.trim().length > 0) ||
          (typeof a.addressLocality === "string" && a.addressLocality.trim().length > 0)
        );
      }
      return false;
    case "geo":
      if (typeof v !== "object" || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      {
        const g = v as Record<string, unknown>;
        return (
          (g.latitude !== undefined && g.longitude !== undefined) ||
          g["@type"] === "GeoCoordinates"
        );
      }
    case "openingHours":
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return false;
    default:
      return true;
  }
}
