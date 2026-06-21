/**
 * Capture screenshots of the 4 verification pages for all 6 snapshot
 * fixtures. Outputs PNGs to tmp/fixture-screenshots/.
 *
 * Run with:
 *   npx tsx scripts/fixture-screenshots.ts
 *
 * Requires the dev server to be running on localhost:3000, and
 * PUPPETEER_EXECUTABLE_PATH to point to a local Chrome/Chromium.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const puppeteer = require("puppeteer-core") as typeof import("puppeteer-core");
import * as fs from "fs";
import * as path from "path";

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "tmp", "fixture-screenshots");

const FIXTURES = [
  "perfect-audit",
  "average-audit",
  "broken-category-audit",
  "failed-model-audit",
  "missing-schema-audit",
  "missing-reviews-audit",
];

// rd-page index (0-based) for each target page
// P1=Cover P2=Executive P3=AIIntel P4=Evidence P5=Diag P6=Issues P7=Fixes P8=Action
const TARGET_PAGES = [
  { label: "executive-summary", pageIndex: 1 },
  { label: "ai-intelligence", pageIndex: 2 },
  { label: "customer-questions", pageIndex: 3 },
  { label: "top-issues", pageIndex: 5 },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const execPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

  const browser = await puppeteer.launch({
    executablePath: execPath,
    headless: true,
    defaultViewport: { width: 820, height: 1160 },
  });

  try {
    for (const fixture of FIXTURES) {
      console.log(`\n── ${fixture} ──`);
      const url = `${BASE}/fixture-preview/${fixture}/print`;

      const page = await browser.newPage();
      await page.emulateMediaType("screen");
      await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 });

      // Wait for the report pages to render
      await page.waitForSelector(".rd-page", { timeout: 10_000 });

      const pageCount = await page.$$eval(".rd-page", (els: Element[]) => els.length);
      console.log(`  pages found: ${pageCount}`);

      for (const target of TARGET_PAGES) {
        if (target.pageIndex >= pageCount) {
          console.log(`  [SKIP] ${target.label} — page index ${target.pageIndex} out of range (${pageCount} pages)`);
          continue;
        }

        const rect = await page.$eval(
          `.rd-page:nth-child(${target.pageIndex + 1})`,
          (el: Element) => {
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, width: r.width, height: r.height };
          },
        );

        const file = path.join(OUT, `${fixture}--${target.label}.png`);
        await page.screenshot({
          clip: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: Math.min(rect.height, 1160),
          },
          path: file,
        });
        console.log(`  ✓ ${target.label} → ${path.relative(process.cwd(), file)}`);
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\nDone. Screenshots in: ${OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
