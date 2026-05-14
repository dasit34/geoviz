/**
 * V2 Stage 2 — "Obscura" render provider.
 *
 * NOTE on the name: the project-internal naming convention is
 * "Obscura" for the render layer. There is no `obscura` npm package
 * that does headless rendering — the public registry only has a
 * 203-byte placeholder squat under that name. This file's real
 * implementation runs on `puppeteer-core` + `@sparticuz/chromium`,
 * both of which are already in `package.json` (see line 28 and 31 of
 * the project root `package.json`). The name is kept consistent with
 * the rest of the codebase but the underlying engine is Chromium.
 *
 * Behavior:
 *   • Lazy-loads puppeteer + chromium on first use. Imports happen
 *     inside `render()` so a Next.js bundle that doesn't actually
 *     call this provider never pays the require cost — important
 *     because the chromium binary is large.
 *   • Hard timeout via `Promise.race`. Even if puppeteer's own
 *     `timeout:` option misbehaves, the outer race kills the wait.
 *   • Returns structured output (`RenderOutput`) the orchestrator can
 *     map to DB columns.
 *
 * Concurrency: this provider opens and closes a fresh Chromium
 * instance per render. That's fine for the current single-flight
 * worker (one audit at a time) but would need pooling if Stage 6
 * introduces concurrent rendering.
 *
 * NEVER throws on rendering business — always rethrows so the
 * orchestrator's try/catch can record `renderFailureReason`.
 */

import type { RenderInput, RenderOutput, RenderProvider } from "./renderProvider";

/** Puppeteer + Chromium version baked into the engine identifier. */
const ENGINE_VERSION = "puppeteer-core/24.42.0+sparticuz-chromium/148.0.0";

/**
 * Static version from the dependency manifest — not a runtime probe.
 * If those package versions drift, update this constant in the same
 * PR. Keeping it static avoids a runtime `require("…/package.json")`
 * dance during bundling.
 */
export const OBSCURA_ENGINE_VERSION = ENGINE_VERSION;

export class ObscuraRenderProvider implements RenderProvider {
  readonly engineVersion = ENGINE_VERSION;

  async render(input: RenderInput): Promise<RenderOutput> {
    const t0 = Date.now();

    // Lazy-load to avoid require cost when render is disabled.
    // `puppeteer-core` is small but `@sparticuz/chromium` pulls a
    // ~50MB binary on the Lambda/Railway path.
    const [puppeteer, chromium] = await Promise.all([
      import("puppeteer-core"),
      import("@sparticuz/chromium").then((m) => m.default),
    ]);

    // `@sparticuz/chromium` v148+ removed `defaultViewport`; we let
    // puppeteer use its default. `executablePath()` is async and
    // resolves to the unpacked binary location.
    const browser = await puppeteer.default.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    try {
      const page = await browser.newPage();

      // Cap nav + total work via `Promise.race`. Puppeteer's own
      // `timeout` is respected too, but the race is the canonical
      // upper bound.
      const navP = page.goto(input.url, {
        waitUntil: "networkidle2",
        timeout: input.timeoutMs,
      });
      const raceTimer = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `render_timeout: exceeded ${input.timeoutMs}ms during page.goto`,
              ),
            ),
          input.timeoutMs,
        ),
      );
      await Promise.race([navP, raceTimer]);

      const html = await page.content();
      const text = await page.evaluate(() => document.body?.innerText ?? "");

      // Detect hydration markers + JSON-LD schema types from the
      // rendered DOM. Errors here should NOT fail the whole render —
      // we still want to record htmlLength / textLength.
      const { schemaTypes, hydrationDetected } = await page
        .evaluate(() => {
          const types = new Set<string>();
          const scripts = Array.from(
            document.querySelectorAll('script[type="application/ld+json"]'),
          );
          for (const s of scripts) {
            try {
              const parsed = JSON.parse(s.textContent || "{}");
              const collectType = (node: unknown): void => {
                if (!node || typeof node !== "object") return;
                const obj = node as Record<string, unknown>;
                const t = obj["@type"];
                if (typeof t === "string") types.add(t);
                else if (Array.isArray(t))
                  for (const ti of t)
                    if (typeof ti === "string") types.add(ti);
                if (Array.isArray(obj["@graph"])) {
                  for (const g of obj["@graph"]) collectType(g);
                }
              };
              if (Array.isArray(parsed)) for (const p of parsed) collectType(p);
              else collectType(parsed);
            } catch {
              /* skip malformed JSON-LD */
            }
          }
          // Hydration markers — covers Next.js, Nuxt, Apollo,
          // Vue/Vite, and a generic React SSR hint.
          const w = window as unknown as Record<string, unknown>;
          const hyd =
            Boolean((w["__NEXT_DATA__"] as unknown)) ||
            Boolean((w["__NUXT__"] as unknown)) ||
            Boolean((w["__APOLLO_STATE__"] as unknown)) ||
            document.querySelector("[data-reactroot]") !== null ||
            document.querySelector("[data-v-app]") !== null ||
            document.querySelector("#__next") !== null ||
            document.querySelector("#__nuxt") !== null;
          return { schemaTypes: Array.from(types), hydrationDetected: hyd };
        })
        .catch(() => ({ schemaTypes: [] as string[], hydrationDetected: false }));

      const renderDurationMs = Date.now() - t0;
      return {
        htmlLength: html.length,
        textLength: text.length,
        schemaTypes,
        hydrationDetected,
        renderDurationMs,
      };
    } finally {
      // Always close the browser. Don't `await` inside the catch path
      // because we want the original error to propagate immediately;
      // browser close is fire-and-forget here.
      void browser.close().catch(() => {
        /* ignore close errors */
      });
    }
  }
}

/**
 * Default singleton — the same instance is reused across renders so
 * the engine identifier is stable + memoizable. The provider itself
 * holds no in-memory state between calls (it spawns a fresh browser
 * each time), so the singleton is purely a convenience.
 */
export const obscuraProvider: RenderProvider = new ObscuraRenderProvider();
