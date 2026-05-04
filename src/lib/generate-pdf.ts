import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

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
  /** Public-ish base URL the headless browser will fetch (e.g. https://geoviz.app) */
  baseUrl: string;
  /** Admin secret threaded through the print page query param. */
  adminSecret: string;
  /** Hard timeout for the whole PDF generation in ms (default 60s). */
  timeoutMs?: number;
};

export async function generateAuditPdf(args: GeneratePdfArgs): Promise<Buffer> {
  const { orderId, baseUrl, adminSecret } = args;
  const timeoutMs = args.timeoutMs ?? 60_000;

  if (!adminSecret) {
    throw new Error(
      "ADMIN_SECRET not set — print-page auth requires it. Set ADMIN_SECRET in Vercel → Project → Variables.",
    );
  }

  const printUrl = `${baseUrl.replace(/\/$/, "")}/report/${encodeURIComponent(orderId)}/print?key=${encodeURIComponent(adminSecret)}`;

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ?? (await chromium.executablePath());

  console.log(
    `[generate-pdf] launching chromium executablePath=${executablePath ? "(set)" : "(none)"} url=${printUrl.replace(adminSecret, "<redacted>")}`,
  );

  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      defaultViewport: { width: 1240, height: 1754 },
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

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "16mm",
        bottom: "20mm",
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
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv;
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:3000";
  }
}
