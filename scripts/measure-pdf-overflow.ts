/* eslint-disable no-console */
/**
 * scripts/measure-pdf-overflow.ts
 *
 * Pixel-level PDF clipping investigation harness. Drives a real headless
 * Chromium over the real /report/[id]/print route (same route
 * src/lib/generate-pdf.ts fetches for the production PDF) and measures,
 * for every .rd-page, whether its rendered content height exceeds the
 * physical printable-area budget derived from the real @page CSS rule
 * (print.css: `@page { size: A4; margin: 18mm 16mm 18mm 16mm; }`).
 *
 * Methodology: a live (non-printed) page never paginates — page-break-*
 * CSS only takes effect during actual print/PDF rendering, so a
 * live page with `print` media emulated renders all .rd-page sections
 * as one continuous scroll. Each .rd-page is *designed* to be exactly
 * one physical page (forced via `break-before: page` on every
 * .rd-page), so its own rendered height can be compared directly
 * against the one-page content budget without needing to reconstruct
 * physical page boundaries across the whole document.
 *
 * The content budget (src/lib/pdf-overflow-check.ts's
 * PRINTABLE_CONTENT_HEIGHT_PX — this script imports it, so the two
 * never drift) is computed in CSS reference pixels (1px = 1/96in,
 * DPI-independent) — 261mm (297mm page − 18mm top − 18mm bottom) ≈
 * 986.46px. The live viewport is set to match generate-pdf.ts's exact
 * `defaultViewport: { width: 820, height: 1160 }` — verified
 * empirically: an earlier version of this script used the 178mm
 * printable-content-width (~673px) on the theory that Chromium
 * reflows print text to that narrower box, but that produced
 * "overflow" on pages that the real production PDF renders cleanly,
 * so print layout width tracks the page's viewport, not the @page
 * printable width.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 npx tsx scripts/measure-pdf-overflow.ts <orderId> <label>
 *
 * Outputs tmp/pdf-overflow/<orderId>-<label>.json (measurements) and
 * tmp/pdf-overflow/<orderId>-<label>.pdf (real PDF via the exact same
 * page.pdf() options as src/lib/generate-pdf.ts, for direct pdftoppm
 * cross-checking).
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

import {
  PRINTABLE_CONTENT_HEIGHT_PX,
  PAGINATION_SAFETY_MARGIN_PX,
} from "../src/lib/pdf-overflow-check";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const [orderId, label = "run"] = process.argv.slice(2);
if (!orderId) {
  console.error("Usage: measure-pdf-overflow.ts <orderId> [label]");
  process.exit(1);
}

const OUT_DIR = join(process.cwd(), "tmp", "pdf-overflow");
// Same safety-margined budget as assertNoPdfOverflow (the real
// checker) — this diagnostic script exists to match, not diverge
// from, what generate-pdf.ts and the admin overflow-check route
// actually enforce. See PAGINATION_SAFETY_MARGIN_PX's comment.
const CONTENT_HEIGHT_PX = PRINTABLE_CONTENT_HEIGHT_PX - PAGINATION_SAFETY_MARGIN_PX;

function resolveChrome(): string {
  if (
    process.env.PUPPETEER_EXECUTABLE_PATH &&
    existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)
  ) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  // `npx @puppeteer/browsers install` in this repo's cwd lands here.
  const repoLocal = join(process.cwd(), "chrome");
  if (existsSync(repoLocal)) {
    for (const dir of readdirSync(repoLocal)) {
      for (const sub of ["chrome-mac-arm64", "chrome-mac-x64"]) {
        const candidate = join(
          repoLocal,
          dir,
          sub,
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        );
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  const cacheRoot = join(homedir(), ".cache", "puppeteer", "chrome");
  if (existsSync(cacheRoot)) {
    for (const dir of readdirSync(cacheRoot)) {
      for (const sub of ["chrome-mac-arm64", "chrome-mac-x64"]) {
        const candidate = join(
          cacheRoot,
          dir,
          sub,
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        );
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  const system = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(system)) return system;
  throw new Error(
    "No Chrome binary found. Run `npx @puppeteer/browsers install chrome@stable`.",
  );
}

type ElementSnapshot = {
  selector: string;
  tag: string;
  top: number;
  bottom: number;
  height: number;
  overflow: string;
  overflowY: string;
  borderRadius: string;
  minHeight: string;
  maxHeight: string;
  height_css: string;
  transform: string;
  boxSizing: string;
  breakInside: string;
};

type PageMeasurement = {
  pageIndex: number;
  variant: string;
  scrollHeight: number;
  clientHeight: number;
  offsetHeight: number;
  boundingHeight: number;
  paddingTop: string;
  paddingBottom: string;
  overflowPx: number;
  offendingElement: ElementSnapshot | null;
  ancestorChainOfOffender: ElementSnapshot[];
};

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const executablePath = resolveChrome();
  console.log(`[measure] chrome=${executablePath}`);
  console.log(`[measure] base=${BASE_URL} orderId=${orderId} label=${label}`);
  console.log(
    `[measure] CONTENT_HEIGHT_PX(261mm)=${CONTENT_HEIGHT_PX.toFixed(2)}`,
  );

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    // Match src/lib/generate-pdf.ts's exact defaultViewport. Verified
    // empirically: an earlier version of this script used the 178mm
    // printable-content-width (672px) on the theory that Chromium
    // reflows text to that narrower box for print — but that produced
    // "overflow" on pages 3/4, which the real production PDF renders
    // cleanly with visible bottom margin. So print layout width tracks
    // the page's viewport (820px), not the @page printable width;
    // @page/margin only govern vertical pagination + physical inset.
    // Height is arbitrary — a live page never paginates (break-* CSS
    // only applies during actual print/PDF rendering), so we just need
    // room to render the full continuous document without our own
    // viewport clipping it.
    await page.setViewport({
      width: 820,
      height: 4000,
      deviceScaleFactor: 1,
    });
    await page.emulateMediaType("print");

    const url = `${BASE_URL}/report/${orderId}/print`;
    console.log(`[measure] GET ${url}`);
    const resp = await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 60_000,
    });
    console.log(`[measure] status=${resp?.status() ?? 0}`);

    await page.evaluateHandle("document.fonts.ready");
    await new Promise((r) => setTimeout(r, 300));

    // Built and passed as a plain JS string (not a TS closure) on
    // purpose: tsx/esbuild injects a `__name(fn, "fn")` helper-call
    // wrapper around named functions when bundling this file, and
    // Puppeteer's page.evaluate() only ships the function's own
    // source text into the browser — not the surrounding module scope
    // where that helper lives — which throws `__name is not defined`
    // at call time. A raw string literal is never touched by the
    // bundler's function-naming pass, so it evaluates cleanly in-page.
    const evalSrc = `(function (contentHeightPx) {
      function selectorOf(el) {
        var cls = Array.from(el.classList).join(".");
        return cls ? el.tagName.toLowerCase() + "." + cls : el.tagName.toLowerCase();
      }
      function snapshot(el, pageTop) {
        var r = el.getBoundingClientRect();
        var cs = getComputedStyle(el);
        return {
          selector: selectorOf(el),
          tag: el.tagName.toLowerCase(),
          top: r.top - pageTop,
          bottom: r.bottom - pageTop,
          height: r.height,
          overflow: cs.overflow,
          overflowY: cs.overflowY,
          borderRadius: cs.borderRadius,
          minHeight: cs.minHeight,
          maxHeight: cs.maxHeight,
          height_css: cs.height,
          transform: cs.transform,
          boxSizing: cs.boxSizing,
          breakInside: cs.breakInside || ""
        };
      }
      // Descend only into children that themselves already cross the
      // budget, always keeping the deepest such element found — this
      // finds the smallest/most specific box responsible, not just the
      // top-level .rd-page container (whose own bottom trivially
      // exceeds budget any time ANY descendant does, since block
      // containers grow to fit their in-flow children).
      function findOffender(root, pageTop, budget) {
        var current = root;
        while (true) {
          var children = Array.from(current.children).filter(function (c) {
            var r = c.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) return false;
            return (r.bottom - pageTop) > budget;
          });
          if (children.length === 0) break;
          children.sort(function (a, b) {
            return b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom;
          });
          current = children[0];
        }
        return current;
      }
      var pages = Array.from(document.querySelectorAll(".rd-page"));
      return pages.map(function (pageEl, i) {
        var r = pageEl.getBoundingClientRect();
        var cs = getComputedStyle(pageEl);
        var overflowPx = Math.max(0, pageEl.scrollHeight - contentHeightPx);
        var offenderNode = overflowPx > 0 ? findOffender(pageEl, r.top, contentHeightPx) : null;
        var offender = offenderNode ? snapshot(offenderNode, r.top) : null;
        var ancestorChain = [];
        if (offenderNode) {
          var cur = offenderNode;
          while (cur && cur !== pageEl.parentElement) {
            ancestorChain.push(snapshot(cur, r.top));
            cur = cur.parentElement;
          }
        }
        var variantClass = Array.from(pageEl.classList).find(function (c) {
          return c.indexOf("rd-page-") === 0 && c !== "rd-page";
        });
        // Full top-level waterfall: every direct child's own bottom
        // relative to page top, in DOM order, so the exact point where
        // the budget is first crossed is visible block-by-block (the
        // "offendingElement" above is the single deepest/worst-case
        // leaf, which may be a later, more-overflowing block than the
        // first one to actually cross the line).
        var topLevelChildren = Array.from(pageEl.children).map(function (c) {
          return snapshot(c, r.top);
        });
        return {
          pageIndex: i,
          variant: variantClass ? variantClass.replace("rd-page-", "") : "unknown",
          scrollHeight: pageEl.scrollHeight,
          clientHeight: pageEl.clientHeight,
          offsetHeight: pageEl.offsetHeight,
          boundingHeight: r.height,
          paddingTop: cs.paddingTop,
          paddingBottom: cs.paddingBottom,
          overflowPx: overflowPx,
          offendingElement: offender,
          ancestorChainOfOffender: ancestorChain,
          topLevelChildren: topLevelChildren
        };
      });
    })(${CONTENT_HEIGHT_PX})`;

    const measurements = (await page.evaluate(evalSrc)) as PageMeasurement[];

    for (const m of measurements) {
      const flag = m.overflowPx > 0 ? "OVERFLOW" : "ok";
      console.log(
        `[measure] page ${m.pageIndex + 1} (${m.variant}) scrollHeight=${m.scrollHeight.toFixed(1)}px budget=${CONTENT_HEIGHT_PX.toFixed(1)}px overflow=${m.overflowPx.toFixed(1)}px [${flag}]`,
      );
      if (m.offendingElement) {
        console.log(
          `[measure]   offender=${m.offendingElement.selector} bottom=${m.offendingElement.bottom.toFixed(1)}px overflow-of-element=${(m.offendingElement.bottom - CONTENT_HEIGHT_PX).toFixed(1)}px overflow=${m.offendingElement.overflow} borderRadius=${m.offendingElement.borderRadius}`,
        );
      }
    }

    const pdfPath = join(OUT_DIR, `${orderId}-${label}.pdf`);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
      preferCSSPageSize: true,
    });
    writeFileSync(pdfPath, pdf);
    console.log(`[measure] saved PDF ${pdfPath} bytes=${pdf.length}`);

    const jsonPath = join(OUT_DIR, `${orderId}-${label}.json`);
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          orderId,
          label,
          contentHeightPx: CONTENT_HEIGHT_PX,
          measurements,
        },
        null,
        2,
      ),
    );
    console.log(`[measure] saved ${jsonPath}`);

    await page.close();
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[measure] FAILED:", err);
  process.exit(1);
});
