/**
 * Top-3 findings + matching recommended fixes.
 *
 * Collects every Issue raised by every category scorer, ranks them
 * by `severity × weight × (max - score)`, and returns the top 3
 * findings + their mapped fixes.
 *
 * Stable — same evidence ⇒ same id list ⇒ same ranking ⇒ same fixes.
 */

import { ISSUE_TO_FIX } from "./fixes-table";
import type {
  CategoryKey,
  CategoryScoreInternal,
  Finding,
  Fix,
  Issue,
} from "./types";

const SEVERITY_WEIGHT: Record<Issue["severity"], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export function deriveTopFindings(
  categories: Record<CategoryKey, CategoryScoreInternal>,
): Finding[] {
  // Collect issues with their parent category's score-gap as a
  // ranking multiplier. Bigger gap → more room to improve → higher
  // priority.
  const ranked: Array<{ issue: Issue; gap: number }> = [];
  for (const key of Object.keys(categories) as CategoryKey[]) {
    const c = categories[key];
    const gap = Math.max(1, c.max - c.score);
    for (const issue of c.issues) {
      ranked.push({ issue, gap });
    }
  }

  // Sort: severity desc, weight desc, gap desc, id asc (stable).
  ranked.sort((a, b) => {
    const sa = SEVERITY_WEIGHT[a.issue.severity];
    const sb = SEVERITY_WEIGHT[b.issue.severity];
    if (sa !== sb) return sb - sa;
    if (a.issue.weight !== b.issue.weight)
      return b.issue.weight - a.issue.weight;
    if (a.gap !== b.gap) return b.gap - a.gap;
    return a.issue.id.localeCompare(b.issue.id);
  });

  // Dedup by id — the same issue id can appear in multiple categories
  // (e.g., `brand.no_sameas` lives in both schema and brand). Keep the
  // first (highest-ranked) instance.
  const seen = new Set<string>();
  const out: Finding[] = [];
  for (const { issue } of ranked) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    out.push({
      id: issue.id,
      severity: issue.severity,
      category: issue.category_key,
      message: issue.message,
    });
    if (out.length === 3) break;
  }

  return out;
}

export function deriveTopFixes(findings: Finding[]): Fix[] {
  const out: Fix[] = [];
  for (const finding of findings) {
    const template = ISSUE_TO_FIX[finding.id];
    if (!template) {
      // Unmapped issue id — synthesize a generic fix so the customer
      // still sees three recommended actions. Use a stable id so the
      // output is deterministic.
      out.push({
        id: `${finding.id}.generic_fix`,
        for_finding: finding.id,
        action: `Address: ${finding.message}`,
        impact: finding.severity === "critical" ? "high" : "medium",
      });
      continue;
    }
    out.push({
      id: `${finding.id}.fix`,
      for_finding: finding.id,
      action: template.action,
      impact: template.impact,
    });
  }
  return out;
}
