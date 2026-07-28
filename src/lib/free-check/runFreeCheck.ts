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
import { fetchRawHtml } from "@/lib/intelligence/preflight/fetchRawHtml";
import { extractReadableContent } from "@/lib/intelligence/preflight/extractReadableContent";
import { validateSchema } from "@/lib/intelligence/preflight/schemaValidation";
import { auditCrawlability } from "@/lib/intelligence/preflight/crawlabilityAudit";
import { checkEntityConsistency } from "@/lib/intelligence/preflight/entityConsistency";
import { deriveChecks } from "./deriveChecks";
import type { FreeCheckFailure, FreeCheckInput, FreeCheckResult } from "./types";

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

export async function runFreeCheck(
  input: FreeCheckInput,
): Promise<FreeCheckResult | FreeCheckFailure> {
  const fetchRes = await fetchRawHtml(input.websiteUrl, { timeoutMs: 10_000 });
  if (!fetchRes.ok) {
    return {
      ok: false,
      error:
        "We couldn't reach this website. Double-check the URL and try again.",
    };
  }

  const { html, finalUrl } = fetchRes;

  const [readability, schema, crawlability, entityConsistency] =
    await Promise.all([
      safe(() => extractReadableContent(html, finalUrl)),
      safe(() => validateSchema(html, finalUrl)),
      safe(() => auditCrawlability({ url: finalUrl, homepageHtml: html })),
      safe(() => checkEntityConsistency({ url: finalUrl, html })),
    ]);

  const plainText = extractPlainText(html, finalUrl);

  return deriveChecks({
    input,
    plainText,
    readability,
    schema,
    crawlability,
    entityConsistency,
  });
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
