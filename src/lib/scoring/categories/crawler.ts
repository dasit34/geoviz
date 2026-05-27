/**
 * AI Crawler Readiness — 20 pts.
 *
 * Reads `preflight.crawlability` (passedChecks + failedChecks).
 * The preflight analyzer canonically checks:
 *   • homepage_not_noindex
 *   • canonical_present
 *   • robots_txt_exists
 *   • robots_txt_not_blocking_all
 *   • sitemap_xml_present
 *
 * Ladder anchors (worker prompt Calibration v2):
 *   0–4   broken / blocked        (robots blocks all OR homepage noindex)
 *   5–9   minimal                  (robots exists but partial issues)
 *   10–14 default / working        (robots + sitemap, no canonical)
 *   15–17 strong                   (all five checks pass)
 *   18–20 elite                    (all + explicit AI-bot allowance)
 */

import type { CategoryScoreInternal, Evidence, Issue } from "../types";
import { CATEGORY_MAX } from "../types";

const EVIDENCE_USED = [
  "crawlability.passed_checks",
  "crawlability.failed_checks",
  "crawlability.analyzer_score",
];

function build(
  score: number,
  signals: string[],
  issues: Issue[],
  confidence: number,
): CategoryScoreInternal {
  return {
    key: "crawler",
    score,
    max: CATEGORY_MAX.crawler,
    signals,
    issues,
    reason: signals[0] ?? "No signal",
    evidence_used: EVIDENCE_USED,
    category_confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function scoreCrawler(evidence: Evidence): CategoryScoreInternal {
  const max = CATEGORY_MAX.crawler;
  const signals: string[] = [];
  const issues: Issue[] = [];

  const c = evidence.crawlability;

  if (!c) {
    signals.push("Crawlability not audited (evidence missing)");
    issues.push({
      id: "crawler.no_robots_txt",
      severity: "warning",
      category_key: "crawler",
      weight: max,
      message: "Crawlability evidence missing — defaulting to low",
    });
    return build(5, signals, issues, 0.4);
  }

  const passed = new Set(c.passed_checks.map((s) => s.toLowerCase()));
  const failed = new Set(c.failed_checks.map((s) => s.toLowerCase()));

  // Hard failures — fatal for the category.
  if (failed.has("robots_txt_not_blocking_all")) {
    signals.push("robots.txt blocks all crawlers");
    issues.push({
      id: "crawler.robots_blocks_all",
      severity: "critical",
      category_key: "crawler",
      weight: max,
      message: "robots.txt is blocking every crawler from the site",
    });
    return build(1, signals, issues, 1.0);
  }
  if (failed.has("homepage_not_noindex")) {
    signals.push("Homepage carries a noindex directive");
    issues.push({
      id: "crawler.homepage_noindex",
      severity: "critical",
      category_key: "crawler",
      weight: max,
      message: "Homepage is marked noindex — AI crawlers and search engines will skip it",
    });
    return build(2, signals, issues, 1.0);
  }

  let score = 8; // working-default floor when no hard failures

  if (passed.has("robots_txt_exists")) {
    signals.push("robots.txt present");
    score += 3;
  } else {
    signals.push("robots.txt not present");
    issues.push({
      id: "crawler.no_robots_txt",
      severity: "warning",
      category_key: "crawler",
      weight: max,
      message: "No robots.txt at the root",
    });
  }

  if (passed.has("sitemap_xml_present")) {
    signals.push("sitemap.xml present");
    score += 3;
  } else {
    signals.push("sitemap.xml not present");
    issues.push({
      id: "crawler.no_sitemap",
      severity: "warning",
      category_key: "crawler",
      weight: max,
      message: "No sitemap.xml at the root",
    });
  }

  if (passed.has("canonical_present")) {
    signals.push("Canonical URL declared on homepage");
    score += 3;
  } else {
    signals.push("No canonical URL on homepage");
    issues.push({
      id: "crawler.no_canonical",
      severity: "info",
      category_key: "crawler",
      weight: max,
      message: "Homepage has no canonical URL",
    });
  }

  if (passed.has("robots_txt_not_blocking_all")) {
    score += 2;
  }
  if (passed.has("homepage_not_noindex")) {
    score += 2;
  }

  // Honor the analyzer's own composite score as a sanity ceiling.
  // Continuous (dropped Math.round) so an analyzer score shifting by 1
  // unit doesn't flip the ceiling by a full point. Outer clamp + final
  // category clamp handle bounds. Anchor preserved: analyzer=100 → ceiling=max+2.
  if (typeof c.analyzer_score === "number") {
    const ratio = c.analyzer_score / 100;
    const ceiling = ratio * max;
    if (score > ceiling + 2) score = ceiling + 2;
  }

  score = clamp(score, 0, max);
  const confidence =
    typeof c.analyzer_score === "number"
      ? Math.max(0.7, c.analyzer_score / 100)
      : 0.75;
  return build(score, signals, issues, confidence);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
