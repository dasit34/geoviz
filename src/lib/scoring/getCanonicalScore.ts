/**
 * Canonical score resolver — bridges the legacy regex parser and the
 * new deterministic engine.
 *
 * Reads from `AuditIntelligence.deterministicScore` when present
 * (`scoring@1.0.0`+ audits) and returns the same `ReportScore` shape
 * existing UI components consume. Falls back to
 * `parseReportScoreBreakdown(reportMarkdown)` for legacy rows.
 *
 * UI components call this single function instead of importing
 * `parseReportScoreBreakdown` directly. Their JSX is unchanged.
 *
 * Pure — no I/O, no Date, no random.
 */

import { parseReportScoreBreakdown } from "@/lib/parse-report";
import type { ReportScore, ScoreCategory } from "@/lib/parse-report";
import type {
  CategoryKey,
  CategoryPublic,
  DeterministicScore,
} from "./types";

/**
 * Minimal shape this resolver accepts. We don't import Prisma types
 * here because callers may pass either a Prisma row or a hand-built
 * fixture in tests.
 */
export type CanonicalScoreInput = {
  reportMarkdown?: string | null;
  intelligence?: {
    deterministicScore?: unknown;
  } | null;
};

const CATEGORY_LABEL: Record<CategoryKey, { label: string; short: string; tooltip: string }> = {
  schema: {
    label: "Structured Data / Schema",
    short: "Recommendation Ready",
    tooltip: "How clearly AI systems can identify who you are and what you do.",
  },
  crawler: {
    label: "AI Crawler Readiness",
    short: "Technical Access",
    tooltip: "Whether AI systems can access and understand your website content.",
  },
  trust: {
    label: "Local Trust Signals",
    short: "Trust Signals",
    tooltip: "Whether reviews, citations, and consistent business info make AI confident enough to recommend you.",
  },
  content: {
    label: "Content Depth + FAQ Quality",
    short: "Content Depth",
    tooltip: "Whether your site has the depth of service and FAQ content AI can quote when answering customers.",
  },
  brand: {
    label: "Brand / Entity Clarity",
    short: "Brand Presence",
    tooltip: "Whether AI can confidently identify your business as one consistent entity across the web.",
  },
  tech: {
    label: "Technical Accessibility",
    short: "AI Readability",
    tooltip: "How easily AI systems can retrieve and interpret your site structure and content.",
  },
};

const CATEGORY_ORDER: CategoryKey[] = [
  "schema",
  "crawler",
  "trust",
  "content",
  "brand",
  "tech",
];

/**
 * Returns true when the value looks like a `DeterministicScore` JSON
 * payload. Defensive — Prisma `Json?` columns are typed `unknown`.
 */
function isDeterministicScore(v: unknown): v is DeterministicScore {
  if (!v || typeof v !== "object") return false;
  const obj = v as Record<string, unknown>;
  return (
    typeof obj.scoring_version === "string" &&
    typeof obj.overall_score === "number" &&
    obj.category_scores !== undefined &&
    typeof obj.category_scores === "object"
  );
}

/**
 * Convert a `DeterministicScore` → the legacy `ReportScore` shape so
 * existing UI components don't need to know about the new engine.
 *
 * Rounds at the display boundary. The underlying `DeterministicScore`
 * in the DB keeps full precision for replay / calibration; customer
 * surfaces only ever see integers.
 */
function toReportScore(d: DeterministicScore): ReportScore {
  const categories: ScoreCategory[] = CATEGORY_ORDER.map((key) => {
    const meta = CATEGORY_LABEL[key];
    const cat = (d.category_scores as Record<CategoryKey, CategoryPublic>)[
      key
    ];
    return {
      key,
      label: meta.label,
      short: meta.short,
      tooltip: meta.tooltip,
      max: cat.max,
      score: Math.round(cat.score),
    };
  });

  const overall = Math.round(d.overall_score);
  return {
    overall,
    status: d.band,
    categories,
    declaredOverall: overall,
    rubricSum: overall,
  };
}

export function getCanonicalScore(input: CanonicalScoreInput): ReportScore {
  const det = input.intelligence?.deterministicScore;
  if (isDeterministicScore(det)) {
    return toReportScore(det);
  }
  return parseReportScoreBreakdown(input.reportMarkdown ?? null);
}
