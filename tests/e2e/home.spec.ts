import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const MONITORING_OPEN = process.env.GEO_MODULE_MONITORING_ENABLED === "true";

test.describe("homepage — content and behavior", () => {
  test("hero: one H1 with the approved headline and the two CTAs", async ({ page }) => {
    await page.goto("/");
    const h1 = page.locator("h1");
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText("Search is shifting from links to answers.");
    await expect(h1).toContainText("See whether AI understands, mentions and can confidently recommend your business.");
    const hero = page.locator("section").first();
    await expect(hero.getByRole("link", { name: /Run your AI Visibility Audit — \$97/ })).toHaveAttribute("href", "/order");
    await expect(hero.getByRole("link", { name: "Start with the free check" })).toHaveAttribute("href", "/check");
    await expect(hero).toContainText("$97 Early Access");
    await expect(hero).toContainText("normally $147");
  });

  test("every product demonstration is labeled Example data", async ({ page }) => {
    await page.goto("/");
    // Hero readout, monitoring dashboard, score history, competitor presence, improvement tasks.
    expect(await page.getByText("Example data", { exact: true }).count()).toBeGreaterThanOrEqual(5);
  });

  test("the loop: Audit → Monitor → Compare → Improve → Prove sections exist", async ({ page }) => {
    await page.goto("/");
    for (const id of ["how-it-works", "monitor", "compare", "improve", "prove", "pricing", "faq"]) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
  });

  test("no unsupported claims", async ({ page }) => {
    await page.goto("/");
    const text = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    expect(text).not.toMatch(/\bwe guarantee\b|\bguaranteed (rankings?|results|recommendations?)\b/i);
    expect(text).not.toMatch(/ChatGPT (says|will say)/i);
    expect(text).not.toMatch(/supercharge|unlock|10x|dominate/i);
    // Google AI Overviews must never appear among the API-queried systems.
    const apiList = page.locator("#how-it-works li").filter({ hasText: /^(ChatGPT|Claude|Gemini|Perplexity)$/ });
    await expect(apiList).toHaveText(["ChatGPT", "Claude", "Gemini", "Perplexity"]);
    for (const item of await apiList.all()) expect(await item.innerText()).not.toMatch(/Overview/i);
    await expect(page.locator("#how-it-works")).toContainText("derived from your website’s signals");
  });

  test("Foundation Fix contract copy is rendered", async ({ page }) => {
    await page.goto("/");
    const improve = page.locator("#improve");
    await expect(improve).toContainText("underlying technical, trust, and discoverability gaps");
    await expect(improve).toContainText("Starting at $497 · one-time · 3–5 business days");
    await expect(improve).toContainText("Complex sites may require custom scoping");
  });

  test("existing-customer re-audit explains eligibility", async ({ page }) => {
    await page.goto("/");
    const block = page.getByText("Already a customer?").locator("xpath=ancestor::section[1]");
    await expect(block).toContainText("Available only if you already have a completed GeoViz audit");
    await expect(block.getByRole("link", { name: /How re-audits work/ })).toHaveAttribute("href", "/re-audit");
  });

  test("monitoring flag state is reflected everywhere", async ({ page }) => {
    await page.goto("/");
    const pricing = page.locator("#pricing");
    if (MONITORING_OPEN) {
      await expect(pricing.getByRole("link", { name: "Start monitoring" })).toHaveAttribute("href", "/monitoring");
      await expect(page.locator('a[href="/monitoring/sign-in"]').first()).toBeAttached();
      await expect(pricing).not.toContainText("Opening soon");
    } else {
      await expect(pricing).toContainText("Opening soon");
      await expect(pricing).toContainText("$99");
      await expect(pricing.getByRole("button", { name: "Start monitoring" })).toBeDisabled();
      await expect(pricing).toContainText("Purchasing opens at launch.");
      await expect(page.locator('main a[href="/monitoring"]')).toHaveCount(0);
      await expect(page.locator('a[href="/monitoring/sign-in"]')).toHaveCount(0);
    }
  });

  test("no horizontal scroll", async ({ page }) => {
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("reduced motion renders final values immediately", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await expect(page.getByRole("figure", { name: /score 60 of 100/ })).toBeVisible();
    await expect(page.locator('[aria-hidden="true"]', { hasText: /^60$/ }).first()).toBeVisible();
    // Graphics render in their final state without motion.
    await expect(page.locator('ol[aria-label="How GeoViz works, step by step"] svg')).toHaveCount(5);
    const prove = page.locator("#prove");
    await prove.scrollIntoViewIfNeeded();
    await expect(prove.getByText("Verified · newly observed")).toBeVisible();
    await expect(prove.getByText("No LocalBusiness structured data found")).toBeVisible();
    const compare = page.locator("#compare");
    await compare.scrollIntoViewIfNeeded();
    await expect(compare.getByText("points since")).toBeVisible();
    await expect(compare.locator('ol[aria-label="Example score history"] li')).toHaveText(["Starting audit: 52", "Month 1: 55", "Month 2: 60"]);
  });

  test("graphics are labelled as example data and the hero field names only the four queried systems", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#compare").getByText("Example data")).toHaveCount(2);
    await expect(page.locator("#prove").getByText("Example data")).toHaveCount(1);
    const field = page.locator("section").first().locator('[aria-hidden="true"].pointer-events-none');
    const text = await field.innerText().catch(() => "");
    expect(text).not.toMatch(/Overview/i);
  });

  test("accessibility: no serious or critical axe violations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes.length} node(s) — ${v.help}`)).toEqual([]);
  });
});
