/**
 * Splits a generated audit markdown into the pieces the renderer
 * needs to assemble a styled report:
 *
 *   - everything BEFORE the "Done-For-You Fix" section heading
 *   - the section content itself (replaced by a styled CTA card so it
 *     never appears as raw markdown)
 *   - everything AFTER (e.g. the collapsed "Technical Details" section
 *     in full-mode reports)
 *
 * Also exposes a score-breakdown parser so the renderer can build a
 * proper score card from the same markdown without re-running the
 * audit. Both helpers tolerate format drift — they return null when
 * the heading or breakdown can't be located instead of throwing.
 */

export type ScoreCategoryKey =
  | "schema"
  | "crawler"
  | "trust"
  | "content"
  | "brand"
  | "tech";

export type ScoreCategory = {
  key: ScoreCategoryKey;
  label: string;
  short: string;
  max: number;
  score: number | null;
};

export type ReportScore = {
  overall: number | null;
  status: string | null;
  categories: ScoreCategory[];
};

export type ReportLayout = {
  before: string;
  after: string;
  hasCta: boolean;
};

const CATEGORIES: Array<
  Omit<ScoreCategory, "score"> & { pattern: RegExp }
> = [
  {
    key: "schema",
    label: "Structured Data / Schema",
    short: "Business info AI can read",
    max: 25,
    pattern: /Structured\s*Data(?:\s*\/\s*Schema)?/i,
  },
  {
    key: "crawler",
    label: "AI Crawler Readiness",
    short: "AI tools can read your site",
    max: 20,
    pattern: /AI\s*Crawler\s*Readiness/i,
  },
  {
    key: "trust",
    label: "Local Trust Signals",
    short: "Local trust signals",
    max: 20,
    pattern: /Local\s*Trust\s*Signals/i,
  },
  {
    key: "content",
    label: "Content Depth + FAQ Quality",
    short: "Service pages + FAQs",
    max: 15,
    pattern: /Content\s*Depth(?:\s*\+\s*FAQ\s*Quality)?/i,
  },
  {
    key: "brand",
    label: "Brand / Entity Clarity",
    short: "Business clarity",
    max: 10,
    pattern: /Brand(?:\s*\/\s*Entity)?\s*Clarity/i,
  },
  {
    key: "tech",
    label: "Technical Accessibility",
    short: "Site reachability",
    max: 10,
    pattern: /Technical\s*Accessibility/i,
  },
];

const CTA_HEADING_RE =
  /^##\s+(?:\d+\.\s+)?Done[-\s]?For[-\s]?You\s+Fix.*$/im;

export function splitReportLayout(md: string | null | undefined): ReportLayout {
  if (!md) return { before: "", after: "", hasCta: false };

  const headingMatch = CTA_HEADING_RE.exec(md);
  if (!headingMatch) return { before: md, after: "", hasCta: false };

  const startIdx = headingMatch.index;
  const sectionStartEnd = startIdx + headingMatch[0].length;
  const tail = md.slice(sectionStartEnd);
  const nextHeading = /\n##\s+/m.exec(tail);
  const sectionEndIdx = nextHeading
    ? sectionStartEnd + nextHeading.index
    : md.length;

  let before = md.slice(0, startIdx);
  let after = md.slice(sectionEndIdx);

  // Eat the trailing `---` separator above the CTA + the leading
  // `---` separator below it so the rendered chunks don't show
  // orphaned horizontal rules around our card.
  before = before.replace(/\n\s*---\s*\n+\s*$/, "\n").trimEnd();
  after = after.replace(/^\s*\n+\s*---\s*\n+/, "\n").trimStart();

  return { before, after, hasCta: true };
}

export function parseReportScoreBreakdown(
  md: string | null | undefined,
): ReportScore {
  if (!md) {
    return {
      overall: null,
      status: null,
      categories: CATEGORIES.map(({ pattern: _p, ...rest }) => ({
        ...rest,
        score: null,
      })),
    };
  }

  const categories: ScoreCategory[] = CATEGORIES.map((cat) => {
    const re = new RegExp(
      `${cat.pattern.source}\\s*[:\\-—]?\\s*\\*?\\*?(\\d{1,3})\\s*/\\s*${cat.max}\\b`,
      "i",
    );
    const m = re.exec(md);
    return {
      key: cat.key,
      label: cat.label,
      short: cat.short,
      max: cat.max,
      score: m ? clamp(Number(m[1]), 0, cat.max) : null,
    };
  });

  const overallMatch =
    /Overall\s*Score\s*[:\-—]?\s*\*?\*?(\d{1,3})\s*\/\s*100/i.exec(md) ??
    /\b(\d{1,3})\s*\/\s*100\b/.exec(md);
  const overall = overallMatch ? clamp(Number(overallMatch[1]), 0, 100) : null;

  const statusMatch =
    /\b(Strong|Needs\s+Work|At\s+Risk|Competitive|Elite|Poor)\b/i.exec(md);
  const status = statusMatch ? statusMatch[1].replace(/\s+/g, " ") : null;

  return { overall, status, categories };
}

export function scoreToneFromOverall(
  overall: number | null,
): "ok" | "warn" | "bad" | "muted" {
  if (typeof overall !== "number") return "muted";
  if (overall >= 75) return "ok";
  if (overall >= 50) return "warn";
  return "bad";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
