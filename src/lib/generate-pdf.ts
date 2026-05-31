import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { resolveAppBaseUrl } from "@/lib/app-url";

/**
 * Generate a PDF for a given audit order by driving a headless Chromium
 * over the print-only route at /report/[id]/print.
 *
 * Two callers:
 *   1. GET /api/report/[id]/pdf — admin "Download PDF" button
 *   2. POST /api/admin/orders/[id]/send-report — Resend attachment
 *
 * Strategy:
 *   - On Vercel/Linux serverless: use @sparticuz/chromium's bundled
 *     Chromium binary + puppeteer-core.
 *   - Locally on macOS: env PUPPETEER_EXECUTABLE_PATH overrides to a
 *     locally-installed Chrome (e.g. /Applications/Google Chrome.app
 *     /Contents/MacOS/Google Chrome). Without it, falls back to
 *     @sparticuz/chromium too — but that binary is Linux-only and will
 *     fail on macOS. Set the env var when developing locally.
 */
export type GeneratePdfArgs = {
  orderId: string;
  /** Public-ish base URL the headless browser will fetch (e.g. https://geoviz.ai) */
  baseUrl: string;
  /** Hard timeout for the whole PDF generation in ms (default 60s). */
  timeoutMs?: number;
};

export async function generateAuditPdf(args: GeneratePdfArgs): Promise<Buffer> {
  const { orderId, baseUrl } = args;
  const timeoutMs = args.timeoutMs ?? 60_000;

  // Print page is publicly accessible — order ID is the access token.
  const printUrl = `${baseUrl.replace(/\/$/, "")}/report/${encodeURIComponent(orderId)}/print`;

  // Resolve the chromium binary. On Vercel @sparticuz/chromium ships
  // its own packed binary inside node_modules; calling executablePath()
  // unpacks it to /tmp on first run. Locally on macOS we override with
  // PUPPETEER_EXECUTABLE_PATH (the @sparticuz binary is Linux-only).
  let executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    (await chromium.executablePath());
  if (!executablePath) {
    // Last-ditch fallback for environments where the bundle path
    // resolution returns null (rare — usually means the package wasn't
    // marked external and got relocated by the bundler).
    executablePath = "/tmp/chromium";
  }

  console.log(
    `[generate-pdf] launching chromium executablePath=${executablePath} url=${printUrl}`,
  );

  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      // Viewport sized to A4 at ~96dpi (210mm × 297mm ≈ 794 × 1123 px)
      // with a 26px overscan so the layout viewport closely matches the
      // physical page. Smaller viewport = less scale-down at print time
      // = the centered max-width:720px column lands centered in the PDF
      // instead of drifting after Chromium scales 1240px → A4.
      defaultViewport: { width: 820, height: 1160 },
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);

    await page.emulateMediaType("print");
    await page.goto(printUrl, {
      waitUntil: "networkidle0",
      timeout: timeoutMs,
    });

    // Post-render URL truncation check. The PDF rendering pipeline
    // has historically sheared the protocol prefix off long URLs
    // ("https://" → "ttps://") when print.css used a non-standard
    // word-break value. The print.css fix routes the break through
    // overflow-wrap: anywhere instead, but we keep a soft check in
    // place so any future regression surfaces in the logs without
    // blocking customer delivery.
    try {
      const renderedHtml = await page.content();
      const truncationPatterns = [
        /(?<![\w-])ttps:\/\//, // "ttps://" — missing leading "h"
        /(?<![\w-])ttp:\/\//, // "ttp://"  — missing leading "h"
      ];
      const hits = truncationPatterns
        .map((re) => re.exec(renderedHtml)?.[0])
        .filter((m): m is string => Boolean(m));
      if (hits.length > 0) {
        console.warn(
          `[generate-pdf] orderId=${orderId} URL_TRUNCATION_DETECTED hits=${JSON.stringify(
            hits,
          )} — soft warning; PDF still rendered. Check print.css URL hardening rules.`,
        );
      }
    } catch (checkErr) {
      // Soft check — never let it block the PDF emission.
      console.warn(
        `[generate-pdf] orderId=${orderId} url-truncation-check failed: ${
          checkErr instanceof Error ? checkErr.message : String(checkErr)
        }`,
      );
    }

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      // Margins kept in sync with the CSS @page rule (print.css).
      // preferCSSPageSize: true means the CSS wins when both are
      // present — these values are the JS-side fallback for
      // environments where preferCSSPageSize is ignored.
      margin: {
        top: "18mm",
        bottom: "18mm",
        left: "16mm",
        right: "16mm",
      },
      preferCSSPageSize: true,
    });

    console.log(
      `[generate-pdf] orderId=${orderId} bytes=${pdf.length}`,
    );

    return Buffer.from(pdf);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}

export function buildPdfBaseUrl(req: Request): string {
  // Delegates to the shared resolver so PDF + email surfaces share
  // one URL-resolution policy (incl. the production-domain fallback
  // that prevents preview-style `*.vercel.app` URLs from leaking).
  return resolveAppBaseUrl(req);
}
