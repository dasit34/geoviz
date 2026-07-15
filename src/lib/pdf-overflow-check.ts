import type { Page } from "puppeteer-core";

/**
 * Generic PDF overflow check — works for any report, any length, any
 * .rd-page section. Does not hardcode which page or which component
 * to look at; it walks whatever .rd-page sections exist at render
 * time and flags any whose content exceeds the printable-area budget.
 *
 * Why this runs on the live (pre-print-pagination) page rather than
 * inspecting the rendered PDF: page-break/break-inside CSS only takes
 * effect during actual print/PDF rendering, and — confirmed during
 * the GEO-65OJ80Z8 investigation — Chromium's pagination behavior for
 * a given overflow amount is not stable across even adjacent Chromium
 * versions (the production PDF silently clipped a ~20-28px overflow
 * with zero continuation pages; a newer local Chromium build instead
 * inserted real continuation pages for the same CSS). The live-DOM
 * content-height budget check below is standard box-model math and
 * is not subject to that instability, so it is the reliable signal —
 * it answers "will content extend past the printable area", which is
 * true regardless of how any particular Chromium build then chooses
 * to paginate (or not paginate) that overflow.
 */
export type OverflowViolation = {
  pageIndex: number;
  variant: string;
  selector: string;
  overflowPx: number;
  printableHeightPx: number;
  contentHeightPx: number;
};

// CSS reference px conversion — always 96px/inch, independent of any
// DPI later used to rasterize a PDF/screenshot. Matches the real
// @page rule in src/app/report/[id]/print/print.css
// (`@page { size: A4; margin: 18mm 16mm 18mm 16mm; }`), which is also
// what src/lib/generate-pdf.ts's `preferCSSPageSize: true` defers to.
const MM_TO_PX = 96 / 25.4;
const PAGE_HEIGHT_MM = 297;
const PAGE_MARGIN_TOP_MM = 18;
const PAGE_MARGIN_BOTTOM_MM = 18;

export const PRINTABLE_CONTENT_HEIGHT_PX =
  (PAGE_HEIGHT_MM - PAGE_MARGIN_TOP_MM - PAGE_MARGIN_BOTTOM_MM) * MM_TO_PX;

// Discovered empirically (GEO-65OJ80Z8 investigation, round 2): a
// live-DOM measurement of exactly 0px overflow is NOT a safe pass.
// Elements with `break-inside: avoid` (every .rd-* "card" — see the
// break-inside rule near the bottom of report-document.css) are moved
// WHOLE to the next physical page by the real print engine if they
// don't fit in the remaining space, even when this tool's live-DOM
// getBoundingClientRect() math says they land a fraction of a px
// under budget. That's because the live DOM never actually paginates
// (see assertNoPdfOverflow's own doc comment below), so this budget
// comparison can't see the same sub-pixel/DPI rounding page.pdf()'s
// real rasterization applies. Confirmed by generating an actual PDF
// for a page this tool scored as 0px overflow: the trailing card
// (interp / cta-card) was pushed to its own near-blank continuation
// page anyway. A real margin — not a razor's edge — is required for
// "0 violations" to mean what it says.
export const PAGINATION_SAFETY_MARGIN_PX = 24;

// Built as a plain JS string (not a TS closure passed directly to
// page.evaluate) on purpose: some bundlers/transpilers (confirmed with
// tsx's esbuild pipeline) inject a `__name(fn, "fn")` helper-call
// wrapper around named functions, and Puppeteer's page.evaluate()
// only ships the function's own source text into the browser — not
// the surrounding module scope where that helper lives — which throws
// `__name is not defined` at call time. A raw string literal is never
// touched by a bundler's function-naming pass, so it evaluates
// cleanly in-page regardless of how this module itself was compiled.
function buildEvalSource(contentHeightPx: number): string {
  return `(function (contentHeightPx) {
    // Deliberately walks DESCENDANTS only (never the .rd-page root
    // itself): a page's own border-box bottom includes its trailing
    // bottom padding, which has no rendered content in it and is not
    // "a visible element extending beyond the printable page boundary"
    // — only real content elements count. Finds the single deepest
    // element whose own bottom edge is furthest past the budget.
    function findOffender(pageEl, pageTop, budget) {
      var best = null;
      var stack = Array.from(pageEl.children);
      while (stack.length) {
        var el = stack.pop();
        var r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        var bottomRel = r.bottom - pageTop;
        if (bottomRel > budget && (!best || bottomRel > best.bottom)) {
          best = { el: el, bottom: bottomRel };
        }
        for (var c = 0; c < el.children.length; c++) stack.push(el.children[c]);
      }
      return best;
    }
    function selectorOf(el) {
      var cls = Array.from(el.classList).join(".");
      return cls ? el.tagName.toLowerCase() + "." + cls : el.tagName.toLowerCase();
    }
    var pages = Array.from(document.querySelectorAll(".rd-page"));
    return pages.map(function (pageEl, i) {
      var r = pageEl.getBoundingClientRect();
      var offender = findOffender(pageEl, r.top, contentHeightPx);
      var variantClass = Array.from(pageEl.classList).find(function (c) {
        return c.indexOf("rd-page-") === 0 && c !== "rd-page";
      });
      return {
        pageIndex: i,
        variant: variantClass ? variantClass.replace("rd-page-", "") : "unknown",
        overflowPx: offender ? offender.bottom - contentHeightPx : 0,
        contentHeightPx: offender ? offender.bottom : pageEl.scrollHeight,
        selector: offender ? selectorOf(offender.el) : null
      };
    });
  })(${contentHeightPx})`;
}

/**
 * Runs against a Puppeteer Page already navigated to a /report/[id]/print
 * URL with `emulateMediaType("print")` applied (same precondition as
 * src/lib/generate-pdf.ts's page.pdf() call). Returns one violation
 * per .rd-page whose content exceeds the printable-area budget — empty
 * array means every page fits.
 *
 * Checks against PRINTABLE_CONTENT_HEIGHT_PX minus
 * PAGINATION_SAFETY_MARGIN_PX, not the raw physical budget — see that
 * constant's comment for why a 0px-overflow live-DOM measurement isn't
 * actually a safe pass for break-inside:avoid content.
 */
export async function assertNoPdfOverflow(page: Page): Promise<OverflowViolation[]> {
  const budget = PRINTABLE_CONTENT_HEIGHT_PX - PAGINATION_SAFETY_MARGIN_PX;
  const raw = (await page.evaluate(buildEvalSource(budget))) as Array<{
    pageIndex: number;
    variant: string;
    overflowPx: number;
    contentHeightPx: number;
    selector: string | null;
  }>;

  return raw
    .filter((r): r is typeof r & { selector: string } => r.overflowPx > 0 && r.selector !== null)
    .map((r) => ({
      pageIndex: r.pageIndex,
      variant: r.variant,
      selector: r.selector,
      overflowPx: r.overflowPx,
      printableHeightPx: budget,
      contentHeightPx: r.contentHeightPx,
    }));
}
