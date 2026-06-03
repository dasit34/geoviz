/* eslint-disable no-console */
/**
 * scripts/render-report-fixture.ts
 *
 * Phase 6 visual-validation harness. Drives a headless Chromium over
 * the running Next dev server and captures full-page screenshots of
 * the public sample reports — the SAME `<AuditReportContent />` tree
 * the customer PDF and admin preview render. Read-only: it only issues
 * GETs against public, non-customer sample routes.
 *
 * It captures BOTH media types per route:
 *   - screen  → what the customer sees in the browser report viewer
 *   - print   → what Puppeteer rasterizes into the delivered PDF
 *               (page.emulateMediaType('print') applies print.css)
 *
 * Usage:
 *   BASE_URL=http://localhost:3939 LABEL=after \
 *     npx tsx scripts/render-report-fixture.ts geoviz ohio-roofing-siding
 *
 * Chrome resolution order:
 *   1. PUPPETEER_EXECUTABLE_PATH
 *   2. a binary installed via `npx @puppeteer/browsers install chrome`
 *      (globbed from ~/.cache/puppeteer)
 *   3. a system Google Chrome on macOS
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import puppeteer from "puppeteer-core";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3939";
const LABEL = process.env.LABEL ?? "after";
const OUT_DIR = join(process.cwd(), "tmp", "screenshots");

const args = process.argv.slice(2);
// An arg starting with "/" is a literal route path; otherwise it's a
// sample-report slug. No args → the featured sample-report.
const ROUTES =
  args.length > 0
    ? args.map((a) =>
        a.startsWith("/")
          ? { name: a.replace(/^\/+/, "").replace(/\//g, "-") || "root", path: a }
          : { name: a, path: `/sample-report/${a}` },
      )
    : [{ name: "sample-report", path: "/sample-report" }];

function resolveChrome(): string {
  if (
    process.env.PUPPETEER_EXECUTABLE_PATH &&
    existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)
  ) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  // Glob ~/.cache/puppeteer/chrome/<platform>-<ver>/.../Google Chrome for Testing
  const cacheRoot = join(homedir(), ".cache", "puppeteer", "chrome");
  if (existsSync(cacheRoot)) {
    for (const dir of readdirSync(cacheRoot)) {
      const candidates = [
        join(
          cacheRoot,
          dir,
          "chrome-mac-arm64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        ),
        join(
          cacheRoot,
          dir,
          "chrome-mac-x64",
          "Google Chrome for Testing.app",
          "Contents",
          "MacOS",
          "Google Chrome for Testing",
        ),
      ];
      for (const c of candidates) if (existsSync(c)) return c;
    }
  }
  const system =
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (existsSync(system)) return system;
  throw new Error(
    "No Chrome binary found. Set PUPPETEER_EXECUTABLE_PATH or run " +
      "`npx @puppeteer/browsers install chrome@stable`.",
  );
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const executablePath = resolveChrome();
  console.log(`[render] chrome=${executablePath}`);
  console.log(`[render] base=${BASE_URL} label=${LABEL}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    for (const route of ROUTES) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 1600, deviceScaleFactor: 2 });
      const url = `${BASE_URL}${route.path}`;
      console.log(`[render] GET ${url}`);
      // NOTE: the Next *dev* server holds an HMR websocket open, so
      // networkidle never fires. Wait for `load` + the report host
      // element + a short settle for fonts/RSC hydration instead.
      const resp = await page.goto(url, {
        waitUntil: "load",
        timeout: 60_000,
      });
      const status = resp?.status() ?? 0;
      console.log(`[render]   status=${status}`);
      await page
        .waitForSelector(".report-host, .report-section-card, main", {
          timeout: 15_000,
        })
        .catch(() => console.log("[render]   (report host selector not found)"));
      await new Promise((r) => setTimeout(r, 1500));

      // screen media (browser report viewer)
      await page.emulateMediaType("screen");
      const screenPath = join(
        OUT_DIR,
        `${route.name}.screen.${LABEL}.png`,
      );
      await page.screenshot({ path: screenPath, fullPage: true });
      console.log(`[render]   saved ${screenPath}`);

      // print media (PDF surface)
      await page.emulateMediaType("print");
      const printPath = join(OUT_DIR, `${route.name}.print.${LABEL}.png`);
      await page.screenshot({ path: printPath, fullPage: true });
      console.log(`[render]   saved ${printPath}`);

      // also emit the real PDF so page-breaks are inspectable
      const pdfPath = join(OUT_DIR, `${route.name}.${LABEL}.pdf`);
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
      });
      console.log(`[render]   saved ${pdfPath}`);

      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`[render] done → ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[render] FAILED:", err);
  process.exit(1);
});
