// Online-business structured-data checklist for the /check free score
// (scoring v1.2). Online / software businesses are scored on the schema that
// identifies them — Organization, WebSite, and a product node — instead of
// LocalBusiness fields (address, geo, opening hours) that don't apply.
//
// Parses JSON-LD the same way the preflight schema validator does
// (ld+json scripts, top-level arrays, @graph) but lives here so the paid
// audit's preflight analyzers stay untouched. Pure; never throws.

import { JSDOM } from "jsdom";

export type OnlineSchemaItemKey =
  | "organization_name"
  | "organization_url"
  | "organization_logo_or_sameas"
  | "website"
  | "product_name"
  | "product_details";

export type OnlineSchemaSignals = {
  items: { key: OnlineSchemaItemKey; label: string; present: boolean }[];
  /** 0..100 — share of checklist items present. */
  score: number;
  /** The product @type found, if any (e.g. "SoftwareApplication"). */
  productType: string | null;
};

const ORGANIZATION_TYPES = new Set(["Organization", "Corporation", "OnlineBusiness", "OnlineStore"]);
const PRODUCT_TYPES = new Set(["SoftwareApplication", "WebApplication", "MobileApplication", "Product", "Service"]);

const LABELS: Record<OnlineSchemaItemKey, string> = {
  organization_name: "Organization name",
  organization_url: "Organization url",
  organization_logo_or_sameas: "Organization logo or sameAs",
  website: "WebSite",
  product_name: "Product / SoftwareApplication name",
  product_details: "Product details (applicationCategory, offers, or description)",
};

type Node = Record<string, unknown>;

export function analyzeOnlineSchema(html: string): OnlineSchemaSignals {
  const nodes: Node[] = [];
  try {
    const doc = new JSDOM(html).window.document;
    doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
      try {
        collect(JSON.parse(s.textContent ?? ""), nodes);
      } catch {
        // malformed block — ignored, as in the preflight validator
      }
    });
  } catch {
    // unparseable HTML — no nodes
  }

  const org = best(nodes.filter((n) => hasType(n, ORGANIZATION_TYPES)), ["name", "url", "logo", "sameAs"]);
  const website = nodes.find((n) => hasType(n, new Set(["WebSite"])) && (filled(n.name) || filled(n.url)));
  const product = best(nodes.filter((n) => hasType(n, PRODUCT_TYPES)), ["name", "applicationCategory", "offers", "description"]);

  const present: Record<OnlineSchemaItemKey, boolean> = {
    organization_name: Boolean(org && filled(org.name)),
    organization_url: Boolean(org && filled(org.url)),
    organization_logo_or_sameas: Boolean(org && (filled(org.logo) || filled(org.sameAs))),
    website: Boolean(website),
    product_name: Boolean(product && filled(product.name)),
    product_details: Boolean(product && (filled(product.applicationCategory) || filled(product.offers) || filled(product.description))),
  };
  const items = (Object.keys(LABELS) as OnlineSchemaItemKey[]).map((key) => ({ key, label: LABELS[key], present: present[key] }));
  const score = Math.round((items.filter((i) => i.present).length / items.length) * 100);
  const productType = product ? typesOf(product).find((t) => PRODUCT_TYPES.has(t)) ?? null : null;
  return { items, score, productType };
}

function collect(node: unknown, out: Node[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out);
    return;
  }
  const obj = node as Node;
  out.push(obj);
  const graph = obj["@graph"];
  if (Array.isArray(graph)) for (const g of graph) collect(g, out);
}

function typesOf(n: Node): string[] {
  const t = n["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

function hasType(n: Node, set: Set<string>): boolean {
  return typesOf(n).some((t) => set.has(t));
}

function filled(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(filled);
  return v !== null && typeof v === "object";
}

/** The node with the most of `fields` filled (first wins ties). */
function best(candidates: Node[], fields: string[]): Node | null {
  let top: Node | null = null;
  let topCount = -1;
  for (const n of candidates) {
    const count = fields.filter((f) => filled(n[f])).length;
    if (count > topCount) {
      top = n;
      topCount = count;
    }
  }
  return top;
}
