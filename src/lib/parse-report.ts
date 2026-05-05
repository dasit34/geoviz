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
    /\b(AI[-\s]?Ready|Competitive|Needs\s+Work|At\s+Risk|Invisible|Strong|Elite|Poor)\b/i.exec(
      md,
    );
  const status = statusMatch
    ? statusMatch[1].replace(/\s+/g, " ").replace(/^AI[-\s]?Ready$/i, "AI-Ready")
    : null;

  return { overall, status, categories };
}

export function scoreToneFromOverall(
  overall: number | null,
): "ok" | "warn" | "bad" | "muted" {
  if (typeof overall !== "number") return "muted";
  // Tone tracks the 5-band rubric: AI-Ready/Competitive = ok,
  // Needs Work = warn, At Risk/Invisible = bad.
  if (overall >= 66) return "ok";
  if (overall >= 46) return "warn";
  return "bad";
}

export function bandLabelForOverall(overall: number | null): string {
  if (typeof overall !== "number") return "Pending";
  if (overall >= 81) return "AI-Ready";
  if (overall >= 66) return "Competitive";
  if (overall >= 46) return "Needs Work";
  if (overall >= 26) return "At Risk";
  return "Invisible";
}

export type ReportSectionSlug =
  | "score"
  | "why"
  | "fix-first"
  | "happens"
  | "cta"
  | "tech-details"
  | "other";

export type ReportSection = {
  slug: ReportSectionSlug;
  heading: string;
  body: string;
};

export type ReportSections = {
  sections: ReportSection[];
  hasCta: boolean;
};

const SECTION_SLUGS: Array<{ slug: ReportSectionSlug; pattern: RegExp }> = [
  { slug: "score", pattern: /AI\s*Visibility\s*Score|^Score\b/i },
  { slug: "why", pattern: /Why\s+(?:Customers\s+Don|Your\s+Business\s+Is|You['’]re)/i },
  { slug: "fix-first", pattern: /What\s+to\s+Fix\s+First/i },
  { slug: "happens", pattern: /What\s+Happens\s+If/i },
  { slug: "cta", pattern: /Done[-\s]?For[-\s]?You\s+Fix/i },
  { slug: "tech-details", pattern: /Technical\s+Details/i },
];

/**
 * Splits the markdown into typed sections so the renderer can use a
 * styled card per section instead of dumping raw markdown. Format-
 * tolerant — unrecognized headings get the "other" slug and still
 * render via fallback markdown.
 */
export function parseReportSections(
  md: string | null | undefined,
): ReportSections {
  if (!md) return { sections: [], hasCta: false };

  // Match every `## ` (or `# `) heading. Capture the heading text plus
  // its body until the next heading-of-equal-or-higher level / EOF.
  const headingRe = /^(##?)\s+(.+?)\s*$/gm;
  const matches: Array<{ index: number; level: number; text: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(md)) !== null) {
    matches.push({ index: m.index, level: m[1].length, text: m[2] });
  }

  const sections: ReportSection[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    if (cur.level !== 2) continue; // Only ## sections become cards.
    const next = matches.slice(i + 1).find((x) => x.level <= 2);
    const bodyStart = cur.index + cur.text.length + cur.level + 1;
    const bodyEnd = next ? next.index : md.length;
    const rawBody = md.slice(bodyStart, bodyEnd);
    const heading = cur.text
      .replace(/^\d+\.\s*/, "")
      .replace(/\s*\(Optional\)\s*$/i, "")
      .trim();
    const slug = slugForHeading(cur.text);
    const body = stripWrappingSeparators(rawBody);
    sections.push({ slug, heading, body });
  }

  const hasCta = sections.some((s) => s.slug === "cta");
  return { sections, hasCta };
}

function slugForHeading(rawHeading: string): ReportSectionSlug {
  for (const { slug, pattern } of SECTION_SLUGS) {
    if (pattern.test(rawHeading)) return slug;
  }
  return "other";
}

function stripWrappingSeparators(s: string): string {
  return s
    .replace(/^\s*\n+\s*---\s*\n+/, "\n")
    .replace(/\n\s*---\s*\n*\s*$/, "\n")
    .trim();
}

/**
 * Cleans up the score section body so the rendered card doesn't show
 * the breakdown bullets (the ScoreCard component renders those
 * visually) or any inline arithmetic the model occasionally emits.
 * Returns just the prose ("Why this band:" paragraph and similar).
 */
export function cleanScoreSectionBody(body: string): string {
  let out = body;
  // Strip the raw "Overall Score: 38/100 — Band" line (rendered as
  // huge number in the score card already).
  out = out.replace(/^\*?\*?Overall\s*Score[^\n]*\n?/im, "");
  // Strip any "(sum of the six category scores below)" parenthetical.
  out = out.replace(/\(\s*sum\s+of\s+the[^\)]*\)/gi, "");
  // Strip the "Breakdown:" block — from the line containing
  // "Breakdown" through the last category bullet.
  out = out.replace(
    /^[^\n]*Breakdown[^\n]*\n(?:[^\n]*\n?)+?(?=\n\s*\n|\*\*Why\s+this\s+band|$)/im,
    "",
  );
  // Strip arithmetic expressions in any form the model emits:
  //   • parenthetical: "(3 + 9 + 14 + 5 + 4 + 3 = 38)"
  //   • naked:         "3 + 9 + 14 + 7 + 7 + 5 = 45"
  //   • reverse:       "45 = 3 + 9 + 14 + 7 + 7 + 5"
  //   • bare ratio:    "= 38/100"
  out = out.replace(/\(\s*\d+(?:\s*[+]\s*\d+)+\s*=\s*\d+[^)]*\)/g, "");
  out = out.replace(/\b\d+(?:\s*[+]\s*\d+){2,}\s*=\s*\d+\b\s*\/?\s*\d{0,3}/g, "");
  out = out.replace(/\b\d+\s*=\s*\d+(?:\s*[+]\s*\d+){2,}\b/g, "");
  out = out.replace(/=\s*\d+\s*\/\s*100/g, "");
  // Drop any line whose content is now just an empty parenthetical or
  // an orphan "Math: " label left behind after the arithmetic was cut.
  out = out.replace(/^\s*\(\s*\)\s*$/gm, "");
  out = out.replace(/^\s*(?:Math|Sum|Total|Calculation)\s*:?\s*$/gim, "");
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Strip arithmetic/score-math from any rendered section body. The
 * ScoreCard already shows the breakdown visually; arithmetic
 * anywhere else in the report just looks unprofessional.
 */
export function stripScoreMath(body: string): string {
  let out = body;
  out = out.replace(/\(\s*\d+(?:\s*[+]\s*\d+)+\s*=\s*\d+[^)]*\)/g, "");
  out = out.replace(/\b\d+(?:\s*[+]\s*\d+){2,}\s*=\s*\d+\b\s*\/?\s*\d{0,3}/g, "");
  out = out.replace(/\b\d+\s*=\s*\d+(?:\s*[+]\s*\d+){2,}\b/g, "");
  out = out.replace(/=\s*\d+\s*\/\s*100/g, "");
  return out.replace(/\n{3,}/g, "\n\n");
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
