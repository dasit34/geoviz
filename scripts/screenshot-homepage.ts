/* One-off: capture 4 PNGs of the homepage at hero/middle/pricing/
 * footer scroll positions via puppeteer-core + the system Chrome.
 * Used to verify the Living Visibility Field is visibly active
 * across the entire page. Not committed; lives in scripts/.
 *
 * Run: ./node_modules/.bin/tsx scripts/screenshot-homepage.ts
 */

import puppeteer from "puppeteer-core";

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
];

async function findChrome(): Promise<string> {
  const fs = await import("node:fs/promises");
  for (const path of CHROME_PATHS) {
    try {
      await fs.access(path);
      return path;
    } catch {
      // try next
    }
  }
  throw new Error(
    "Could not find Google Chrome / Chromium / Edge in standard /Applications paths. " +
      "Install Chrome or pass CHROME_BIN env var.",
  );
}

async function main() {
  const executablePath = process.env.CHROME_BIN ?? (await findChrome());
  console.log(`[screenshot] using Chrome at ${executablePath}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    console.log("[screenshot] navigating to http://localhost:3000/");
    await page.goto("http://localhost:3000/", {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // Let the canvas RAF + framer-motion entries settle for a bit
    await new Promise((r) => setTimeout(r, 2500));

    // Hero
    console.log("[screenshot] capturing hero…");
    await page.screenshot({ path: "/tmp/geoviz-hero.png", fullPage: false });

    // Middle — scroll to the How It Works / Sample Report band
    console.log("[screenshot] capturing middle…");
    await page.evaluate(() => {
      const el = document.getElementById("how-it-works");
      if (el) el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
      else window.scrollTo(0, 1200);
    });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: "/tmp/geoviz-middle.png", fullPage: false });

    // Pricing — explicit scroll target via id
    console.log("[screenshot] capturing pricing…");
    await page.evaluate(() => {
      const el = document.getElementById("pricing");
      if (el) el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
    });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: "/tmp/geoviz-pricing.png", fullPage: false });

    // Footer — scroll all the way down
    console.log("[screenshot] capturing footer…");
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise((r) => setTimeout(r, 2000));
    await page.screenshot({ path: "/tmp/geoviz-footer.png", fullPage: false });

    console.log("[screenshot] done. files at:");
    console.log("  /tmp/geoviz-hero.png");
    console.log("  /tmp/geoviz-middle.png");
    console.log("  /tmp/geoviz-pricing.png");
    console.log("  /tmp/geoviz-footer.png");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[screenshot] FAILED:", err.message ?? err);
  process.exit(1);
});
