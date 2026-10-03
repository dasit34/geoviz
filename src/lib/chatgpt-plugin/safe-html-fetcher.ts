/**
 * SSRF-safe `HtmlFetcher` for the ChatGPT plugin's website check.
 *
 * Adapts the monitoring scanner's `safeFetch` (public-IP validation at DNS
 * and connect time, same-site redirects re-validated per hop, timeout,
 * size cap) to the `fetchRawHtml` contract the free-check analyzers use, so
 * the existing analyzers and scoring run unchanged on top of it.
 *
 * Failure text returned here is generic on purpose: analyzers may copy the
 * `error` string into findings, and nothing about internal addresses or
 * resolver behavior should reach a ChatGPT response.
 */
import type { FetchRawHtmlOptions, FetchRawHtmlResult, HtmlFetcher } from "@/lib/intelligence/preflight/fetchRawHtml";
import { normalizeDomain } from "@/lib/business/normalize-domain";
import { safeFetch, type FetchFailure, type Resolver, type Transport } from "@/lib/monitoring/website/safe-fetch";

export const HOMEPAGE_MAX_BYTES = 1_500_000;
export const AUX_MAX_BYTES = 512_000;
const HOMEPAGE_TIMEOUT_MS = 8_000;
const AUX_TIMEOUT_MS = 5_000;

export type SafeHtmlFetcherOptions = {
  /** Test seams; default to the real DNS resolver and node transport. */
  resolver?: Resolver;
  transport?: Transport;
};

/** The homepage fetch outcome, kept so the tool can explain a failure precisely. */
export type HomepageOutcome = { kind: "ok" } | { kind: FetchFailure };

export function createSafeHtmlFetcher(siteUrl: string, opts: SafeHtmlFetcherOptions = {}) {
  const site = normalizeDomain(siteUrl);
  let homepage: HomepageOutcome | null = null;
  let calls = 0;

  const fetcher: HtmlFetcher = async (url: string, fetchOpts?: FetchRawHtmlOptions): Promise<FetchRawHtmlResult> => {
    const isHomepage = calls === 0;
    calls += 1;
    if (!site) {
      if (isHomepage) homepage = { kind: "blocked_unsafe" };
      return { ok: false, error: "fetch blocked", timedOut: false };
    }
    const isXml = /\/sitemap\.xml$/i.test(new URL(url, "https://x.invalid").pathname);
    const res = await safeFetch(url, {
      site,
      accept: isHomepage ? "html" : isXml ? "xml" : "text",
      timeoutMs: Math.min(fetchOpts?.timeoutMs ?? Infinity, isHomepage ? HOMEPAGE_TIMEOUT_MS : AUX_TIMEOUT_MS),
      maxBytes: isHomepage ? HOMEPAGE_MAX_BYTES : AUX_MAX_BYTES,
      maxRedirects: 3,
      resolver: opts.resolver,
      transport: opts.transport,
    });
    if (isHomepage) homepage = res.ok ? { kind: "ok" } : { kind: res.fetchStatus };
    if (res.ok) {
      return { ok: true, html: res.body, finalUrl: res.finalUrl, status: res.status, contentType: res.contentType };
    }
    // A plain HTTP status on robots.txt / sitemap.xml is a normal "absent" answer for the analyzers.
    if (!isHomepage && res.httpStatus !== null && (res.fetchStatus === "not_found" || res.fetchStatus === "http_error" || res.fetchStatus === "access_denied")) {
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
