/**
 * Citation extraction + normalization (pure).
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

const URL_RE = /https?:\/\/[^\s<>()"'\]]+/gi;
const TRAILING = /[.,;:!?)\]]+$/;

/** URLs written in an answer's text (markdown links included). */
export function extractUrlsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  return (text.match(URL_RE) ?? []).map((u) => u.replace(TRAILING, ""));
}

/** Canonical form for de-duplication: lowercase host, no fragment, no trailing slash, tracking params dropped. */
export function normalizeCitationUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|gclid|fbclid|ref$|srsltid)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    if (s.endsWith("/") && u.pathname === "/" && !u.search) s = s.slice(0, -1);
    return s;
  } catch {
    return null;
  }
}

/** Native citations first (they are the real retrieval set), then text URLs; de-duplicated. */
export function mergeCitations(native: string[], fromText: string[]): { urls: string[]; domains: string[] } {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of [...native, ...fromText]) {
    const n = typeof raw === "string" ? normalizeCitationUrl(raw) : null;
    if (n && !seen.has(n)) {
      seen.add(n);
      urls.push(n);
    }
  }
  const domains = Array.from(new Set(urls.map((u) => normalizeDomain(u)).filter((d): d is string => !!d)));
  return { urls, domains };
}

/** True when `domain` is `owner` or a subdomain of it. */
export function domainMatches(domain: string, owner: string | null): boolean {
  if (!owner) return false;
  return domain === owner || domain.endsWith(`.${owner}`);
}
