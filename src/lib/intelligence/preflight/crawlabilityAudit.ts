// AI-crawlability + indexability checks done directly on the Node
// side. Three pieces:
//   1. The homepage HTML (already fetched once by the preflight
//      orchestrator) — inspect <meta name="robots">, <link rel="canonical">.
//   2. /robots.txt — fetch separately, parse for obvious blocking
//      patterns (User-agent: * + Disallow: /).
//   3. /sitemap.xml — fetch separately, confirm it's at least
//      parseable as XML.
//
// Returns the spec'd shape: { score, findings, warnings, passedChecks,
// failedChecks }. Score is the fraction of passed checks * 100.
//
// Purpose for V2: gives us a queryable signal of whether AI crawlers
// (ChatGPT bot, Claude bot, PerplexityBot, Google-Extended, etc.)
// can actually reach the business site. Future versions can extend
// this with per-bot User-Agent specific checks.

import { JSDOM } from "jsdom";
import { fetchRawHtml } from "./fetchRawHtml";
import type { CrawlabilityResult } from "./types";

export async function auditCrawlability(args: {
  url: string;
  homepageHtml: string;
}): Promise<CrawlabilityResult> {
  const findings: string[] = [];
  const warnings: string[] = [];
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];

  const origin = safeOrigin(args.url);

  // Check 1 — homepage <meta name="robots"> doesn't include noindex.
  // Check 2 — homepage <link rel="canonical"> is present and resolves
  //           to the same origin.
  if (args.homepageHtml.length > 0) {
    try {
      const dom = new JSDOM(args.homepageHtml, { url: args.url });
      const doc = dom.window.document;

      const metaRobots = doc.querySelector('meta[name="robots"]');
      const robotsContent = metaRobots?.getAttribute("content")?.toLowerCase() ?? "";
      if (robotsContent.includes("noindex")) {
        failedChecks.push("homepage_not_noindex");
        findings.push(`<meta name="robots"> includes "noindex"`);
      } else {
        passedChecks.push("homepage_not_noindex");
      }

      const canonical = doc.querySelector('link[rel="canonical"]');
      const canonicalHref = canonical?.getAttribute("href") ?? "";
      if (!canonicalHref) {
        failedChecks.push("canonical_present");
        findings.push("no <link rel=\"canonical\"> on homepage");
      } else {
        passedChecks.push("canonical_present");
        try {
          const resolved = new URL(canonicalHref, args.url);
          if (origin && resolved.origin !== origin) {
            warnings.push(
              `canonical points to a different origin: ${resolved.origin}`,
            );
          }
        } catch {
          warnings.push(`canonical href is not a valid URL: "${canonicalHref}"`);
        }
      }
    } catch (err) {
      warnings.push(
        `JSDOM parse of homepage failed: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  } else {
    failedChecks.push("homepage_fetchable");
    findings.push("homepage HTML was empty — meta checks skipped");
  }

  // Check 3 — robots.txt exists and doesn't block-all.
  if (origin) {
    const robotsRes = await fetchRawHtml(`${origin}/robots.txt`, { timeoutMs: 5_000 });
    if (robotsRes.ok && robotsRes.status >= 200 && robotsRes.status < 300) {
      passedChecks.push("robots_txt_exists");
      if (blocksAllCrawlers(robotsRes.html)) {
        failedChecks.push("robots_txt_not_blocking_all");
        findings.push("robots.txt blocks all crawlers (User-agent: * + Disallow: /)");
      } else {
        passedChecks.push("robots_txt_not_blocking_all");
      }
    } else {
      failedChecks.push("robots_txt_exists");
      findings.push(
        robotsRes.ok
          ? `robots.txt returned HTTP ${robotsRes.status}`
          : `robots.txt fetch failed: ${robotsRes.error}`,
      );
    }
  }

  // Check 4 — sitemap.xml exists and is parseable XML.
  if (origin) {
    const sitemapRes = await fetchRawHtml(`${origin}/sitemap.xml`, { timeoutMs: 5_000 });
    if (sitemapRes.ok && sitemapRes.status >= 200 && sitemapRes.status < 300) {
      const looksXml = /<\?xml|<urlset|<sitemapindex/i.test(sitemapRes.html);
      if (looksXml) {
        passedChecks.push("sitemap_xml_present");
      } else {
        failedChecks.push("sitemap_xml_present");
        findings.push("sitemap.xml exists but doesn't look like XML");
      }
    } else {
      failedChecks.push("sitemap_xml_present");
      findings.push(
        sitemapRes.ok
          ? `sitemap.xml returned HTTP ${sitemapRes.status}`
          : `sitemap.xml fetch failed: ${sitemapRes.error}`,
      );
    }
  }

  const total = passedChecks.length + failedChecks.length;
  const score = total === 0 ? 0 : Math.round((passedChecks.length / total) * 100);

  return {
    score,
    findings,
    warnings,
    passedChecks,
    failedChecks,
  };
}

function safeOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function blocksAllCrawlers(robotsTxt: string): boolean {
  // Look for: User-agent: * followed (any whitespace) by Disallow: /
  // Not perfect — doesn't model multi-block grammar fully — but catches
  // the obvious lock-everyone-out pattern.
  const blocks = robotsTxt.split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block
      .split(/\n/)
      .map((l) => l.split("#")[0].trim().toLowerCase())
      .filter(Boolean);
    const ua = lines.find((l) => l.startsWith("user-agent:"));
    if (ua && ua.includes("*")) {
      const blockedAll = lines.some((l) => l === "disallow: /");
      if (blockedAll) return true;
    }
  }
  return false;
}
