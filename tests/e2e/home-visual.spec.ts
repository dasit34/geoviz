import { expect, test } from "@playwright/test";

const STATE = process.env.GEO_MODULE_MONITORING_ENABLED === "true" ? "monitoring-open" : "monitoring-soon";

/**
 * Visual baselines. Full-page shots use reduced motion so they are
 * deterministic; one extra shot captures the hero after its signature
 * sequence completes with motion on.
 */
test.describe("homepage — visual", () => {
  test("full page (reduced motion)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`home-full-${STATE}.png`, { fullPage: true, animations: "disabled" });
  });

  test("hero after the signature sequence (motion on)", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2600);
    await expect(page).toHaveScreenshot(`home-hero-motion-${STATE}.png`, { animations: "disabled" });
  });

  for (const width of [768, 1440]) {
    test(`full page at ${width}px (reduced motion)`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop", "extra widths run once, in the desktop project");
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      await page.evaluate(() => document.fonts.ready);
      await expect(page).toHaveScreenshot(`home-full-${width}-${STATE}.png`, { fullPage: true, animations: "disabled" });
    });
  }
});
