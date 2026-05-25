/**
 * Content Depth + FAQ Quality — 15 pts.
 *
 * Reads:
 *   • preflight.readability     → word_count, parsedByReadability, fallbackUsed
 *   • intelligenceIngest        → aiReadabilityScore, contentDensity
 *   • preflight.schema          → has_faq_schema (FAQPage @type)
 *   • render (optional)         → rendered_text_length when raw is thin
 *
 * Ladder anchors:
 *   0–2   broken                 (no readable content OR < 100 words)
 *   3–5   minimal                 (100–300 words, no FAQ)
 *   6–9   default                 (300–700 words, no FAQ schema)
 *   10–12 strong                  (700+ words OR FAQ schema present)
 *   13–15 elite                   (deep content + FAQ schema + density signals)
 */

import type { CategoryScoreInternal, Evidence, Issue } from "../types";
import { CATEGORY_MAX } from "../types";

const EVIDENCE_USED = [
  "content.word_count",
  "content.has_faq_schema",
  "content.ai_readability_score",
  "content.fallback_used",
  "render.rendered_text_length",
];

function build(
  score: number,
  signals: string[],
  issues: Issue[],
  confidence: number,
): CategoryScoreInternal {
  return {
    key: "content",
    score,
    max: CATEGORY_MAX.content,
    signals,
    issues,
    reason: signals[0] ?? "No signal",
    evidence_used: EVIDENCE_USED,
    category_confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function scoreContent(evidence: Evidence): CategoryScoreInternal {
  const max = CATEGORY_MAX.content;
  const signals: string[] = [];
  const issues: Issue[] = [];

  const c = evidence.content;
  if (!c) {
    signals.push("Content evidence missing");
    issues.push({
      id: "content.thin_content",
      severity: "warning",
      category_key: "content",
      weight: max,
      message: "No content evidence captured — defaulting low",
    });
    return build(3, signals, issues, 0.4);
  }

  // Best-available word count. If readability fell back, the raw word
  // count is unreliable; prefer rendered_text_length / 5 as a heuristic.
  let wordCount = c.word_count ?? 0;
  if (
    (wordCount === 0 || c.fallback_used === true) &&
    evidence.render?.rendered_text_length
  ) {
    wordCount = Math.round(evidence.render.rendered_text_length / 5.5);
    signals.push(
      `Word count estimated from rendered text (${wordCount} words)`,
    );
  } else {
    signals.push(`Word count: ${wordCount}`);
  }

  let score = 3;
  if (wordCount >= 700) {
    score = 10;
    signals.push("Deep content (700+ words)");
  } else if (wordCount >= 300) {
    score = 7;
    signals.push("Moderate content depth");
  } else if (wordCount >= 100) {
    score = 4;
    signals.push("Thin content (100–300 words)");
    issues.push({
      id: "content.thin_content",
      severity: "warning",
      category_key: "content",
      weight: max,
      message: "Homepage content is thin — under 300 words",
    });
  } else {
    score = 1;
    issues.push({
      id: "content.thin_content",
      severity: "critical",
      category_key: "content",
      weight: max,
      message: "Almost no readable content on the homepage",
    });
  }

  // FAQ — a high-leverage signal for AI citation readiness.
  if (c.has_faq_schema) {
    signals.push("FAQPage schema present");
    score += 3;
  } else {
    issues.push({
      id: "content.no_faq",
      severity: "info",
      category_key: "content",
      weight: max,
      message: "No FAQ structure — AI has no clean blocks to quote",
    });
  }

  // Readability heuristic from the ingest layer (semantic headings,
  // section structure, markdown cleanliness). This is a 0..100 score.
  if (typeof c.ai_readability_score === "number") {
    if (c.ai_readability_score >= 75) {
      signals.push("High AI-readability score from ingest");
      score += 2;
    } else if (c.ai_readability_score >= 50) {
      signals.push("Moderate AI-readability score from ingest");
      score += 1;
    } else {
      issues.push({
        id: "content.low_readability",
        severity: "info",
        category_key: "content",
        weight: max,
        message: "Page structure is hard for AI to follow",
      });
    }
  }

  // Penalize fallback extraction — readability gave up.
  if (c.fallback_used === true) {
    signals.push("Readability fell back to <body> extraction");
    score -= 1;
  }

  score = clamp(score, 0, max);
  // Confidence — strong when readability parsed cleanly; weaker on
  // fallback or when no analyzer succeeded.
  let confidence = 0.7;
  if (c.parsed_by_readability === true) confidence = 0.95;
  else if (c.fallback_used === true) confidence = 0.55;
  return build(score, signals, issues, confidence);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
