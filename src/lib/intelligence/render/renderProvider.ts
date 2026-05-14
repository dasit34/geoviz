/**
 * V2 Stage 2 — Render provider interface.
 *
 * Abstracts the headless-browser implementation behind a small contract
 * so the orchestrator (`renderIntelligence.ts`) is provider-agnostic.
 * The default in-tree implementation is `obscuraProvider.ts` (which
 * uses `puppeteer-core` + `@sparticuz/chromium` — the only real
 * rendering toolchain in the repo). Tests inject a mock provider via
 * the `provider` argument to `runRenderIntelligence`.
 *
 * Contract:
 *   • `render(input)` MUST resolve within `input.timeoutMs` or reject.
 *   • `render(input)` MAY throw — the orchestrator catches and stores
 *     `renderFailureReason`.
 *   • `engineVersion` is a static identifier (e.g. "puppeteer-core/24.42.0+chromium/148")
 *     persisted to `AuditIntelligence.renderEngineVersion` so analysts
 *     can compare results across engine upgrades.
 *
 * NOT a customer-facing API. Operator/admin/calibration only.
 */

/** Input to a render request. */
export type RenderInput = {
  url: string;
  /** Hard timeout in ms. Provider MUST honor this. */
  timeoutMs: number;
};

/**
 * Output of a successful render. Field shape matches the structured
 * subset of `AuditIntelligence` render columns so the orchestrator can
 * map 1:1 without coordinate guessing.
 */
export type RenderOutput = {
  /** Length of the post-render serialized HTML in bytes. */
  htmlLength: number;
  /** Length of the post-render visible text in bytes. */
  textLength: number;
  /** schema.org @type values found inside JSON-LD script blocks. */
  schemaTypes: string[];
  /**
   * True when the rendered DOM contains known SPA hydration markers
   * (`__NEXT_DATA__`, `window.__NUXT__`, `window.__APOLLO_STATE__`,
   * Vue hydration attributes, etc.).
   */
  hydrationDetected: boolean;
  /** Wall-clock ms from request start → render complete. */
  renderDurationMs: number;
};

/** A pluggable headless-render implementation. */
export interface RenderProvider {
  /**
   * Static identifier persisted to `renderEngineVersion`. Format is
   * provider-defined; convention is "engine/version" or
   * "engine/version+companion/version" for multi-package providers.
   */
  readonly engineVersion: string;

  /** Perform the render. */
  render(input: RenderInput): Promise<RenderOutput>;
}

/**
 * The shape returned by the orchestrator and persisted to
 * `AuditIntelligence`. Every field is null-safe — render skipped,
 * failed, or disabled paths all return a well-typed object with
 * sensible nulls.
 */
export type RenderIntelligenceResult = {
  // ─── Lifecycle flags ──────────────────────────────────────────
  renderAttempted: boolean | null;
  renderSuccessful: boolean | null;
  renderEngineVersion: string | null;
  renderFailureReason: string | null;

  // ─── Render output ────────────────────────────────────────────
  renderDurationMs: number | null;
  renderedHtmlLength: number | null;
  renderedTextLength: number | null;
  renderedSchemaTypes: string[] | null;
  hydrationDetected: boolean | null;
  blankShellRisk: boolean | null;
  clientOnlyContentDetected: boolean | null;
  renderConfidence: "low" | "medium" | "high" | null;

  // ─── Raw-vs-rendered comparison ───────────────────────────────
  rawTextLength: number | null;
  rawSchemaTypes: string[] | null;
  schemaDeltaDetected: boolean | null;
  contentDeltaDetected: boolean | null;
};

/** Empty/no-op result. Returned when render is skipped entirely. */
export const EMPTY_RENDER_RESULT: RenderIntelligenceResult = {
  renderAttempted: null,
  renderSuccessful: null,
  renderEngineVersion: null,
  renderFailureReason: null,
  renderDurationMs: null,
  renderedHtmlLength: null,
  renderedTextLength: null,
  renderedSchemaTypes: null,
  hydrationDetected: null,
  blankShellRisk: null,
  clientOnlyContentDetected: null,
  renderConfidence: null,
  rawTextLength: null,
  rawSchemaTypes: null,
  schemaDeltaDetected: null,
  contentDeltaDetected: null,
};

/**
 * Raw-page snapshot taken without a browser (Node `fetch` + cheerio).
 * Captured pre-render so we can compute `rawTextLength`,
 * `rawSchemaTypes`, and the delta booleans without re-fetching.
 *
 * Exported here (not in the orchestrator) so the same shape is reused
 * by tests + real fetchers.
 */
export type RawPageSnapshot = {
  textLength: number;
  schemaTypes: string[];
  /** True when the raw HTML body looks like a near-empty SPA shell. */
  looksLikeShell: boolean;
};

/** A pluggable raw-HTML fetcher. Tests inject a mock that returns canned snapshots. */
export interface RawFetcher {
  fetch(url: string, timeoutMs: number): Promise<RawPageSnapshot>;
}
