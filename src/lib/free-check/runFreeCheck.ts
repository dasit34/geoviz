// Orchestrator for the /check "Free AI Visibility Check".
//
// Reuses the exact four V2 preflight analyzers the paid audit's
// intelligence layer runs (src/lib/intelligence/preflight/) — one HTML
// fetch, fanned out in parallel. This is intentionally the SAME cheap
// deterministic pass the paid audit already pays for as a side effect,
// not a new crawler. No LLM call, so the free check is materially
// cheaper and faster than the paid audit by construction.
//
// Never throws — a fetch failure (bad URL, timeout, non-200, DNS
// failure) resolves to a clean `FreeCheckFailure` the API route can
// surface to the customer without a 500.

import { JSDOM } from "jsdom";
import { fetchRawHtml, type HtmlFetcher } from "@/lib/intelligence/preflight/fetchRawHtml";
import { extractReadableContent } from "@/lib/intelligence/preflight/extractReadableContent";
import { validateSchema } from "@/lib/intelligence/preflight/schemaValidation";
import { auditCrawlability } from "@/lib/intelligence/preflight/crawlabilityAudit";
import { checkEntityConsistency } from "@/lib/intelligence/preflight/entityConsistency";
import { deriveChecks } from "./deriveChecks";
import { analyzeOnlineSchema, type OnlineSchemaSignals } from "./onlineSchema";
import type { FreeCheckFailure, FreeCheckInput, FreeCheckResult } from "./types";
import type {
  CrawlabilityResult,
  EntityConsistencyResult,
  ReadableContentResult,
  SchemaValidationResult,
} from "@/lib/intelligence/preflight/types";

const PLAIN_TEXT_CAP = 20_000;

/**
 * Independent, minimal plain-text extraction for keyword matching
 * (business name / city / state / category presence). Deliberately
 * separate from `extractReadableContent`, whose `preview` field is
 * capped at 280 chars — too short for reliable keyword search. Uses
 * the same strip-script/style + body.textContent technique as that
 * module's own fallback path.
 */
function extractPlainText(html: string, url: string): string {
  try {
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    doc.querySelectorAll("script, style, noscript").forEach((n) => n.remove());
    const text = (doc.body?.textContent ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    return text.slice(0, PLAIN_TEXT_CAP);
  } catch {
    return "";
  }
}

export type RunFreeCheckOptions = {
  /** Defaults to `fetchRawHtml` (the /check behavior). */
  fetcher?: HtmlFetcher;
};

/** Raw analyzer outputs behind a free-check result (null = analyzer failed). */
export type FreeCheckSignals = {
  readability: ReadableContentResult | null;
  schema: SchemaValidationResult | null;
  crawlability: CrawlabilityResult | null;
  entityConsistency: EntityConsistencyResult | null;
  /** Organization / WebSite / product schema checklist (scoring v1.2, online businesses). */
  onlineSchema: OnlineSchemaSignals | null;
};

export type FreeCheckDetailed =
  | { result: FreeCheckResult; signals: FreeCheckSignals; finalUrl: string }
  | { result: FreeCheckFailure; signals: null; finalUrl: null };

export async function runFreeCheck(
  input: FreeCheckInput,
  opts: RunFreeCheckOptions = {},
): Promise<FreeCheckResult | FreeCheckFailure> {
  return (await runFreeCheckDetailed(input, opts)).result;
}

/**
 * Same check as `runFreeCheck`, also returning the analyzer signals the
 * result was derived from (for evidence lines). Scoring is unchanged:
 * `deriveChecks` is the only score author.
 */
export async function runFreeCheckDetailed(
  input: FreeCheckInput,
  opts: RunFreeCheckOptions = {},
): Promise<FreeCheckDetailed> {
  const fetchHtml = opts.fetcher ?? fetchRawHtml;
  const fetchRes = await fetchHtml(input.websiteUrl, { timeoutMs: 10_000 });
  if (!fetchRes.ok) {
    if (fetchRes.timedOut) {
      return {
        result: {
          ok: false,
          error:
            "This site took too long to respond. It may be temporarily down — try again in a moment.",
          status: 504,
        },
        signals: null,
        finalUrl: null,
      };
    }
    return {
      result: {
        ok: false,
        error:
          "We couldn't reach this website. Double-check the URL and try again.",
        status: 502,
      },
      signals: null,
      finalUrl: null,
    };
  }

  const { html, finalUrl } = fetchRes;

  const [readability, schema, crawlability, entityConsistency] =
    await Promise.all([
      safe(() => extractReadableContent(html, finalUrl)),
      safe(() => validateSchema(html, finalUrl)),
      safe(() =>
        auditCrawlability({ url: finalUrl, homepageHtml: html, fetcher: opts.fetcher }),
      ),
      safe(() => checkEntityConsistency({ url: finalUrl, html })),
    ]);
  const onlineSchema = await safe(() => analyzeOnlineSchema(html));

  const plainText = extractPlainText(html, finalUrl);

  const result = deriveChecks({
    input,
    plainText,
    readability,
    schema,
    crawlability,
    entityConsistency,
    onlineSchema,
  });
  return {
    result,
    signals: { readability, schema, crawlability, entityConsistency, onlineSchema },
    finalUrl,
  };
}

async function safe<T>(fn: () => T | Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(
      `[free-check] analyzer failed err=${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}
