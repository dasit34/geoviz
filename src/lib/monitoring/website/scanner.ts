/**
 * One bounded, polite scan of one site (customer or confirmed competitor).
 *
 * Order: robots.txt → homepage → sitemap(s) → planned pages. Every request
 * goes through `safeFetch` (SSRF-safe, same-site redirects only, size and
 * time capped). robots.txt is honored per RFC 9309; disallowed pages are
 * recorded as `blocked_robots` without a request. A robots.txt that cannot
 * be fetched (5xx / network) stops the scan — we never guess past it.
 * Requests to one site are spaced by max(500 ms, Crawl-delay ≤ 5 s).
 *
 * Pure orchestration: fetch, sleep, and clock are injected.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

import { navCandidates, normalizePageUrl, parseSitemap, planPages, sitemapCandidates, type DiscoveredVia } from "./discover";
import { extractPage, SCANNER_VERSION, type ExtractedPage } from "./extract";
import { crawlDelayMs, isAllowed, robotsPolicyFrom, type RobotsPolicy } from "./robots";
import { safeFetch, type FetchFailure, type SafeFetchOptions, type SafeFetchResult } from "./safe-fetch";

export type PageFetchStatus = "ok" | FetchFailure | "blocked_robots";

export type PageCapture = {
  url: string;
  normalizedUrl: string;
  discoveredVia: DiscoveredVia;
  fetchStatus: PageFetchStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  error: string | null;
  extracted: ExtractedPage | null;
  fetchedAt: Date;
};

export type SiteScanStatus = "completed" | "partial" | "failed" | "blocked";

export type SiteScanResult = {
  status: SiteScanStatus;
  scannerVersion: string;
  robotsOutcome: string;
  /** Pages discovered (nav + sitemap), normalized — used to tell "added" from "newly sampled". */
  discoveredUrls: string[];
  /** True when discovery itself worked (homepage OK); additions are only reported then. */
  discoveryComplete: boolean;
  pages: PageCapture[];
  requests: number;
  bytesFetched: number;
  durationMs: number;
  error: string | null;
  /** For failed/blocked scans: worth retrying later (transient), vs a site rule / restriction. */
  retryable: boolean;
};

const TRANSIENT: ReadonlySet<string> = new Set(["timeout", "network_error", "http_error"]);

export type ScanLimits = { maxPagesPerSite: number; maxSitemapUrlsRead: number };

export type Fetcher = (url: string, opts: Pick<SafeFetchOptions, "site" | "accept">) => Promise<SafeFetchResult>;

export type ScanDeps = {
  fetcher?: Fetcher;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

const MAX_CHILD_SITEMAPS = 3;

export async function scanSite(
  input: { siteUrl: string; limits: ScanLimits; previousUrls?: string[] },
  deps: ScanDeps = {},
): Promise<SiteScanResult> {
  const fetcher: Fetcher = deps.fetcher ?? ((url, o) => safeFetch(url, o));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? (() => new Date());
  const started = now().getTime();
  const site = normalizeDomain(input.siteUrl);
  const result: SiteScanResult = {
    status: "failed",
    scannerVersion: SCANNER_VERSION,
    robotsOutcome: "not_checked",
    discoveredUrls: [],
    discoveryComplete: false,
    pages: [],
    requests: 0,
    bytesFetched: 0,
    durationMs: 0,
    error: null,
    retryable: false,
  };
  const finish = (status: SiteScanStatus, error: string | null = null) => {
    result.status = status;
    result.error = error;
    result.durationMs = Math.max(0, now().getTime() - started);
    return result;
  };
  if (!site) return finish("failed", "site URL is not a valid public domain");

  let base: URL;
  try {
    base = new URL(/^https?:\/\//i.test(input.siteUrl) ? input.siteUrl : `https://${input.siteUrl}`);
  } catch {
    return finish("failed", "site URL is not parseable");
  }
  const origin = base.origin;

  let delay = 500;
  let lastRequestAt: number | null = null;
  const politeFetch = async (url: string, accept: SafeFetchOptions["accept"]) => {
    if (lastRequestAt !== null) {
      const wait = lastRequestAt + delay - now().getTime();
      if (wait > 0) await sleep(wait);
    }
    result.requests += 1;
    const res = await fetcher(url, { site, accept });
    lastRequestAt = now().getTime();
    result.bytesFetched += res.bytes;
    return res;
  };

  // 1. robots.txt
  const robotsRes = await politeFetch(`${origin}/robots.txt`, "text");
  const policy: RobotsPolicy = robotsPolicyFrom(robotsRes.ok ? { ok: true, body: robotsRes.body } : robotsRes);
  delay = crawlDelayMs(policy);
  if (policy.kind === "disallow_all") {
    result.robotsOutcome = "unavailable";
    result.retryable = true;
    return finish("blocked", policy.reason);
  }
  result.robotsOutcome = policy.kind === "rules" ? (policy.robots.crawlDelaySec ? `rules (crawl-delay ${policy.robots.crawlDelaySec}s)` : "rules") : "none (4xx)";
  const allowed = (url: string) => policy.kind !== "rules" || isAllowed(policy.robots, url);

  const capture = async (url: string, via: DiscoveredVia): Promise<PageCapture> => {
    const normalizedUrl = normalizePageUrl(url) ?? url;
    if (!allowed(url)) {
      return { url, normalizedUrl, discoveredVia: via, fetchStatus: "blocked_robots", httpStatus: null, finalUrl: null, error: "disallowed by robots.txt", extracted: null, fetchedAt: now() };
    }
    const res = await politeFetch(url, "html");
    if (!res.ok) {
      return { url, normalizedUrl, discoveredVia: via, fetchStatus: res.fetchStatus, httpStatus: res.httpStatus, finalUrl: res.finalUrl, error: res.error, extracted: null, fetchedAt: now() };
    }
    let extracted: ExtractedPage | null = null;
    try {
      extracted = extractPage(res.body, res.finalUrl);
    } catch (err) {
      return { url, normalizedUrl, discoveredVia: via, fetchStatus: "network_error", httpStatus: res.status, finalUrl: res.finalUrl, error: `could not parse HTML: ${(err as Error).message}`.slice(0, 200), extracted: null, fetchedAt: now() };
    }
    return { url, normalizedUrl, discoveredVia: via, fetchStatus: "ok", httpStatus: res.status, finalUrl: res.finalUrl, error: null, extracted, fetchedAt: now() };
  };

  // 2. homepage
  const homepageUrl = `${origin}/`;
  const home = await capture(homepageUrl, "homepage");
  result.pages.push(home);
  if (home.fetchStatus !== "ok" || !home.extracted) {
    result.retryable = TRANSIENT.has(home.fetchStatus);
    return finish(home.fetchStatus === "blocked_robots" ? "blocked" : "failed", `homepage: ${home.error ?? home.fetchStatus}`);
  }
  const nav = navCandidates(home.extracted.links, home.finalUrl ?? homepageUrl, site);

  // 3. sitemaps (non-fatal)
  const sitemapLocs: string[] = [];
  const declared = (policy.kind === "rules" ? policy.robots.sitemaps : policy.sitemaps).filter((s) => normalizeDomain(s) === site);
  const roots = declared.length > 0 ? declared.slice(0, 2) : [`${origin}/sitemap.xml`];
  for (const root of roots) {
    if (sitemapLocs.length >= input.limits.maxSitemapUrlsRead || !allowed(root)) continue;
    const sm = await politeFetch(root, "xml");
    if (!sm.ok) continue;
    const parsed = parseSitemap(sm.body, input.limits.maxSitemapUrlsRead - sitemapLocs.length);
    if (parsed.kind === "urlset") {
      sitemapLocs.push(...parsed.locs);
      continue;
    }
    // One level of sitemap index; child sitemaps with page-like names first.
    const children = parsed.locs
      .filter((c) => normalizeDomain(c) === site && allowed(c))
      .sort((a, b) => Number(/page|service|location/i.test(b)) - Number(/page|service|location/i.test(a)))
      .slice(0, MAX_CHILD_SITEMAPS);
    for (const child of children) {
      if (sitemapLocs.length >= input.limits.maxSitemapUrlsRead) break;
      const c = await politeFetch(child, "xml");
      if (!c.ok) continue;
      const cp = parseSitemap(c.body, input.limits.maxSitemapUrlsRead - sitemapLocs.length);
      if (cp.kind === "urlset") sitemapLocs.push(...cp.locs);
    }
  }
  const sitemap = sitemapCandidates(sitemapLocs, site);
  result.discoveredUrls = Array.from(new Set([...nav, ...sitemap].map((u) => normalizePageUrl(u)).filter((u): u is string => !!u)));
  result.discoveryComplete = true;

  // 4. planned pages (homepage already captured)
  const plan = planPages({ homepage: homepageUrl, nav, sitemap, previous: input.previousUrls ?? [], maxPages: input.limits.maxPagesPerSite });
  for (const p of plan.slice(1)) result.pages.push(await capture(p.url, p.via));

  const failed = result.pages.filter((p) => p.fetchStatus !== "ok").length;
  return finish(failed === 0 ? "completed" : "partial");
}
