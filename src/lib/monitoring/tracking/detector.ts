/**
 * Deterministic mention detection (pure). Never asks the model whether it
 * mentioned the business — it checks the answer text, the ordered list of
 * named businesses, and the cited domains against the entity's name and
 * website.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

import { domainMatches } from "./citations";
import type { TrackedEntity } from "./types";

export const DETECTOR_VERSION = "detector@1.0.0";

const LEGAL_SUFFIXES = /\b(llc|inc|incorporated|co|company|corp|corporation|ltd|pllc|pc|lp|llp)\b/g;

/** Lowercase, `&`→and, punctuation→space, legal suffixes and leading "the" removed. */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "") // "L.L.C." → "llc", "Inc." → "inc" before punctuation becomes spaces
    .replace(/[^a-z0-9]+/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/^\s*the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compact(s: string): string {
  return s.replace(/[^a-z0-9]/g, "");
}

export type EntityMatch = {
  matched: boolean;
  matchedBy: string[];
  matchedText: string | null;
};

export type EntityMatcher = {
  entity: TrackedEntity;
  domain: string | null;
  matchName(candidate: string): boolean;
  match(args: { answerText: string; namedBusinesses: string[]; citedDomains: string[] }): EntityMatch;
};

export function buildEntityMatcher(entity: TrackedEntity): EntityMatcher {
  const name = normalizeEntityName(entity.name);
  const nameCompact = compact(name);
  const domain = normalizeDomain(entity.websiteUrl);
  // "rockroofing.com" → "rockroofing": brand label, used only when long enough to be distinctive.
  const domainLabel = domain ? compact(domain.split(".")[0] ?? "") : "";
  const useName = name.length >= 3;
  const useCompactName = nameCompact.length >= 6;
  const useDomainLabel = domainLabel.length >= 6;

  function matchName(candidate: string): boolean {
    const c = normalizeEntityName(candidate);
    if (!c) return false;
    if (useName && (c === name || ` ${c} `.includes(` ${name} `))) return true;
    const cc = compact(c);
    if (useCompactName && cc.includes(nameCompact)) return true;
    if (useDomainLabel && cc === domainLabel) return true;
    return false;
  }

  function match({ answerText, namedBusinesses, citedDomains }: { answerText: string; namedBusinesses: string[]; citedDomains: string[] }): EntityMatch {
    const matchedBy: string[] = [];
    let matchedText: string | null = null;

    const listed = namedBusinesses.find((b) => matchName(b));
    if (listed) {
      matchedBy.push("named_business");
      matchedText = listed;
    }
    const text = ` ${normalizeEntityName(answerText)} `;
    if (useName && text.includes(` ${name} `)) {
      matchedBy.push("answer_text");
      matchedText ??= entity.name;
    } else if (useCompactName && compact(text).includes(nameCompact)) {
      matchedBy.push("answer_text_compact");
      matchedText ??= entity.name;
    }
    if (domain && answerText.toLowerCase().includes(domain)) {
      matchedBy.push("answer_domain");
      matchedText ??= domain;
    }
    if (domain && citedDomains.some((d) => domainMatches(d, domain))) {
      matchedBy.push("cited_domain");
      matchedText ??= domain;
    }
    return { matched: matchedBy.length > 0, matchedBy, matchedText };
  }

  return { entity, domain, matchName, match };
}
