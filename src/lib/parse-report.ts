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
  // What's Holding You Back (current) + Top 3 Issues + Why Customers
  // Don't See You (legacy patterns kept for old reports).
  {
    slug: "why",
    pattern:
      /What['’]s\s+Holding\s+You\s+Back|Top\s+3\s+Issues|Why\s+(?:Customers\s+Don|Your\s+Business\s+Is|You['’]re)/i,
  },
  // What To Fix First (current) + Top 3 Fixes (legacy).
  {
    slug: "fix-first",
    pattern: /What\s+to\s+Fix\s+First|Top\s+3\s+Fixes/i,
  },
  // Business Impact (new) + What Happens If You Fix This (legacy)
  {
    slug: "happens",
    pattern: /Business\s+Impact|What\s+Happens\s+If/i,
  },
  // GEO Foundation Fix (new) + Done-For-You Fix (legacy)
  {
    slug: "cta",
    pattern: /GEO\s+Foundation\s+Fix|Done[-\s]?For[-\s]?You\s+Fix/i,
  },
  // Technical Appendix (new) + Technical Details (legacy)
  {
    slug: "tech-details",
    pattern: /Technical\s+(?:Appendix|Details)/i,
  },
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

export type EnumeratedItem = {
  title: string;
  body: string;
};

/**
 * Parses an enumerated body (the kind sections 2 and 3 produce — top 3
 * issues / top 3 fixes) into individual {title, body} pairs so each
 * one can render as its own sub-card.
 *
 * Tolerates two emission patterns the model uses interchangeably:
 *   1. `### N. Headline\n  body…` (preferred)
 *   2. `N. **Headline**\n  body…` (numbered list with bold)
 *
 * Returns an empty array when neither pattern matches — caller falls
 * back to plain markdown so we never lose copy.
 */
export function parseEnumeratedItems(body: string): EnumeratedItem[] {
  const cleaned = body.trim();
  if (!cleaned) return [];

  // Pattern 1: ### N. Headline
  const h3Re = /^###\s+(?:(\d+)\.\s+)?(.+?)\s*$/gm;
  const h3Matches: Array<{ index: number; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = h3Re.exec(cleaned)) !== null) {
    h3Matches.push({ index: m.index, title: m[2].replace(/\*\*/g, "").trim() });
  }
  if (h3Matches.length >= 2) {
    const out: EnumeratedItem[] = [];
    for (let i = 0; i < h3Matches.length; i++) {
      const cur = h3Matches[i];
      const next = h3Matches[i + 1];
      const start = cleaned.indexOf("\n", cur.index) + 1;
      const end = next ? next.index : cleaned.length;
      out.push({ title: cur.title, body: cleaned.slice(start, end).trim() });
    }
    return out;
  }

  // Pattern 2: N. **Headline**
  const olRe = /^\s*(\d+)\.\s+\*\*(.+?)\*\*\s*$/gm;
  const olMatches: Array<{ index: number; title: string }> = [];
  while ((m = olRe.exec(cleaned)) !== null) {
    olMatches.push({ index: m.index, title: m[2].trim() });
  }
  if (olMatches.length >= 2) {
    const out: EnumeratedItem[] = [];
    for (let i = 0; i < olMatches.length; i++) {
      const cur = olMatches[i];
      const next = olMatches[i + 1];
      const start = cleaned.indexOf("\n", cur.index) + 1;
      const end = next ? next.index : cleaned.length;
      out.push({ title: cur.title, body: cleaned.slice(start, end).trim() });
    }
    return out;
  }

  return [];
}

export type IssueSeverity = {
  label: "Critical" | "High Impact" | "Quick Win" | "Trust Signal";
  tone: "critical" | "high" | "quick" | "trust";
};

export type FixPriority = {
  severity: IssueSeverity;
  priority: "P0 — Do First" | "P1 — High Value" | "P2 — Polish";
  impactLabel: string;
};

/**
 * Render-time severity inference for issue cards. Reads only the
 * existing report title + body (no prompt changes) and assigns one
 * of four severity tones using keyword heuristics. Imperfect by
 * design — the goal is a useful default badge on every card so
 * sections feel like a consultant-grade dashboard, not a wall of
 * paragraphs.
 */
export function inferIssueSeverity(title: string, body: string): IssueSeverity {
  const text = `${title} ${body}`.toLowerCase();
  // Order matters — narrow critical first, then trust (so "no reviews"
  // doesn't fall through to high-impact), then quick wins, then schema.
  if (
    /\b(noindex|inaccessible|404|fatal|crawl[er]*\s+block|user-agent\s*[:*].*disallow|broken\s+(site|home|page)|disallow\s*:\s*\/|citation\s+bot.*block|all\s+bots\s+block)\b/.test(
      text,
    )
  ) {
    return { label: "Critical", tone: "critical" };
  }
  if (
    /(reviews?|ratings?|license[ds]?|certif|warrant(y|ies)|guarantee[ds]?|trust\s|nap\s|service\s*area|contact\s*info|years\s+in\s+business|established\s+\d{4})/.test(
      text,
    )
  ) {
    return { label: "Trust Signal", tone: "trust" };
  }
  if (
    /(title\s+tag|meta\s+description|sitemap|alt\s+text|missing\s+h1|heading\s+structure|broken\s+link|page\s+speed|mobile\s+viewport)/.test(
      text,
    )
  ) {
    return { label: "Quick Win", tone: "quick" };
  }
  if (
    /(schema|json[-\s]?ld|llms\.txt|markup|aggregaterating|faq.?page|localbusiness|crawler|robots\.txt)/.test(
      text,
    )
  ) {
    return { label: "High Impact", tone: "high" };
  }
  return { label: "High Impact", tone: "high" };
}

/**
 * Render-time priority + estimated-impact inference for fix cards.
 * Layered on top of the issue-severity helper so a fix inherits its
 * tone, then maps that tone to a P0 / P1 / P2 priority and a short
 * impact phrase.
 */
export function inferFixPriority(title: string, body: string): FixPriority {
  const severity = inferIssueSeverity(title, body);
  let priority: FixPriority["priority"];
  let impactLabel: string;
  switch (severity.tone) {
    case "critical":
      priority = "P0 — Do First";
      impactLabel = "Highest priority";
      break;
    case "quick":
      priority = "P0 — Do First";
      impactLabel = "Quick win";
      break;
    case "high":
      priority = "P1 — High Value";
      impactLabel = "Strong gain";
      break;
    case "trust":
      priority = "P1 — High Value";
      impactLabel = "Trust boost";
      break;
  }
  return { severity, priority, impactLabel };
}

export type LabeledField = { label: string; content: string };

export type FixMeta = {
  priority: { label: string; tone: "critical" | "high" | "medium" | "quick" } | null;
  difficulty: { label: string; tone: "easy" | "moderate" | "technical" } | null;
  foundationFix: { yes: boolean; label: string } | null;
  rest: LabeledField[];
};

/**
 * Pulls out the three meta-fields the new section-3 prompt template
 * emits per fix — Priority, Difficulty, and "Can GeoViz Foundation
 * Fix handle this?" — so they can be rendered as visual chips. The
 * remaining fields (What to do / Why it matters / Expected impact)
 * stay in `rest` for the definition-list grid.
 *
 * Tolerant of model formatting drift: case-insensitive match on the
 * label, value normalised before tone/yes detection, missing fields
 * return null without breaking the rest.
 */
export function extractFixMeta(fields: LabeledField[]): FixMeta {
  const norm = (s: string) => s.toLowerCase().trim();
  let priority: FixMeta["priority"] = null;
  let difficulty: FixMeta["difficulty"] = null;
  let foundationFix: FixMeta["foundationFix"] = null;
  const rest: LabeledField[] = [];

  for (const f of fields) {
    const label = norm(f.label);
    const value = f.content.trim();
    if (label === "priority") {
      const v = norm(value);
      let tone: NonNullable<FixMeta["priority"]>["tone"] = "high";
      if (/critical/.test(v)) tone = "critical";
      else if (/quick\s*win/.test(v)) tone = "quick";
      else if (/high/.test(v)) tone = "high";
      else if (/medium/.test(v)) tone = "medium";
      priority = { label: value, tone };
      continue;
    }
    if (label === "difficulty") {
      const v = norm(value);
      let tone: NonNullable<FixMeta["difficulty"]>["tone"] = "moderate";
      if (/easy/.test(v)) tone = "easy";
      else if (/moderate/.test(v)) tone = "moderate";
      else if (/technical|hard|complex/.test(v)) tone = "technical";
      difficulty = { label: value, tone };
      continue;
    }
    if (
      /^can\s+geoviz\s+foundation\s+fix\s+handle\s+this/i.test(label) ||
      label === "foundation fix" ||
      label === "geoviz handles this"
    ) {
      const yes = /^\s*y(es)?\b/i.test(value);
      foundationFix = { yes, label: yes ? "Yes" : "No" };
      continue;
    }
    rest.push(f);
  }

  return { priority, difficulty, foundationFix, rest };
}

/**
 * Detects the model's "**Label** — content" / "**Label**: content"
 * pattern that appears under each issue / fix sub-card and returns
 * structured fields so the renderer can present a clean labeled
 * grid instead of three stacked paragraphs.
 *
 * Only fires when at least 2 such lines are detected; otherwise
 * returns [] and the caller falls back to plain markdown.
 */
export function parseLabeledFields(body: string): LabeledField[] {
  const fieldRe =
    /^\s*(?:[-*]\s+)?\*\*([^*\n]+?)\*\*\s*[—\-:]\s*(.+?)\s*$/gm;
  const out: LabeledField[] = [];
  let m: RegExpExecArray | null;
  while ((m = fieldRe.exec(body)) !== null) {
    const label = m[1].trim();
    const content = m[2].trim();
    if (label && content) out.push({ label, content });
  }
  return out.length >= 2 ? out : [];
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
