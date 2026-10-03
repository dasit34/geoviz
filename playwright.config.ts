import { defineConfig, devices } from "@playwright/test";

/**
 * Homepage end-to-end, accessibility, and visual tests. They run against a
 * production build (`next build` then `next start`) with a non-production,
 * no-database environment. Monitoring flag states are exercised by building
 * with GEO_MODULE_MONITORING_ENABLED unset vs "true" (local env only).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
// Optional: run against a deployed (protected) Preview instead of a local server.
const REMOTE = process.env.E2E_BASE_URL;
const BYPASS = process.env.E2E_VERCEL_BYPASS;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : undefined,
    trace: "off",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    },
  ],
  webServer: REMOTE
    ? undefined
    : {
        command: `npx next start -p ${PORT}`,
        url: `http://localhost:${PORT}`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
