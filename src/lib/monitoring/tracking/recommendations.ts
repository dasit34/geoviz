/**
 * Prioritized recommended actions (pure). Every action cites the evidence
 * that triggered it — an audit finding or a tracking measurement. Nothing
 * here changes a customer's website; these are instructions for a person.
 */
import { ISSUE_TO_FIX } from "@/lib/scoring/fixes-table";

import type { CitationIntel } from "./citation-intel";
import type { DetectedCompetitor } from "./competitors";
import type { CycleMetrics } from "./metrics";

export type RecommendationCategory =
  | "business_identity"
  | "website_content"
  | "structured_data"
  | "citations_authority"
  | "local_visibility";

export const CATEGORY_LABELS: Record<RecommendationCategory, string> = {
  business_identity: "Business identity",
  website_content: "Website & content",
  structured_data: "Structured data",
  citations_authority: "Citations & authority",
  local_visibility: "Local visibility",
};

export type Recommendation = {
  id: string;
  category: RecommendationCategory;
  /** 1 = do first. */
  priority: 1 | 2 | 3;
  title: string;
  action: string;
  /** Plain-language description of the evidence that triggered this. */
  evidence: string;
  source: "audit" | "tracking" | "website";
  /** Source page for website findings. */
  url?: string;
};

export type AuditIssue = { id: string; severity: string; category_key: string; message: string };

function categoryForIssue(issue: AuditIssue): RecommendationCategory {
  switch (issue.category_key) {
    case "schema":
      return "structured_data";
    case "brand":
      return "business_identity";
    case "trust":
      return /nap|phone|address|identity/i.test(issue.id) ? "business_identity" : "local_visibility";
    default:
      return "website_content"; // content, crawler, tech
  }
}

const SOURCE_ORDER: Record<Recommendation["source"], number> = { tracking: 0, website: 1, audit: 2 };
const SEVERITY_PRIORITY: Record<string, 1 | 2 | 3> = { critical: 1, warning: 2, info: 3 };
const pct = (r: number) => `${Math.round(r * 100)}%`;

export function buildRecommendations(input: {
  audit: { completedAt: Date; issues: AuditIssue[] } | null;
  metrics: CycleMetrics | null;
  citations: CitationIntel | null;
  detectedCompetitors: DetectedCompetitor[];
  customerName: string;
  /** Evidence-backed findings from website change tracking (website/findings.ts). */
  websiteFindings?: Recommendation[];
  limit?: number;
}): Recommendation[] {
  const out: Recommendation[] = [...(input.websiteFindings ?? [])];
  const auditDate = input.audit?.completedAt.toISOString().slice(0, 10);

  for (const issue of input.audit?.issues ?? []) {
    const fix = ISSUE_TO_FIX[issue.id];
    if (!fix) continue;
    out.push({
      id: `audit:${issue.id}`,
      category: categoryForIssue(issue),
      priority: fix.impact === "high" ? Math.min(SEVERITY_PRIORITY[issue.severity] ?? 2, 2) as 1 | 2 : (SEVERITY_PRIORITY[issue.severity] ?? 3),
      title: issue.message,
      action: fix.action,
      evidence: `Found in your GeoViz audit of ${auditDate}: "${issue.message}".`,
      source: "audit",
    });
  }

  const m = input.metrics;
  if (m && m.measured >= 4 && m.mentionRate !== null) {
    if (m.mentionRate === 0) {
      out.push({
        id: "tracking:not_named",
        category: "local_visibility",
        priority: 1,
        title: "AI systems aren't naming your business yet",
        action:
          "Make sure your business name, service area, and core services appear consistently on your website and major listings (Google Business Profile, Yelp, industry directories) so AI systems have something to retrieve.",
        evidence: `${input.customerName} was named in 0 of ${m.measured} AI answers to your tracked questions.`,
        source: "tracking",
      });
    } else if (m.mentionRate < 0.5) {
      out.push({
        id: "tracking:low_mention_rate",
        category: "local_visibility",
        priority: 2,
        title: "You appear in fewer than half of AI answers",
        action:
          "Strengthen the pages and listings that describe the specific services and locations in the questions where you were missing.",
        evidence: `Named in ${m.customerMentions} of ${m.measured} measured answers (${pct(m.mentionRate)}).`,
        source: "tracking",
      });
    }
    const leader = [...m.competitors].sort((a, b) => b.mentions - a.mentions)[0];
    if (leader && leader.mentions > m.customerMentions) {
      out.push({
        id: `tracking:competitor_leads:${leader.id}`,
        category: "local_visibility",
        priority: 2,
        title: `${leader.name} is named more often than you`,
        action: `Review where ${leader.name} is listed and cited (see the Citations tab) and make sure your business is present and complete on the same sources.`,
        evidence: `${leader.name} was named in ${leader.mentions} answers vs. ${m.customerMentions} for ${input.customerName}.`,
        source: "tracking",
      });
    }
    if (m.citationRate === 0 && m.customerMentions > 0) {
      out.push({
        id: "tracking:own_site_not_cited",
        category: "website_content",
        priority: 2,
        title: "AI answers mention you but don't cite your website",
        action:
          "Add clear, quotable pages for each core service and location (with FAQs) so AI systems have a page of yours worth citing.",
        evidence: `You were named in ${m.customerMentions} answers, but your website was cited in none of them.`,
        source: "tracking",
      });
    }
  }

  const c = input.citations;
  if (c && c.opportunities.length > 0) {
    const list = c.opportunities.slice(0, 3).map((o) => o.domain).join(", ");
    out.push({
      id: "tracking:citation_gaps",
      category: "citations_authority",
      priority: 2,
      title: "Sources that AI cites for competitors don't mention you",
      action: `Check whether your business has an accurate, complete presence on ${list}. These sources may help AI systems confirm your business; a listing does not guarantee you'll be recommended.`,
      evidence: `${list} ${c.opportunities.length > 1 ? "were" : "was"} cited in answers that named competitors but never in answers that named you.`,
      source: "tracking",
    });
  }

  const unseen = input.detectedCompetitors.filter((d) => d.answers >= 2)[0];
  if (unseen && m && m.customerMentions === 0) {
    out.push({
      id: `tracking:detected_competitor:${unseen.normalizedName}`,
      category: "local_visibility",
      priority: 3,
      title: `AI keeps naming ${unseen.name}`,
      action: `Consider tracking ${unseen.name} as a competitor to see where they're cited and how your visibility compares over time.`,
      evidence: `${unseen.name} was named in ${unseen.answers} answers to your tracked questions.`,
      source: "tracking",
    });
  }

  const seen = new Set<string>();
  return out
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => a.priority - b.priority || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source])
    .slice(0, input.limit ?? 12);
}

/** Collect all issues from a stored DeterministicScore JSON (defensive). */
export function issuesFromDeterministicScore(det: unknown): AuditIssue[] {
  const cats = (det as { category_scores?: Record<string, { issues?: unknown }> } | null)?.category_scores;
  if (!cats || typeof cats !== "object") return [];
  const out: AuditIssue[] = [];
  for (const [key, cat] of Object.entries(cats)) {
    for (const i of Array.isArray(cat?.issues) ? cat.issues : []) {
      const issue = i as Partial<AuditIssue>;
      if (typeof issue.id === "string" && typeof issue.message === "string") {
        out.push({ id: issue.id, severity: issue.severity ?? "info", category_key: issue.category_key ?? key, message: issue.message });
      }
    }
  }
  return out;
}
