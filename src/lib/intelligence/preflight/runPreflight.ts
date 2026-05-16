// Preflight intelligence orchestrator.
//
// Runs once per audit, after the Claude API call has already saved
// the markdown to AuditOrder. Fetches the homepage HTML once, then
// fans out to four independent analyzers in parallel:
//   - extractReadableContent  (JSDOM + Mozilla Readability)
//   - validateSchema          (JSON-LD entity field validation)
//   - auditCrawlability       (robots.txt + sitemap.xml + meta checks)
//   - checkEntityConsistency  (name/phone/address across surfaces)
//
// Fail-soft: any module exception is caught and the field is left
// `null` in the consolidated PreflightSignals object. A complete
// preflight failure persists `{ ok: false, fetchOk: false, fetchError }`.
// Never throws.
//
// Wire-up: called from `src/lib/audit-intelligence.ts` inside
// persistAuditIntelligence() between Stage 1 ingest and Stage 2
// render. Result is written to AuditIntelligence.preflightSignals.

import { fetchRawHtml } from "./fetchRawHtml";
import { extractReadableContent } from "./extractReadableContent";
import { validateSchema } from "./schemaValidation";
import { auditCrawlability } from "./crawlabilityAudit";
import { checkEntityConsistency } from "./entityConsistency";
import { PREFLIGHT_ENGINE_VERSION, type PreflightSignals } from "./types";

export async function runPreflight(url: string): Promise<PreflightSignals> {
  const start = Date.now();
  const empty: PreflightSignals = {
    ok: false,
    runDurationMs: 0,
    fetchedUrl: null,
    fetchOk: false,
    readability: null,
    schema: null,
    crawlability: null,
    entityConsistency: null,
    engineVersion: PREFLIGHT_ENGINE_VERSION,
  };

  // Step 1 — fetch homepage HTML once.
  const fetchRes = await fetchRawHtml(url);
  if (!fetchRes.ok) {
    return {
      ...empty,
      runDurationMs: Date.now() - start,
      fetchOk: false,
      fetchError: fetchRes.error,
    };
  }

  // Step 2 — fan out. Use Promise.allSettled so one module's failure
  // doesn't cancel the others. Each `safe*` wrapper turns rejections
  // into nulls and logs the failure for Railway grep-ability.
  const [readability, schema, crawlability, entityConsistency] =
    await Promise.all([
      safeReadability(fetchRes.html, fetchRes.finalUrl),
      safeSchema(fetchRes.html, fetchRes.finalUrl),
      safeCrawlability(fetchRes.finalUrl, fetchRes.html),
      safeEntityConsistency(fetchRes.finalUrl, fetchRes.html),
    ]);

  const ok =
    readability !== null ||
    schema !== null ||
    crawlability !== null ||
    entityConsistency !== null;

  return {
    ok,
    runDurationMs: Date.now() - start,
    fetchedUrl: fetchRes.finalUrl,
    fetchOk: true,
    readability,
    schema,
    crawlability,
    entityConsistency,
    engineVersion: PREFLIGHT_ENGINE_VERSION,
  };
}

async function safeReadability(html: string, url: string) {
  try {
    return extractReadableContent(html, url);
  } catch (err) {
    console.warn(
      `[preflight] readability failed url=${url} err=${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

async function safeSchema(html: string, url: string) {
  try {
    return validateSchema(html, url);
  } catch (err) {
    console.warn(
      `[preflight] schema validation failed url=${url} err=${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

async function safeCrawlability(url: string, homepageHtml: string) {
  try {
    return await auditCrawlability({ url, homepageHtml });
  } catch (err) {
    console.warn(
      `[preflight] crawlability audit failed url=${url} err=${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}

async function safeEntityConsistency(url: string, html: string) {
  try {
    return checkEntityConsistency({ url, html });
  } catch (err) {
    console.warn(
      `[preflight] entity consistency failed url=${url} err=${err instanceof Error ? err.message : "unknown"}`,
    );
    return null;
  }
}
