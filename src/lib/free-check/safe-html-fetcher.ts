/**
 * SSRF-safe `HtmlFetcher` for the free website check — used by both the
 * public `/api/free-check` route and the ChatGPT plugin's MCP tool.
 *
 * Adapts the monitoring scanner's `safeFetch` (public-IP validation at DNS
 * and connect time, redirects re-validated per hop, timeout, size cap) to the
 * `fetchRawHtml` contract the free-check analyzers use, so the existing
 * analyzers and scoring run unchanged on top of it.
 *
 * It also fixes a fidelity gap: Node's built-in `fetch` always sends
 * `sec-fetch-mode: cors` and `accept-language: *`, and some prerendered sites
 * answer those with their client-side app shell instead of the real page
 * (ricksaffordableheating.com: 5.9 KB shell vs 39 KB page). `safeFetch`'s
 * node:https transport sends only an honest User-Agent and Accept.
 *
 * Failure text returned here is generic on purpose: analyzers may copy the
 * `error` string into findings, and nothing about internal addresses or
 * resolver behavior should reach a customer or ChatGPT response.
 */
import type { FetchRawHtmlOptions, FetchRawHtmlResult, HtmlFetcher } from "@/lib/intelligence/preflight/fetchRawHtml";
import { normalizeDomain } from "@/lib/business/normalize-domain";
import { safeFetch, type FetchFailure, type Resolver, type Transport } from "@/lib/monitoring/website/safe-fetch";

export const HOMEPAGE_MAX_BYTES = 1_500_000;
export const AUX_MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;

export type SafeHtmlFetcherOptions = {
  /** Test seams; default to the real DNS resolver and node transport. */
  resolver?: Resolver;
  transport?: Transport;
  /** Homepage limits. Defaults: 8 s, 1.5 MB (the ChatGPT tool). */
  homepageTimeoutMs?: number;
  homepageMaxBytes?: number;
  /** robots.txt / sitemap.xml timeout. Default 5 s. */
  auxTimeoutMs?: number;
  /**
   * Follow homepage redirects to a DIFFERENT site (e.g. brand.com →
   * brandco.com). Every hop is still re-validated against the public-IP
   * rules, and the total stays within 3 redirects. Default false (same-site
   * only, the ChatGPT tool's rule).
   */
  followCrossSiteRedirects?: boolean;
};

/**
 * `/api/free-check` settings: the same 10 s homepage timeout the route had
 * with `fetchRawHtml`, a generous 5 MB cap (it previously had none), and
 * cross-site redirects followed with every hop re-validated.
 */
export const CHECK_ROUTE_FETCH_OPTIONS: SafeHtmlFetcherOptions = {
  homepageTimeoutMs: 10_000,
  homepageMaxBytes: 5_000_000,
  followCrossSiteRedirects: true,
};

/** The homepage fetch outcome, kept so callers can explain a failure precisely. */
export type HomepageOutcome = { kind: "ok" } | { kind: FetchFailure };

export function createSafeHtmlFetcher(siteUrl: string, opts: SafeHtmlFetcherOptions = {}) {
  let site = normalizeDomain(siteUrl);
  let homepage: HomepageOutcome | null = null;
  const homepageTimeoutMs = opts.homepageTimeoutMs ?? 8_000;
  const homepageMaxBytes = opts.homepageMaxBytes ?? HOMEPAGE_MAX_BYTES;
  const auxTimeoutMs = opts.auxTimeoutMs ?? 5_000;

  const fetchHomepage = async (url: string, startSite: string, timeoutMs: number) => {
    let current = url;
    let currentSite = startSite;
    let hopsUsed = 0;
    for (;;) {
      const res = await safeFetch(current, {
        site: currentSite,
        accept: "html",
        timeoutMs,
        maxBytes: homepageMaxBytes,
        maxRedirects: MAX_REDIRECTS - hopsUsed,
        resolver: opts.resolver,
        transport: opts.transport,
      });
      if (res.ok || res.fetchStatus !== "redirect_offsite" || !opts.followCrossSiteRedirects || !res.finalUrl) {
        return { res, site: currentSite };
      }
      // Cross-site hop: start a fresh, fully re-validated fetch on the new site.
      hopsUsed += res.redirects.length;
      const nextSite = normalizeDomain(res.finalUrl);
      if (hopsUsed > MAX_REDIRECTS || !nextSite) {
        return { res: { ...res, fetchStatus: "http_error" as const, error: "too many redirects" }, site: currentSite };
      }
      current = res.finalUrl;
      currentSite = nextSite;
    }
  };

  const fetcher: HtmlFetcher = async (url: string, fetchOpts?: FetchRawHtmlOptions): Promise<FetchRawHtmlResult> => {
    // The homepage is the URL this fetcher was created for (identified by URL,
    // not call order, so a caching wrapper can skip it without confusing the
    // robots.txt / sitemap.xml requests that follow).
    const isHomepage = url === siteUrl && homepage === null;
    if (!site) {
      if (isHomepage) homepage = { kind: "blocked_unsafe" };
      return { ok: false, error: "fetch blocked", timedOut: false };
    }

    if (isHomepage) {
      const { res, site: finalSite } = await fetchHomepage(url, site, Math.min(fetchOpts?.timeoutMs ?? Infinity, homepageTimeoutMs));
      homepage = res.ok ? { kind: "ok" } : { kind: res.fetchStatus };
      if (!res.ok) return { ok: false, error: genericError(res.fetchStatus), timedOut: res.fetchStatus === "timeout" };
      site = finalSite; // robots.txt / sitemap.xml come from the site the homepage landed on
      return { ok: true, html: res.body, finalUrl: res.finalUrl, status: res.status, contentType: res.contentType };
    }

    const isXml = /\/sitemap\.xml$/i.test(new URL(url, "https://x.invalid").pathname);
    const res = await safeFetch(url, {
      site,
      accept: isXml ? "xml" : "text",
      timeoutMs: Math.min(fetchOpts?.timeoutMs ?? Infinity, auxTimeoutMs),
      maxBytes: AUX_MAX_BYTES,
      maxRedirects: MAX_REDIRECTS,
      resolver: opts.resolver,
      transport: opts.transport,
    });
    if (res.ok) {
      return { ok: true, html: res.body, finalUrl: res.finalUrl, status: res.status, contentType: res.contentType };
    }
    // A plain HTTP status on robots.txt / sitemap.xml is a normal "absent" answer for the analyzers.
    if (res.httpStatus !== null && (res.fetchStatus === "not_found" || res.fetchStatus === "http_error" || res.fetchStatus === "access_denied")) {
      return { ok: true, html: "", finalUrl: res.finalUrl ?? url, status: res.httpStatus, contentType: null };
    }
    return { ok: false, error: genericError(res.fetchStatus), timedOut: res.fetchStatus === "timeout" };
  };

  return {
    fetcher,
    /** Null until the first (homepage) request has completed. */
    homepageOutcome: (): HomepageOutcome | null => homepage,
  };
}

function genericError(kind: FetchFailure): string {
  switch (kind) {
    case "timeout":
      return "timed out";
    case "too_large":
      return "response too large";
    case "blocked_unsafe":
    case "redirect_offsite":
      return "fetch blocked";
    default:
      return "fetch failed";
  }
}
