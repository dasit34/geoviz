/**
 * Short-lived, in-memory cache of fetched public pages for the ChatGPT tool.
 *
 * Why: ChatGPT (and OpenAI's reviewers) often check the same website several
 * times in a few minutes. Instead of refusing with "try again later" once the
 * per-domain limit is reached, repeat checks within the TTL re-run the
 * analyzers on the cached bytes — no new request to the website. Scoring
 * still runs per call, so each caller's business name / city / state are used.
 *
 * Only successful fetches (and plain "absent" robots/sitemap answers) are
 * cached; failures never are. Bounded by entry count and total bytes;
 * oldest entries are evicted first. Process memory only — never persisted.
 */
import type { FetchRawHtmlResult, HtmlFetcher } from "@/lib/intelligence/preflight/fetchRawHtml";

export const CACHE_TTL_MS = 10 * 60_000;
const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;

type Entry = { at: number; value: Extract<FetchRawHtmlResult, { ok: true }>; bytes: number };

const entries = new Map<string, Entry>();
let totalBytes = 0;

function fresh(key: string, now: number): Entry | null {
  const e = entries.get(key);
  if (!e) return null;
  if (now - e.at >= CACHE_TTL_MS) {
    entries.delete(key);
    totalBytes -= e.bytes;
    return null;
  }
  return e;
}

/** True when a fresh cached copy of this exact URL exists. */
export function isCached(url: string, now = Date.now()): boolean {
  return fresh(url, now) !== null;
}

/** Wraps a fetcher so successful responses are served from / stored in the cache. */
export function withFetchCache(inner: HtmlFetcher, now: () => number = Date.now): HtmlFetcher {
  return async (url, opts) => {
    const hit = fresh(url, now());
    if (hit) return hit.value;
    const res = await inner(url, opts);
    if (res.ok) {
      const bytes = Buffer.byteLength(res.html);
      if (bytes <= MAX_TOTAL_BYTES) {
        const prev = entries.get(url);
        if (prev) totalBytes -= prev.bytes;
        entries.delete(url);
        entries.set(url, { at: now(), value: res, bytes });
        totalBytes += bytes;
        for (const [k, e] of entries) {
          if (entries.size <= MAX_ENTRIES && totalBytes <= MAX_TOTAL_BYTES) break;
          entries.delete(k);
          totalBytes -= e.bytes;
        }
      }
    }
    return res;
  };
}

/** Test helper. */
export function clearFetchCache(): void {
  entries.clear();
  totalBytes = 0;
}
