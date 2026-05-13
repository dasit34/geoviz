/**
 * V2 Stage 1 — AI readability heuristics (skeleton).
 *
 * Composite 0..100 score derived from observable signals in the
 * audit markdown. Stage 1 ships a conservative scaffold; later
 * stages refine the weighting. Returns null when the markdown is
 * empty or too short to score reliably.
 *
 * The score is explainable — every contributing signal is returned
 * alongside so operators can see WHY this audit scored where it did.
 *
 * Pure function — no DB, no SDK, no React.
 *
 * NOT consumed by scoring. NOT consumed by report rendering. Pure
 * intelligence-layer output.
 */

export type ReadabilityResult = {
  /** 0..100 composite score. null when input is too sparse. */
  score: number | null;
  /** Approximate words per discoverable page (≈ markdown length / 6). */
  contentDensity: number | null;
  /** Sub-signals that contributed to the score. Always populated. */
  signals: {
    hasSemanticHeadings: boolean;
    hasFaqSection: boolean;
    hasServicesSection: boolean;
    hasLocationMention: boolean;
    hasReviewsSection: boolean;
    hasSchemaMention: boolean;
    markdownStructureClean: boolean;
  };
};

const EMPTY: ReadabilityResult = {
  score: null,
  contentDensity: null,
  signals: {
    hasSemanticHeadings: false,
    hasFaqSection: false,
    hasServicesSection: false,
    hasLocationMention: false,
    hasReviewsSection: false,
    hasSchemaMention: false,
    markdownStructureClean: false,
  },
};

// Minimum markdown size we'll attempt to score — below this the
// signal is too noisy. Audits at this length almost always failed
// or returned a degenerate response.
const MIN_MARKDOWN_BYTES = 500;

export function computeReadability(args: {
  reportMarkdown: string;
}): ReadabilityResult {
  const md = args.reportMarkdown ?? "";
  if (md.trim().length < MIN_MARKDOWN_BYTES) return EMPTY;

  const signals = {
    // Semantic headings — at least two distinct H2/H3 sections.
    hasSemanticHeadings:
      (md.match(/^##\s+/gm)?.length ?? 0) >= 2,
    // FAQ structure — the audit prose mentions FAQ presence/absence.
    hasFaqSection: /\bFAQ\s*(Page)?\b|frequently\s+asked\s+questions/i.test(md),
    // Services structure — the audit notes service pages.
    hasServicesSection:
      /service\s+(pages?|areas?)|service\s+offerings?/i.test(md),
    // Location signal — NAP / address / service-area mention.
    hasLocationMention:
      /service\s+area|\bNAP\b|address|location|city|county/i.test(md),
    // Reviews / trust signals.
    hasReviewsSection:
      /reviews?|ratings?|testimonials?|aggregaterating/i.test(md),
    // Schema mention (informational — doesn't gate the score on its own).
    hasSchemaMention:
      /\b(schema|json[-\s]?ld|structured\s+data|localbusiness)\b/i.test(md),
    // Markdown cleanliness — has section structure, no raw HTML dumps.
    markdownStructureClean:
      !/(<\/[a-z]+>)|(<[a-z]+\s)/i.test(md.slice(0, 4000)),
  };

  // Score weighting — 7 signals, each worth ~14 points. Composite
  // capped at 100. Conservative: no signal can push the score above
  // 100, and missing signals don't go negative.
  let score = 0;
  if (signals.hasSemanticHeadings) score += 16;
  if (signals.hasFaqSection) score += 14;
  if (signals.hasServicesSection) score += 14;
  if (signals.hasLocationMention) score += 12;
  if (signals.hasReviewsSection) score += 14;
  if (signals.hasSchemaMention) score += 14;
  if (signals.markdownStructureClean) score += 16;
  score = Math.min(100, score);

  // Content density — naive words-per-page estimate. The audit
  // markdown averages ~6 chars/word; assumed "page" ≈ 600 words.
  // This is a heuristic — V2 detection module may refine.
  const wordCount = Math.round(md.length / 6);
  const contentDensity = Math.round(wordCount / 5); // ~5 typical pages

  return {
    score,
    contentDensity,
    signals,
  };
}
