/* eslint-disable no-console */
/**
 * V2 Stage 2 — Render intelligence orchestrator.
 *
 * Wraps the optional render pass with three guarantees:
 *   1. **Never blocks audit completion.** Render is gated by
 *      `GEO_RENDER_ENABLED` AND eligibility. Disabled / not-eligible /
 *      failed cases all return a well-typed `RenderIntelligenceResult`
 *      with sensible nulls; the caller persists what it gets.
 *   2. **Never throws.** Every external call (`fetch`, the provider's
 *      `render()`) is wrapped. The orchestrator returns the failure
 *      reason on the result object — the audit row still writes.
 *   3. **Single source of truth for log lifecycle.** Emits
 *      `[geo-render] eligibility` / `start` / `success` / `skipped` /
 *      `failed` lines the operator can grep on Railway.
 *
 * NOT consumed by scoring. NOT shown to customers. Pure
 * operator/calibration data.
 */

import {
  EMPTY_RENDER_RESULT,
  type RawFetcher,
  type RawPageSnapshot,
  type RenderIntelligenceResult,
  type RenderProvider,
} from "./renderProvider";
import { shouldRender, type EligibilityDecision } from "./renderEligibility";

/** Default timeout — 10s is enough for the homepage of most local-SMB sites. */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Content-delta threshold — when rendered text is >1.5× raw text, we
 * flag `contentDeltaDetected=true`. Tuned conservatively; Stage 5 can
 * refine once we have enough samples to compute a real distribution.
 */
const CONTENT_DELTA_RATIO = 1.5;

/** Read GEO_RENDER_ENABLED at call time so tests can mutate env. */
function isRenderEnabled(): boolean {
  return process.env.GEO_RENDER_ENABLED === "true";
}

function readTimeoutMs(): number {
  const fromEnv = Number(process.env.GEO_RENDER_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(Math.max(Math.floor(fromEnv), 1_000), 60_000);
  }
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Run the render intelligence pass. Returns a result that's safe to
 * spread into a Prisma `update()` payload — every field is well-typed
 * and nullable.
 *
 * Caller responsibilities:
 *   • Persist the returned fields via a separate update() AFTER the
 *     main `AuditIntelligence` upsert. We do not perform DB writes
 *     here — that keeps this module pure and unit-testable.
 *   • Pass the `orderId` so the lifecycle log lines are greppable.
 */
export async function runRenderIntelligence(args: {
  orderId?: string;
  url: string;
  /** From Stage 1 — feeds the eligibility heuristic. */
  frameworkDetected: string | null;
  /** From Stage 1 — feeds the eligibility heuristic. */
  contentDensity: number | null;
  /** Operator force flag — overrides signal-based eligibility. */
  operatorForce?: boolean;
  /** Override env defaults (used by tests). */
  envOverrides?: {
    enabled?: boolean;
    timeoutMs?: number;
  };
  /** Pluggable headless provider. */
  provider: RenderProvider;
  /**
   * Pluggable raw-HTML fetcher. Tests mock this. The default
   * implementation (`createDefaultRawFetcher`) is exported below so
   * the worker call site can use it without wiring all the way up.
   */
  rawFetcher: RawFetcher;
}): Promise<RenderIntelligenceResult> {
  const orderCtx = args.orderId ? ` orderId=${args.orderId}` : "";
  const url = args.url;

  // ── Gate 1: env flag ────────────────────────────────────────────
  const envEnabled =
    args.envOverrides?.enabled !== undefined
      ? args.envOverrides.enabled
      : isRenderEnabled();
  if (!envEnabled && args.operatorForce !== true) {
    console.log(`[geo-render] skipped${orderCtx} reason=env_disabled url=${url}`);
    return { ...EMPTY_RENDER_RESULT };
  }

  const timeoutMs =
    args.envOverrides?.timeoutMs !== undefined
      ? args.envOverrides.timeoutMs
      : readTimeoutMs();

  // ── Step 1: raw-page snapshot for delta comparison ──────────────
  // Best-effort. If the raw fetch fails we still try render — the
  // delta fields just stay null.
  let rawSnapshot: RawPageSnapshot | null = null;
  try {
    rawSnapshot = await args.rawFetcher.fetch(url, timeoutMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[geo-render] raw fetch failed${orderCtx} url=${url} reason=${msg}`);
    rawSnapshot = null;
  }

  // ── Gate 2: eligibility (signal-driven) ─────────────────────────
  const decision: EligibilityDecision = shouldRender({
    frameworkDetected: args.frameworkDetected,
    contentDensity: args.contentDensity,
    rawSnapshot,
    operatorForce: args.operatorForce,
  });
  console.log(
    `[geo-render] eligibility${orderCtx} eligible=${decision.eligible} reason=${decision.reason} signals=${decision.signals.join("|") || "-"}`,
  );
  if (!decision.eligible) {
    console.log(`[geo-render] skipped${orderCtx} reason=${decision.reason}`);
    return {
      ...EMPTY_RENDER_RESULT,
      // Preserve the raw snapshot fields even on skip — they're cheap
      // and analysts may want them.
      rawTextLength: rawSnapshot?.textLength ?? null,
      rawSchemaTypes: rawSnapshot?.schemaTypes ?? null,
    };
  }

  // ── Step 2: run render ──────────────────────────────────────────
  console.log(
    `[geo-render] start${orderCtx} url=${url} timeoutMs=${timeoutMs} engine=${args.provider.engineVersion}`,
  );
  let renderOutput;
  try {
    renderOutput = await args.provider.render({ url, timeoutMs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[geo-render] failed${orderCtx} reason=${msg} url=${url}`,
    );
    return {
      ...EMPTY_RENDER_RESULT,
      renderAttempted: true,
      renderSuccessful: false,
      renderEngineVersion: args.provider.engineVersion,
      renderFailureReason: msg.slice(0, 500),
      rawTextLength: rawSnapshot?.textLength ?? null,
      rawSchemaTypes: rawSnapshot?.schemaTypes ?? null,
    };
  }

  // ── Step 3: compute deltas + confidence ─────────────────────────
  const rawTextLength = rawSnapshot?.textLength ?? null;
  const rawSchemaTypes = rawSnapshot?.schemaTypes ?? null;

  let contentDeltaDetected: boolean | null = null;
  let clientOnlyContentDetected: boolean | null = null;
  let blankShellRisk: boolean | null = null;
  if (rawTextLength !== null) {
    if (rawTextLength === 0) {
      contentDeltaDetected = renderOutput.textLength > 0;
      clientOnlyContentDetected = renderOutput.textLength > 200;
      blankShellRisk = renderOutput.textLength > 200;
    } else {
      const ratio = renderOutput.textLength / rawTextLength;
      contentDeltaDetected = ratio > CONTENT_DELTA_RATIO;
      clientOnlyContentDetected = ratio > 3;
      blankShellRisk = rawTextLength < 800 && renderOutput.textLength > 1500;
    }
  }

  let schemaDeltaDetected: boolean | null = null;
  if (rawSchemaTypes !== null) {
    // True when rendered has at least one type the raw did not.
    const rawSet = new Set(rawSchemaTypes);
    schemaDeltaDetected = renderOutput.schemaTypes.some((t) => !rawSet.has(t));
  }

  // Confidence is a coarse heuristic — high when render produced
  // meaningful new content AND schema, medium when one of the two,
  // low when render output is sparse despite eligibility match.
  let renderConfidence: "low" | "medium" | "high" = "low";
  const meaningfulText = renderOutput.textLength >= 1500;
  const meaningfulSchema = renderOutput.schemaTypes.length > 0;
  if (meaningfulText && meaningfulSchema) renderConfidence = "high";
  else if (meaningfulText || meaningfulSchema) renderConfidence = "medium";

  console.log(
    `[geo-render] success${orderCtx} url=${url} durationMs=${renderOutput.renderDurationMs} htmlLen=${renderOutput.htmlLength} textLen=${renderOutput.textLength} schemaTypes=${renderOutput.schemaTypes.length} hydration=${renderOutput.hydrationDetected} contentDelta=${contentDeltaDetected ?? "-"} schemaDelta=${schemaDeltaDetected ?? "-"} confidence=${renderConfidence}`,
  );

  return {
    renderAttempted: true,
    renderSuccessful: true,
    renderEngineVersion: args.provider.engineVersion,
    renderFailureReason: null,
    renderDurationMs: renderOutput.renderDurationMs,
    renderedHtmlLength: renderOutput.htmlLength,
    renderedTextLength: renderOutput.textLength,
    renderedSchemaTypes: renderOutput.schemaTypes,
    hydrationDetected: renderOutput.hydrationDetected,
    blankShellRisk,
    clientOnlyContentDetected,
    renderConfidence,
    rawTextLength,
    rawSchemaTypes,
    schemaDeltaDetected,
    contentDeltaDetected,
  };
}

/**
 * Real raw-HTML fetcher using Node `fetch` (Node 18+) + cheerio.
 * Strips scripts/styles before measuring text length so the
 * comparison against rendered text is apples-to-apples.
 *
 * Exported for the worker call-site. Tests should NOT use this — they
 * inject a mock so they don't hit the network.
 */
export function createDefaultRawFetcher(): RawFetcher {
  return {
    async fetch(url: string, timeoutMs: number): Promise<RawPageSnapshot> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          redirect: "follow",
          headers: {
            // Identify as a real-looking browser so paranoid origins
            // don't serve us a bot-shaped fallback. Generic UA — not
            // pretending to be a specific Chrome version.
            "User-Agent":
              "Mozilla/5.0 (compatible; GeoVizRenderProbe/1.0; +https://geoviz.ai)",
            Accept: "text/html,application/xhtml+xml",
          },
        });
        const html = await res.text();
        return parseRawSnapshot(html);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Parse a raw HTML body into a `RawPageSnapshot`. Pure function;
 * exported so tests can call it with canned HTML strings.
 */
export function parseRawSnapshot(html: string): RawPageSnapshot {
  // Lazy-import cheerio to keep the renderProvider tree-shakeable on
  // bundles that don't use rendering.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require("cheerio") as typeof import("cheerio");
  const $ = cheerio.load(html);

  // Strip scripts + styles before measuring text.
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  const textLength = text.length;

  // Extract JSON-LD schema types from <script type="application/ld+json">.
  const schemaTypes = new Set<string>();
  cheerio.load(html)('script[type="application/ld+json"]').each((_, el) => {
    const content = cheerio.load(html)(el).contents().text();
    try {
      const parsed = JSON.parse(content || "{}");
      const collectType = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        const obj = node as Record<string, unknown>;
        const t = obj["@type"];
        if (typeof t === "string") schemaTypes.add(t);
        else if (Array.isArray(t))
          for (const ti of t) if (typeof ti === "string") schemaTypes.add(ti);
        const graph = obj["@graph"];
        if (Array.isArray(graph)) {
          for (const g of graph) collectType(g);
        }
      };
      if (Array.isArray(parsed)) for (const p of parsed) collectType(p);
      else collectType(parsed);
    } catch {
      /* skip malformed JSON-LD */
    }
  });

  // Shell heuristic: body has very little text AND there's a #root or
  // #app / #__next mount point — almost certainly an SPA shell.
  const hasMount =
    $("#root").length > 0 ||
    $("#app").length > 0 ||
    $("#__next").length > 0 ||
    $("#__nuxt").length > 0;
  const looksLikeShell = textLength < 400 && hasMount;

  return {
    textLength,
    schemaTypes: Array.from(schemaTypes),
    looksLikeShell,
  };
}
