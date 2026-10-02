/**
 * Bounded page discovery (pure helpers).
 *
 * Candidate pages come from three places, in priority order:
 *   1. the homepage itself;
 *   2. same-site homepage links whose path or anchor text looks like an
 *      About / Services / Locations / Service-area page;
 *   3. sitemap <loc> entries (robots `Sitemap:` lines, else /sitemap.xml;
 *      at most one level of sitemap index; at most `maxSitemapUrlsRead`
 *      locs read), service/location-like paths first.
 * Previously captured pages are re-checked so removals can be confirmed.
 * Nothing here fetches — the scanner does, through safe-fetch.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

export type DiscoveredVia = "homepage" | "nav_link" | "sitemap" | "recheck";
export type PageKind = "about" | "service" | "location" | "contact" | "other";

const ASSET_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|json|xml|txt|zip|mp4|mp3|mov|docx?|xlsx?)$/i;
const SKIP_PATH = /\/(wp-admin|wp-login|wp-json|cart|checkout|account|login|signin|register|feed|tag|author|search|privacy|terms|cookie|careers?|jobs?|join-our-team|employment)/i;

/** Comparison key for a page: no scheme, no www, no query, no fragment, no trailing slash. */
export function normalizePageUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
    let path = u.pathname.replace(/\/{2,}/g, "/").replace(/\/index\.(html?|php)$/i, "/");
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return `${host}${path.toLowerCase() || "/"}`;
  } catch {
    return null;
  }
}

export function classifyPage(url: string, anchorText = ""): PageKind {
  let path = "";
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {
    return "other";
  }
  const hay = `${path} ${anchorText.toLowerCase()}`;
  if (/(about|our-story|who-we-are|our-team|\bteam\b)/.test(hay)) return "about";
  if (/(location|service-area|areas-we-serve|areas-served|service area|areas served|\bcities\b|near-me)/.test(hay)) return "location";
  if (/(service|repair|install|replacement|maintenance|tune-up|heating|cooling|furnace|air-condition|\bac\b|hvac|heat-pump|plumb|duct|water-heater|boiler|roof|drain)/.test(hay)) return "service";
  if (/contact/.test(hay)) return "contact";
  return "other";
}

function sameSitePage(raw: string, base: string, siteDomain: string): string | null {
  try {
    const u = new URL(raw, base);
    u.hash = "";
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (normalizeDomain(u.toString()) !== siteDomain) return null;
    if (ASSET_EXT.test(u.pathname) || SKIP_PATH.test(u.pathname)) return null;
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** Same-site homepage links that look like About / Service / Location pages. */
export function navCandidates(links: Array<{ href: string; text: string }>, baseUrl: string, siteDomain: string): string[] {
  const out: Array<{ url: string; kind: PageKind }> = [];
  const seen = new Set<string>([normalizePageUrl(baseUrl) ?? ""]);
  for (const l of links) {
    const url = sameSitePage(l.href, baseUrl, siteDomain);
    if (!url) continue;
    const key = normalizePageUrl(url);
    if (!key || seen.has(key)) continue;
    const kind = classifyPage(url, l.text);
    if (kind === "other" || kind === "contact") continue;
    seen.add(key);
    out.push({ url, kind });
  }
  const rank: Record<PageKind, number> = { about: 0, service: 1, location: 2, contact: 3, other: 4 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind]).map((x) => x.url);
}

export type ParsedSitemap = { kind: "index" | "urlset"; locs: string[] };

/** Minimal sitemap parser: <sitemapindex> or <urlset>, <loc> values only. */
export function parseSitemap(xml: string, maxLocs: number): ParsedSitemap {
  const kind = /<sitemapindex[\s>]/i.test(xml) ? "index" : "urlset";
  const locs: string[] = [];
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && locs.length < maxLocs) {
    locs.push(m[1].replace(/&amp;/g, "&"));
  }
  return { kind, locs };
}

/** Sitemap locs restricted to the site, service/location/about pages first. */
export function sitemapCandidates(locs: string[], siteDomain: string): string[] {
  const rank: Record<PageKind, number> = { service: 0, location: 1, about: 2, contact: 4, other: 3 };
  const seen = new Set<string>();
  const out: Array<{ url: string; r: number; i: number }> = [];
  locs.forEach((loc, i) => {
    const url = sameSitePage(loc, `https://${siteDomain}/`, siteDomain);
    const key = url && normalizePageUrl(url);
    if (!url || !key || seen.has(key)) return;
    seen.add(key);
    out.push({ url, r: rank[classifyPage(url)], i });
  });
  return out.sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.url);
}

export type PagePlan = Array<{ url: string; via: DiscoveredVia }>;

/**
 * Choose the bounded page set. Previously captured pages come right after
 * the homepage so consecutive scans compare the same pages, but up to
 * `reserveNew` slots stay open for newly discovered pages so additions can
 * be seen even when the baseline filled the budget.
 */
export function planPages(args: {
  homepage: string;
  nav: string[];
  sitemap: string[];
  previous: string[];
  maxPages: number;
  reserveNew?: number;
}): PagePlan {
  const max = Math.max(1, args.maxPages);
  const reserve = Math.min(args.reserveNew ?? 3, max - 1);
  const plan: PagePlan = [{ url: args.homepage, via: "homepage" }];
  const taken = new Set<string>([normalizePageUrl(args.homepage) ?? args.homepage]);
  const discovered = new Map<string, { url: string; via: DiscoveredVia }>();
  for (const u of args.nav) {
    const k = normalizePageUrl(u);
    if (k && !discovered.has(k)) discovered.set(k, { url: u, via: "nav_link" });
  }
  for (const u of args.sitemap) {
    const k = normalizePageUrl(u);
    if (k && !discovered.has(k)) discovered.set(k, { url: u, via: "sitemap" });
  }
  const add = (key: string, entry: { url: string; via: DiscoveredVia }) => {
    if (taken.has(key) || plan.length >= max) return;
    taken.add(key);
    plan.push(entry);
  };
  const newOnes = Array.from(discovered.entries()).filter(([k]) => !args.previous.some((p) => normalizePageUrl(p) === k));
  const previousBudget = max - Math.min(reserve, newOnes.length);
  for (const p of args.previous) {
    if (plan.length >= previousBudget) break;
    const k = normalizePageUrl(p);
    if (!k) continue;
    const found = discovered.get(k);
    add(k, found ?? { url: p, via: "recheck" });
  }
  for (const [k, entry] of newOnes) add(k, entry);
  for (const [k, entry] of discovered) add(k, entry);
  return plan;
}
