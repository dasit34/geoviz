/* eslint-disable no-console */
/**
 * scripts/build-chatgpt-plugin-package.ts
 *
 * Builds the GeoViz ChatGPT plugin submission package (NOT a submission):
 *   chatgpt-plugin/assets/logo.png          512×512, rendered from src/app/icon.svg
 *   chatgpt-plugin/assets/screenshot-1.png  706 px wide, the real result card
 *                                           (src/lib/chatgpt-plugin/result-card.ts)
 *                                           filled with captured Production output
 *                                           (chatgpt-plugin/review/sample-output-geoviz.json)
 *   chatgpt-plugin/dist/geoviz-chatgpt-plugin-<version>.zip
 *                                           plugin.json + mcp.json + assets/
 *
 * Validates the listing limits from developers.openai.com/plugins/deploy/submission-errors.
 * No network, no database. Usage: npx tsx scripts/build-chatgpt-plugin-package.ts
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

import { CARD_HTML } from "../src/lib/chatgpt-plugin/result-card";

const ROOT = path.join(__dirname, "..");
const PKG = path.join(ROOT, "chatgpt-plugin");

type Interface = Record<string, unknown> & { displayName: string; shortDescription: string; longDescription: string; developerName: string; category: string; capabilities: string[]; defaultPrompt?: string[]; screenshots?: string[] };

const CATEGORIES = ["Productivity", "Creativity", "Developer Tools", "Business & Operations", "Data & Analytics", "Communication", "Education & Research", "Security", "Finance", "Healthcare", "Travel", "Entertainment", "Other"];

function validate(plugin: { name: string; version: string; description: string; extensions: { "com.openai": { interface: Interface } } }, mcp: { mcpServers: Record<string, { type: string; url: string }> }): string[] {
  const errs: string[] = [];
  const i = plugin.extensions["com.openai"].interface;
  const oneLine = (s: string) => !/[\r\n]/.test(s);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(plugin.name)) errs.push("name");
  if (!/^\d+\.\d+\.\d+$/.test(plugin.version)) errs.push("version");
  if (plugin.description.length > 4000) errs.push("description > 4000");
  if (!(i.displayName.length <= 30 && oneLine(i.displayName))) errs.push(`displayName (${i.displayName.length})`);
  if (!(i.shortDescription.length <= 30 && oneLine(i.shortDescription))) errs.push(`shortDescription (${i.shortDescription.length})`);
  if (i.longDescription.length > 4000) errs.push("longDescription > 4000");
  if (!(i.developerName.length <= 80 && oneLine(i.developerName))) errs.push("developerName");
  if (!CATEGORIES.includes(i.category)) errs.push(`category ${i.category}`);
  if (i.capabilities.length > 20 || i.capabilities.some((c) => !c || c.length > 120 || !oneLine(c))) errs.push("capabilities");
  const prompts = i.defaultPrompt ?? [];
  if (prompts.length > 3 || prompts.some((p) => !p || p.length > 128 || !oneLine(p) || /@\w/.test(p)) || new Set(prompts.map((p) => p.trim().toLowerCase())).size !== prompts.length) errs.push("defaultPrompt");
  if ((i.screenshots ?? []).length !== prompts.length) errs.push("one screenshot per starter prompt");
  for (const k of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    const v = i[k];
    if (typeof v !== "string" || v.length > 1024 || !/^https:\/\/[^/@\s]+/.test(v)) errs.push(`${k} must be an https URL`);
  }
  for (const k of ["brandColor", "brandColorDark"]) if (i[k] !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(String(i[k]))) errs.push(k);
  const servers = Object.values(mcp.mcpServers);
  if (servers.length !== 1) errs.push("exactly one MCP server");
  if (servers[0] && (servers[0].type !== "streamable-http" || !servers[0].url.startsWith("https://"))) errs.push("mcp server must be streamable-http over https");
  return errs;
}

async function main() {
  const plugin = JSON.parse(readFileSync(path.join(PKG, "plugin.json"), "utf8"));
  const mcp = JSON.parse(readFileSync(path.join(PKG, "mcp.json"), "utf8"));
  const errs = validate(plugin, mcp);
  if (errs.length) {
    console.log(`[chatgpt-plugin-package] metadata errors: ${errs.join("; ")}`);
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    // Logo: the site's brand mark (src/app/icon.svg), square, 512×512.
    const svg = readFileSync(path.join(ROOT, "src/app/icon.svg"), "utf8").replace('width="48" height="48"', 'width="512" height="512"');
    const logoPage = await browser.newPage({ viewport: { width: 512, height: 512 } });
    await logoPage.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await logoPage.locator("svg").screenshot({ path: path.join(PKG, "assets/logo.png"), omitBackground: true });

    // Screenshot: the real card, 706 px wide, rendered with captured Production output.
    const sample = JSON.parse(readFileSync(path.join(PKG, "review/sample-output-geoviz.json"), "utf8"));
    const page = await browser.newPage({ viewport: { width: 706, height: 860 } });
    await page.setContent(CARD_HTML);
    await page.evaluate((data) => window.postMessage({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { structuredContent: data } }, "*"), sample);
    await page.waitForSelector("#card:not([hidden])");
    const height = Math.min(860, Math.max(400, Math.ceil(await page.evaluate(() => document.body.scrollHeight))));
    await page.setViewportSize({ width: 706, height });
    await page.screenshot({ path: path.join(PKG, "assets/screenshot-1.png"), clip: { x: 0, y: 0, width: 706, height } });
    console.log(`[chatgpt-plugin-package] screenshot-1.png 706×${height}`);
  } finally {
    await browser.close();
  }

  const dist = path.join(PKG, "dist");
  mkdirSync(dist, { recursive: true });
  const zip = path.join(dist, `geoviz-chatgpt-plugin-${plugin.version}.zip`);
  rmSync(zip, { force: true });
  execFileSync("zip", ["-X", "-q", "-r", zip, "plugin.json", "mcp.json", "assets"], { cwd: PKG });
  console.log(`[chatgpt-plugin-package] ${path.relative(ROOT, zip)}`);
  console.log(execFileSync("unzip", ["-l", zip], { encoding: "utf8" }));
}

main().catch((err) => {
  console.log(`[chatgpt-plugin-package] fatal: ${(err as Error).message}`);
  process.exit(1);
});
