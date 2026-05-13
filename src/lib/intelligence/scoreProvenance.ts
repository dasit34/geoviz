/**
 * V2 Stage 1 — score provenance (skeleton).
 *
 * For every major rubric dimension we persist a structured
 * "why this score" payload: the score itself (normalized 0..100),
 * a list of human-readable reasons, and a list of raw detected
 * signals. This is the explainability foundation — when an
 * operator asks "why did this audit score 41?", the answer lives
 * here, not buried in the markdown.
 *
 * Stage 1 ships the contract + a conservative builder that pulls
 * what we can from the existing `parseReportScoreBreakdown` output
 * + `parseScoreDrivers` output. Later stages refine the reason
 * extraction.
 *
 * Pure function — no DB, no SDK, no React.
 *
 * NOT consumed by scoring. Informational only — for operator
 * debugging + future drift-detection comparisons.
 */

import {
  parseReportSections,
  parseScoreDrivers,
  cleanScoreSectionBody,
  type ReportScore,
  type ScoreCategoryKey,
} from "@/lib/parse-report";

export type ScoreDimensionProvenance = {
  /** Normalized 0..100. Null when the rubric category didn't parse. */
  score: number | null;
  /** Original rubric-scale score (e.g. 14 out of 25). Null when unparsed. */
  scoreOriginal: number | null;
  /** The rubric category max (25, 20, etc.). */
  scoreMax: number;
  /**
   * Operator-facing explanations. Drawn from the audit's `✓`/`✗` drivers
   * + heuristic gap detection. May be empty when the markdown is sparse.
   */
  reasons: string[];
  /**
   * Raw signal phrases detected in the markdown. May overlap with `reasons`
   * but is kept separate for future drift-comparison (signals shift in
   * vocabulary; reasons stay stable).
   */
  signals: string[];
};

export type ScoreProvenance = {
  schema?: ScoreDimensionProvenance;
  crawlability?: ScoreDimensionProvenance;
  trust?: ScoreDimensionProvenance;
  content?: ScoreDimensionProvenance;
  aiReadability?: ScoreDimensionProvenance;
  recommendationReadiness?: ScoreDimensionProvenance;
};

/**
 * Mapping from internal rubric-category keys to the V2 provenance
 * dimension labels. Single source of truth — change here when the
 * dimensions evolve.
 */
const DIMENSION_FOR_CATEGORY: Record<ScoreCategoryKey, keyof ScoreProvenance> = {
  schema: "schema",
  crawler: "crawlability",
  trust: "trust",
  content: "content",
  brand: "aiReadability", // closest mapping in current rubric
  tech: "recommendationReadiness",
};

function toPercent(value: number | null, max: number): number | null {
  if (value === null || !Number.isFinite(value) || max <= 0) return null;
  const pct = Math.round((value / max) * 100);
  return Math.min(100, Math.max(0, pct));
}

export function buildScoreProvenance(args: {
  reportMarkdown: string;
  score: ReportScore;
}): ScoreProvenance {
  const md = args.reportMarkdown ?? "";
  if (md.trim().length === 0 || args.score.categories.length === 0) {
    return {};
  }

  // The score section's drivers (✓ / ✗ lines) are the operator-facing
  // reason text. They're already parsed by the existing helper.
  const sections = parseReportSections(md);
  const scoreSection = sections.sections.find((s) => s.slug === "score");
  const proseBody = scoreSection
    ? cleanScoreSectionBody(scoreSection.body)
    : "";
  const allDrivers = parseScoreDrivers(proseBody);

  // The driver lines aren't tagged by rubric category — they're a
  // single mixed list. For Stage 1 we attach the same global reason
  // list to every dimension, with the negative drivers as "reasons"
  // and positive drivers tracked as informational "signals". Later
  // stages can route drivers to specific dimensions via keyword
  // matching.
  const globalReasons = allDrivers.negative.slice(0, 3);
  const globalSignals = allDrivers.positive.slice(0, 3);

  const provenance: ScoreProvenance = {};
  for (const cat of args.score.categories) {
    const dimensionKey = DIMENSION_FOR_CATEGORY[cat.key];
    provenance[dimensionKey] = {
      score: toPercent(cat.score, cat.max),
      scoreOriginal: cat.score,
      scoreMax: cat.max,
      reasons: globalReasons,
      signals: globalSignals,
    };
  }
  return provenance;
}
