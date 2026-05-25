/**
 * Score-band lookup for the deterministic engine.
 *
 * Thresholds are identical to `parse-report.ts:bandLabelForOverall`
 * and the legacy worker prompt:
 *
 *   0–25   → Invisible
 *   26–45  → At Risk
 *   46–65  → Needs Work
 *   66–80  → Competitive
 *   81–100 → AI-Ready
 *
 * FROZEN per CLAUDE.md "Scoring Freeze". Do not adjust.
 */

import type { Band } from "./types";

export function bandFor(overall: number): Band {
  if (overall >= 81) return "AI-Ready";
  if (overall >= 66) return "Competitive";
  if (overall >= 46) return "Needs Work";
  if (overall >= 26) return "At Risk";
  return "Invisible";
}
