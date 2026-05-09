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
  /**
   * Plain-English description shown as a tooltip / hover help on the
   * customer-facing score card. Display-only — not consumed by the
   * audit prompt or any scoring logic.
   */
  tooltip?: string;
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
    short: "Recommendation Readiness",
    tooltip:
      "How clearly AI systems can identify who you are and what you do.",
    max: 25,
    pattern: /Structured\s*Data(?:\s*\/\s*Schema)?/i,
  },
  {
    key: "crawler",
    label: "AI Crawler Readiness",
    short: "Technical Accessibility",
    tooltip:
      "Whether AI systems can access and understand your website content.",
    max: 20,
    pattern: /AI\s*Crawler\s*Readiness/i,
  },
  {
    key: "trust",
    label: "Local Trust Signals",
    short: "Trust Signals",
    tooltip:
      "Whether reviews, citations, and consistent business info make AI confident enough to recommend you.",
    max: 20,
    pattern: /Local\s*Trust\s*Signals/i,
  },
  {
    key: "content",
    label: "Content Depth + FAQ Quality",
    short: "Content Depth",
    tooltip:
      "Whether your site has the depth of service and FAQ content AI can quote when answering customers.",
    max: 15,
    pattern: /Content\s*Depth(?:\s*\+\s*FAQ\s*Quality)?/i,
  },
  {
    key: "brand",
    label: "Brand / Entity Clarity",
    short: "Brand Presence",
    tooltip:
      "Whether AI can confidently identify your business as one consistent entity across the web.",
    max: 10,
    pattern: /Brand(?:\s*\/\s*Entity)?\s*Clarity/i,
  },
  {
    key: "tech",
    label: "Technical Accessibility",
    short: "AI Readability",
    tooltip:
      "How easily AI systems can retrieve and interpret your site structure and content.",
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
      tooltip: cat.tooltip,
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

/**
 * Plain-English label rendered to customers on the score card and the
 * report hero — easier to act on than the rubric's 5-band names. The
 * underlying thresholds are unchanged; this just collapses the two
 * lowest bands (Invisible + At Risk) into one customer-facing phrase
 * so the report doesn't open with a blunt "Invisible" verdict.
 *
 * Mapping:
 *   ≥ 81        → "Strong"
 *   66–80       → "Good"
 *   46–65       → "Needs Work"
 *   0–45        → "Limited Visibility"
 *   non-numeric → "Pending"
 *
 * The 5-band rubric names are still emitted by `bandLabelForOverall`
 * for any internal/admin/calibration surface that needs them.
 */
export function plainEnglishBandLabel(overall: number | null): string {
  if (typeof overall !== "number") return "Pending";
  if (overall >= 81) return "Strong";
  if (overall >= 66) return "Good";
  if (overall >= 46) return "Needs Work";
  return "Limited Visibility";
}

/**
 * Tone bucket for a category score given its score-to-max ratio.
 * Mirrors the score card's bar-fill colors so all category-level
 * surfaces (cards, radar, strengths) read the same way.
 */
export function categoryToneFromRatio(ratio: number): "ok" | "warn" | "bad" {
  if (ratio >= 0.7) return "ok";
  if (ratio >= 0.4) return "warn";
  return "bad";
}

/**
 * Strengths derived from the rubric output — categories that score
 * ≥ 70% of their max are surfaced as named strengths. The labels are
 * fixed per category key so different reports show the same wording
 * for the same category. NEVER invents data: if no category clears the
 * threshold the array is empty and the renderer shows an empty state.
 */
const STRENGTH_LABELS: Record<ScoreCategoryKey, string> = {
  schema: "Strong structured business identity",
  crawler: "Open to AI crawlers across major platforms",
  trust: "Solid trust signals — reviews, citations, consistent NAP",
  content: "Deep service and FAQ content for AI to quote",
  brand: "Clear, consistent brand identity across the web",
  tech: "Highly AI-readable site structure",
};
const STRENGTH_THRESHOLD = 0.7;

export type CategoryStrength = {
  key: ScoreCategoryKey;
  label: string;
  score: number;
  max: number;
};

export function deriveStrengths(score: ReportScore): CategoryStrength[] {
  return score.categories
    .filter(
      (c): c is ScoreCategory & { score: number } =>
        typeof c.score === "number" && c.score / c.max >= STRENGTH_THRESHOLD,
    )
    .map((c) => ({
      key: c.key,
      label: STRENGTH_LABELS[c.key] ?? c.label,
      score: c.score,
      max: c.max,
    }));
}

/**
 * Per-platform visibility — every row always emits a meaningful,
 * executive-tone label. Two-stage logic:
 *
 *   1. Hard override: if the audit markdown explicitly says a
 *      platform's crawler is blocked / disallowed / inaccessible,
 *      that platform shows "Crawler access blocked" (bad tone). This
 *      preserves real signal from the audit prose.
 *
 *   2. Score-derived: otherwise, each platform reads its two
 *      "primary lens" rubric categories (the dimensions that
 *      platform's known behavior cares about most) and emits a
 *      label tied to the lens-pair's combined ratio. Different
 *      lenses per platform → labels naturally differ across rows
 *      even when overall scores look similar.
 *
 * Never emits placeholder phrases ("Mentioned in audit",
 * "Referenced", "Insufficient signal detected"). When the rubric
 * itself failed to extract any scores at all (extremely rare), the
 * label is "Visibility profile pending" — still specific.
 */
export type PlatformName = "ChatGPT" | "Claude" | "Gemini" | "Perplexity";
export type PlatformStatus = {
  platform: PlatformName;
  label: string;
  tone: "ok" | "warn" | "bad" | "muted";
};

type PlatformLens = {
  /** Bot / keyword patterns used only for the explicit-block override. */
  patterns: RegExp[];
  /**
   * The two rubric categories that most reflect this platform's known
   * citation behavior. Combined ratio over (sum scores / sum max)
   * decides the tier.
   */
  primaryKeys: [ScoreCategoryKey, ScoreCategoryKey];
  /** Tier-tagged labels. 3–8 words, executive tone. */
  labels: {
    ok: string;
    warnStrong: string;
    warnWeak: string;
    bad: string;
  };
};

const PLATFORM_LENS: Record<PlatformName, PlatformLens> = {
  ChatGPT: {
    patterns: [/GPTBot/i, /OAI[-\s]?SearchBot/i, /OpenAI/i, /\bChatGPT\b/i],
    primaryKeys: ["tech", "crawler"],
    labels: {
      ok: "Strong AI readability",
      warnStrong: "Moderate AI readability",
      warnWeak: "Limited AI readability",
      bad: "Weak AI readability",
    },
  },
  Claude: {
    patterns: [/ClaudeBot/i, /Anthropic/i, /\bClaude\b/i],
    primaryKeys: ["content", "brand"],
    labels: {
      ok: "Strong entity recognition",
      warnStrong: "Adequate content depth",
      warnWeak: "Entity recognition limited",
      bad: "Weak entity recognition",
    },
  },
  Gemini: {
    patterns: [/Google[-\s]?Extended/i, /\bGemini\b/i, /AI\s+Overviews/i],
    primaryKeys: ["schema", "trust"],
    labels: {
      ok: "Strong schema compatibility",
      warnStrong: "Some structured signals present",
      warnWeak: "Limited business identity signals",
      bad: "Business identity unclear",
    },
  },
  Perplexity: {
    patterns: [/PerplexityBot/i, /\bPerplexity\b/i],
    primaryKeys: ["trust", "content"],
    labels: {
      ok: "Strong citation footprint",
      warnStrong: "Moderate citation footprint",
      warnWeak: "Limited citation signals detected",
      bad: "Poor authority footprint",
    },
  },
};

const PLATFORM_ORDER: PlatformName[] = [
  "ChatGPT",
  "Claude",
  "Gemini",
  "Perplexity",
];

const BLOCKED_RE =
  /\b(disallow|blocked?|cannot reach|does not reach|inaccessible|denied|forbidden)\b/i;

type Tier = "ok" | "warnStrong" | "warnWeak" | "bad";

function tierFromRatio(ratio: number): Tier {
  if (ratio >= 0.75) return "ok";
  if (ratio >= 0.55) return "warnStrong";
  if (ratio >= 0.4) return "warnWeak";
  return "bad";
}

function toneFromTier(tier: Tier): "ok" | "warn" | "bad" {
  if (tier === "ok") return "ok";
  if (tier === "bad") return "bad";
  return "warn";
}

/**
 * Returns true when the markdown explicitly describes the given
 * platform's crawler as blocked. Window is ±200 chars around the
 * first platform-keyword hit.
 */
function isPlatformBlockedInMarkdown(
  md: string,
  patterns: RegExp[],
): boolean {
  let earliest: { index: number; len: number } | null = null;
  for (const pat of patterns) {
    const m = pat.exec(md);
    if (!m) continue;
    if (!earliest || m.index < earliest.index) {
      earliest = { index: m.index, len: m[0].length };
    }
  }
  if (!earliest) return false;
  const window = md.slice(
    Math.max(0, earliest.index - 200),
    Math.min(md.length, earliest.index + earliest.len + 200),
  );
  return BLOCKED_RE.test(window);
}

export function derivePlatformVisibility(
  md: string | null | undefined,
  score: ReportScore,
): PlatformStatus[] {
  // If the rubric itself produced no scored categories at all, no per-
  // platform inference is possible. Emit a specific (non-placeholder)
  // muted label so the row is still meaningful.
  const allScoresNull = score.categories.every((c) => c.score === null);

  return PLATFORM_ORDER.map((platform) => {
    const lens = PLATFORM_LENS[platform];

    // 1. Explicit-block override from the audit prose.
    if (md && isPlatformBlockedInMarkdown(md, lens.patterns)) {
      return {
        platform,
        label: "Crawler access blocked",
        tone: "bad" as const,
      };
    }

    // 2. Score-derived label using the platform's lens-pair.
    if (allScoresNull) {
      return {
        platform,
        label: "Visibility profile pending",
        tone: "muted" as const,
      };
    }

    let totalScore = 0;
    let totalMax = 0;
    for (const key of lens.primaryKeys) {
      const cat = score.categories.find((c) => c.key === key);
      if (!cat) continue;
      totalScore += cat.score ?? 0;
      totalMax += cat.max;
    }
    const ratio = totalMax > 0 ? totalScore / totalMax : 0;
    const tier = tierFromRatio(ratio);
    return {
      platform,
      label: lens.labels[tier],
      tone: toneFromTier(tier),
    };
  });
}

/**
 * Returns true when the report markdown describes a heavily JS-rendered,
 * SPA, or marketplace-style site — the cases where AI readability is
 * structurally harder regardless of effort. Pure heuristic over the
 * existing audit prose; does NOT touch the audit logic itself.
 */
export function detectJsHeavySite(md: string | null | undefined): boolean {
  if (!md) return false;
  return /javascript[-\s]?rendered|client[-\s]?side\s+render|single[-\s]?page\s+app|\bSPA\b|js[-\s]?heavy|app\s+shell|app[-\s]style|client[-\s]?side\s+only/i.test(
    md,
  );
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
 * Strip the most common inline markdown markers from a one-line
 * string so it can render cleanly inside contexts that don't tolerate
 * block elements — the hero one-liner, executive-glance card titles,
 * labeled-field labels, etc. NOT a markdown sanitizer; just a
 * pragmatic "render this as plain text" helper.
 *
 * Removes: **bold**, __bold__, *italic*, _italic_, `code`, [text](url)
 * (keeping the visible text), heading marks at line start, and
 * collapses any double-asterisk leftovers.
 */
export function stripInlineMarkdown(s: string | null | undefined): string {
  if (!s) return "";
  let out = s;
  // Markdown links → visible text only.
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Bold / italic / inline code emphasis markers.
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, "$1");
  out = out.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, "$1");
  out = out.replace(/`([^`]+)`/g, "$1");
  // Heading markers at line start.
  out = out.replace(/^#{1,6}\s+/gm, "");
  // Collapse residual whitespace.
  return out.replace(/\s+/g, " ").trim();
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
