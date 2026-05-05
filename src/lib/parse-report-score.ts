/**
 * Best-effort parse of the GEO Score line out of an audit markdown so the
 * UI can show a real-looking score header without re-running the scoring
 * engine. Returns null when the audit format changes and we can't find a
 * recognizable "<n>/100" pattern.
 */
export function parseReportScore(
  md: string | null | undefined,
): { score: number; status: string | null } | null {
  if (!md) return null;
  // Prefer "<n>/100 — <status>" or "<n> / 100 - <status>" or with em-dash.
  // Status word matches the new 5-band rubric (Invisible / At Risk /
  // Needs Work / Competitive / AI-Ready) and legacy bands.
  const m =
    /\b(\d{1,3})\s*\/\s*100[ \t]*[—\-–:][ \t]*([A-Za-z][A-Za-z _\-]+)/.exec(md);
  if (m) {
    const score = Math.max(0, Math.min(100, Number(m[1])));
    const status = m[2]!.trim();
    return { score, status };
  }
  const m2 = /\b(\d{1,3})\s*\/\s*100\b/.exec(md);
  if (m2) return { score: Number(m2[1]), status: null };
  return null;
}

export type ScoreTone = "ok" | "warn" | "bad" | "muted";

export function scoreTone(score: number | null | undefined): ScoreTone {
  if (typeof score !== "number") return "muted";
  if (score >= 75) return "ok";
  if (score >= 50) return "warn";
  return "bad";
}
