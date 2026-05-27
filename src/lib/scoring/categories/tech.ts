/**
 * Technical Accessibility — 10 pts.
 *
 * Reads:
 *   • preflight.readability     → parsed_by_readability, fallback_used, has_h1, text_length
 *   • render (optional)         → blank_shell_risk, hydration_detected, client_only_content_detected
 *
 * Ladder anchors:
 *   0–2   broken                 (blank shell OR no readable content at all)
 *   3–4   minimal                 (extracted only via fallback, no h1)
 *   5–6   default                 (readable + h1, but client-side heavy)
 *   7–8   strong                  (clean readable extraction + h1)
 *   9–10  elite                   (clean readable + h1 + server-rendered + no hydration risk)
 */

import type { CategoryScoreInternal, Evidence, Issue } from "../types";
import { CATEGORY_MAX } from "../types";

const EVIDENCE_USED = [
  "content.parsed_by_readability",
  "content.fallback_used",
  "content.has_h1",
  "content.text_length",
  "render.blank_shell_risk",
  "render.client_only_content_detected",
  "render.hydration_detected",
];

function build(
  score: number,
  signals: string[],
  issues: Issue[],
  confidence: number,
): CategoryScoreInternal {
  return {
    key: "tech",
    score,
    max: CATEGORY_MAX.tech,
    signals,
    issues,
    reason: signals[0] ?? "No signal",
    evidence_used: EVIDENCE_USED,
    category_confidence: Math.max(0, Math.min(1, confidence)),
  };
}

export function scoreTech(evidence: Evidence): CategoryScoreInternal {
  const max = CATEGORY_MAX.tech;
  const signals: string[] = [];
  const issues: Issue[] = [];

  const c = evidence.content;
  const r = evidence.render;

  // Blank shell — fatal for the category.
  if (r?.blank_shell_risk === true) {
    signals.push("Blank-shell risk detected — raw HTML mostly empty");
    issues.push({
      id: "tech.blank_shell",
      severity: "critical",
      category_key: "tech",
      weight: max,
      message: "Page is a near-empty shell that requires JavaScript to render",
    });
    return build(2, signals, issues, 0.95);
  }

  if (!c) {
    signals.push("Content extraction did not run");
    return build(3, signals, issues, 0.3);
  }

  let score = 5;

  if (c.parsed_by_readability === true) {
    signals.push("Readability successfully extracted an article");
    score += 2;
  } else if (c.fallback_used === true) {
    signals.push("Readability fell back to bare <body> extraction");
    score -= 1;
    issues.push({
      id: "tech.fallback_extraction",
      severity: "warning",
      category_key: "tech",
      weight: max,
      message: "Page structure forces fallback extraction — no semantic landmarks",
    });
  }

  if (c.has_h1 === true) {
    signals.push("H1 detected");
    score += 2;
  } else if (c.has_h1 === false) {
    issues.push({
      id: "tech.no_h1",
      severity: "warning",
      category_key: "tech",
      weight: max,
      message: "No H1 detected on the homepage",
    });
    score -= 1;
  }

  if (r?.client_only_content_detected === true) {
    signals.push("Critical content rendered client-side only");
    issues.push({
      id: "tech.client_only_content",
      severity: "critical",
      category_key: "tech",
      weight: max,
      message: "Body text only appears after JavaScript runs",
    });
    score -= 3;
  }

  if (
    r?.hydration_detected === true &&
    r?.client_only_content_detected !== true
  ) {
    signals.push("SPA hydration detected, but content present pre-hydration");
  }

  // Healthy text length reward (tech-accessibility is partly a content
  // proxy — a tiny body suggests structural issues even without a shell).
  // Ramps from text_length=1000 (bonus 0) to text_length=4000 (bonus +1).
  // Previously a binary +1 at >= 4000, which created a 1-pt cliff at one
  // byte of difference. Anchor preserved at text_length=4000 → +1. Signal
  // text is gated at the same threshold so the audit trail still reflects
  // "robust" only when the page genuinely crosses the original mark.
  if (typeof c.text_length === "number") {
    const textLengthBonus = Math.max(
      0,
      Math.min(1, (c.text_length - 1_000) / 3_000),
    );
    score += textLengthBonus;
    if (c.text_length >= 4_000) signals.push("Robust text length in raw HTML");
  }

  score = clamp(score, 0, max);
  let confidence = 0.7;
  if (c.parsed_by_readability === true) confidence = 0.9;
  else if (c.fallback_used === true) confidence = 0.55;
  return build(score, signals, issues, confidence);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
