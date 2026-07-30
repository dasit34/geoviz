// Node-side HTML fetch with redirect-follow + timeout + GeoViz User-Agent.
// Mirrors the pattern in `src/lib/intelligence/render/renderIntelligence.ts`
// (`createDefaultRawFetcher`) but returns the raw HTML string for
// downstream parsing rather than a parsed snapshot.
//
// Single-purpose utility — never throws on network or parse errors;
// returns a `{ ok: false, error }` result instead so callers can fold
// failures into their own structured output. Used by the preflight
// orchestrator to do exactly one fetch per audit and then fan that
// HTML out to four independent analyzers.

export type FetchRawHtmlResult =
  | {
      ok: true;
      html: string;
      finalUrl: string;
      status: number;
      contentType: string | null;
    }
  | {
      ok: false;
      error: string;
      /** True when the failure was the timeoutMs AbortController firing, not a DNS/connection/protocol error. */
      timedOut: boolean;
    };

export type FetchRawHtmlOptions = {
  /** Abort if the fetch takes longer than this. Default 10s. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;

const USER_AGENT =
  "Mozilla/5.0 (compatible; GeoVizPreflightProbe/1.0; +https://geoviz.ai)";

export async function fetchRawHtml(
  url: string,
  opts: FetchRawHtmlOptions = {},
): Promise<FetchRawHtmlResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const contentType = res.headers.get("content-type");
    // Don't choke on non-HTML responses — caller decides what to do.
    const html = await res.text();
    return {
      ok: true,
      html,
      finalUrl: res.url || url,
      status: res.status,
      contentType,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const timedOut = err instanceof Error && err.name === "AbortError";
    return { ok: false, error: message, timedOut };
  } finally {
    clearTimeout(timer);
  }
}
