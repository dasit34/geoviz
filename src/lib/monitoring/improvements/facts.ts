/**
 * Confirmed business facts (pure). Drafts use ONLY confirmed facts; a
 * missing fact is requested, never invented. Values observed on the
 * customer's website are offered as suggestions to confirm.
 */
import { untrustedText } from "./sanitize";

export type BusinessFacts = {
  name: string | null;
  phone: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postal: string | null;
  hours: string | null;
  services: string[];
  serviceAreas: string[];
  licenses: string[];
};

export const EMPTY_FACTS: BusinessFacts = { name: null, phone: null, street: null, city: null, region: null, postal: null, hours: null, services: [], serviceAreas: [], licenses: [] };

export const FACT_LABELS: Record<keyof BusinessFacts, string> = {
  name: "Business name",
  phone: "Phone",
  street: "Street address",
  city: "City",
  region: "State",
  postal: "ZIP code",
  hours: "Opening hours",
  services: "Services",
  serviceAreas: "Service areas",
  licenses: "Licenses / certifications",
};

const LIST_KEYS = ["services", "serviceAreas", "licenses"] as const;
const SCALAR_KEYS = ["name", "phone", "street", "city", "region", "postal", "hours"] as const;

export type FactsValidation = { ok: true; facts: BusinessFacts } | { ok: false; message: string };

/** Validate customer/operator input (form fields; lists one per line). */
export function validateFacts(input: Record<string, string | undefined>): FactsValidation {
  const facts: BusinessFacts = { ...EMPTY_FACTS, services: [], serviceAreas: [], licenses: [] };
  for (const k of SCALAR_KEYS) {
    const v = untrustedText(input[k] ?? "", k === "hours" ? 200 : 120);
    facts[k] = v.length > 0 ? v : null;
  }
  for (const k of LIST_KEYS) {
    facts[k] = Array.from(new Set((input[k] ?? "").split(/\n|,/).map((s) => untrustedText(s, 80)).filter((s) => s.length >= 2))).slice(0, 20);
  }
  if (facts.name && /https?:\/\/|www\./i.test(facts.name)) return { ok: false, message: "Enter the business name, not a website address." };
  if (facts.phone) {
    const d = facts.phone.replace(/\D/g, "");
    if (d.length < 10 || d.length > 11) return { ok: false, message: "Enter a 10-digit phone number." };
  }
  if (facts.postal && !/^\d{5}(-\d{4})?$/.test(facts.postal)) return { ok: false, message: "Enter a 5-digit ZIP code." };
  if (facts.region && facts.region.length > 30) return { ok: false, message: "Enter the state (e.g. OH)." };
  return { ok: true, facts };
}

export function parseFacts(v: unknown): BusinessFacts {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const s = (x: unknown) => (typeof x === "string" && x.trim() ? x : null);
  const l = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === "string") : []);
  return { name: s(o.name), phone: s(o.phone), street: s(o.street), city: s(o.city), region: s(o.region), postal: s(o.postal), hours: s(o.hours), services: l(o.services), serviceAreas: l(o.serviceAreas), licenses: l(o.licenses) };
}

export type ObservedIdentity = { name: string | null; phone: string | null; address: string | null; locations: string[] };

/** Suggestions to confirm — shown as "found on your website", never used directly. */
export function suggestFactsFromObserved(args: { businessName: string | null; observed: ObservedIdentity | null }): Partial<Record<keyof BusinessFacts, string>> {
  const out: Partial<Record<keyof BusinessFacts, string>> = {};
  const name = untrustedText(args.observed?.name ?? args.businessName ?? "", 120);
  if (name) out.name = name;
  const phone = untrustedText(args.observed?.phone ?? "", 40);
  if (phone.replace(/\D/g, "").length >= 10) out.phone = phone;
  const addr = untrustedText(args.observed?.address ?? "", 200);
  if (addr) out.street = addr;
  const locs = (args.observed?.locations ?? []).map((x) => untrustedText(x, 80)).filter(Boolean).slice(0, 8);
  if (locs.length) out.serviceAreas = locs.join("\n");
  return out;
}

export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
