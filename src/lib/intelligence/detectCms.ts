/**
 * V2 Stage 1 — CMS detection (skeleton).
 *
 * Heuristic-only. Looks at the audit markdown for explicit CMS
 * mentions and returns a confidence-gated detection. Stage 1 ships
 * the contract; the rule table is intentionally conservative —
 * better to return null than to mislabel a row.
 *
 * Pure function — no DB, no SDK, no React. Imported only by the
 * intelligence ingest orchestrator.
 *
 * Returns null/empty when uncertain. Operator can still mark CMS via
 * the calibration UI; the system value is just a starting point.
 */

export type CmsConfidence = "high" | "medium" | "low" | "none";

export type CmsDetectionResult = {
  detected: string | null;
  confidence: CmsConfidence;
  signals: string[];
};

const EMPTY: CmsDetectionResult = {
  detected: null,
  confidence: "none",
  signals: [],
};

/**
 * Priority-ordered rule table. First strong match wins. Patterns are
 * intentionally narrow — high-precision over high-recall. Each pattern
 * tries to match a clear textual signal in the audit prose; we never
 * guess from generic indicators like "WordPress-like structure."
 */
const RULES: ReadonlyArray<{
  slug: string;
  pattern: RegExp;
  confidence: CmsConfidence;
}> = [
  // Strong, unambiguous mentions
  { slug: "shopify", pattern: /\b(shopify|myshopify\.com|shopify\s+store)\b/i, confidence: "high" },
  { slug: "wordpress", pattern: /\b(wordpress|wp-content|wp-admin|wp-includes)\b/i, confidence: "high" },
  { slug: "wix", pattern: /\b(wix\.com|powered by wix|wixsite\.com)\b/i, confidence: "high" },
  { slug: "squarespace", pattern: /\b(squarespace|sqsp\.com)\b/i, confidence: "high" },
  { slug: "webflow", pattern: /\b(webflow|webflow\.io)\b/i, confidence: "high" },
  { slug: "ghost", pattern: /\b(ghost\.org|ghost\s+cms|powered by ghost)\b/i, confidence: "high" },
  { slug: "drupal", pattern: /\b(drupal|drupal-\d+)\b/i, confidence: "medium" },
  { slug: "joomla", pattern: /\b(joomla|joomla!)\b/i, confidence: "medium" },
  { slug: "magento", pattern: /\b(magento|adobe commerce)\b/i, confidence: "medium" },
  { slug: "duda", pattern: /\b(duda|dudamobile)\b/i, confidence: "medium" },
  { slug: "godaddy", pattern: /\b(godaddy\s+website\s+builder|gocentral)\b/i, confidence: "medium" },
];

export function detectCms(args: {
  reportMarkdown: string;
  websiteUrl: string;
}): CmsDetectionResult {
  const md = args.reportMarkdown ?? "";
  if (md.trim().length === 0) return EMPTY;

  for (const rule of RULES) {
    const match = rule.pattern.exec(md);
    if (match) {
      return {
        detected: rule.slug,
        confidence: rule.confidence,
        signals: [match[0]],
      };
    }
  }
  return EMPTY;
}
