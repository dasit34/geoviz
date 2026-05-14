/**
 * Report markdown sanitizer.
 *
 * Two regressions this fixes:
 *
 *   1. Model "thinking" preamble leaks into the customer-facing
 *      report (e.g. "Now I have sufficient evidence...",
 *      "The search results returned...", "I need to directly fetch...",
 *      "Let me compile the findings..."). The audit prompt asks the
 *      model to produce a clean report but the model sometimes emits
 *      a chain-of-thought preamble before the `# GEO Visibility Report`
 *      heading. Anything before that heading is internal narration
 *      and MUST NOT be shown to the customer.
 *
 *   2. The model is asked to interpolate "today's date" into the
 *      report header. With its training-cutoff bias it often emits a
 *      stale year (e.g. "Generated: May 14, 2025" on a 2026 audit).
 *      Customer-facing date must come from the SERVER, never from
 *      the model. This sanitizer replaces the model's date with the
 *      actual server-side `reportGeneratedAt` timestamp.
 *
 * Pure function. No I/O. Idempotent — running it twice produces the
 * same output as running it once.
 *
 * Used by the worker before persisting `reportMarkdown` to the DB.
 * The web report renderer, PDF renderer, email preview, and admin
 * preview all read the persisted column, so a single sanitization
 * pass at the worker covers every customer-facing surface.
 *
 * NOT used by `src/lib/reporting/generateMarkdownReport.ts` (the
 * legacy / sample-report path) — that one already uses
 * `report.generatedAt` from a structured object, so it has no model
 * to sanitize.
 */

/** Canonical title for the customer-facing audit. */
const REPORT_TITLE_REGEX = /^#\s+GEO Visibility Report\s*$/m;

/**
 * Preamble-pattern detector. Used as a defensive check when no
 * report title exists. Matches typical model preambles like
 * "I have / I need / The search / Let me / Now I / Based on /
 * Looking at / First, I will / I'll start by".
 */
const PREAMBLE_OPENER = /^(?:I\s|I'll|I'm|I will|Now I|Let me|Let's|First,|Based on|Looking at|The search|The fetches?|My findings|The site|The report|Here(?:'s|\s)|OK|Okay,?|Right,?|So,?)/i;

/**
 * Date placeholder regex. Captures the value after "Generated:"
 * (the model's free-text date). Replaces it with a server-formatted
 * date built from `reportGeneratedAt`.
 *
 * The header is templated as:
 *   **Site:** <url>  ·  **Generated:** <model-supplied date>
 *
 * The "**Generated:**" label is canonical; anything after it on
 * the same line (until the next bold marker or newline) gets
 * replaced.
 */
const GENERATED_LINE_REGEX =
  /(\*\*Generated:\*\*\s*)([^\n*]*?)(\s*(?:\*\*|$))/m;

/** Format a Date as "Month D, YYYY" — matches the existing in-report style. */
function formatReportDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Sanitize raw model output into customer-ready report markdown.
 *
 * Steps:
 *   1. Strip everything before the first `# GEO Visibility Report`
 *      heading. If the heading appears, anything before it is the
 *      model's preamble.
 *   2. If the heading does NOT appear at all (rare; usually a
 *      malformed run), fall back to stripping leading lines that
 *      look like preamble (lines matching `PREAMBLE_OPENER`).
 *   3. Replace the `**Generated:** ...` line with the
 *      server-supplied date formatted as "Month D, YYYY".
 *
 * @param raw - The raw model output, joined from text blocks.
 * @param reportGeneratedAt - The server-side timestamp the row was
 *        written at. Used to render the in-report date.
 * @returns Sanitized markdown ready for DB persistence.
 */
export function sanitizeReportMarkdown(
  raw: string,
  reportGeneratedAt: Date,
): string {
  if (!raw || raw.trim().length === 0) return "";

  let md = raw;

  // ── 1. Strip preamble ──
  const titleMatch = md.match(REPORT_TITLE_REGEX);
  if (titleMatch && typeof titleMatch.index === "number") {
    // Drop everything before the heading.
    md = md.slice(titleMatch.index);
  } else {
    // No heading found — defensive fallback: drop leading lines
    // that look like preamble, stop at the first line that doesn't.
    const lines = md.split(/\r?\n/);
    let i = 0;
    while (
      i < lines.length &&
      (lines[i]!.trim().length === 0 || PREAMBLE_OPENER.test(lines[i]!))
    ) {
      i += 1;
    }
    md = lines.slice(i).join("\n");
  }

  // ── 2. Replace the Generated date line ──
  const dateStr = formatReportDate(reportGeneratedAt);
  if (GENERATED_LINE_REGEX.test(md)) {
    md = md.replace(GENERATED_LINE_REGEX, (_match, prefix, _old, suffix) => {
      // `prefix` = "**Generated:** "  (preserve trailing whitespace)
      // `suffix` = trailing "**" or end-of-line marker
      return `${prefix}${dateStr}${suffix}`;
    });
  }

  return md.trim() + "\n";
}

/**
 * Defensive predicate — returns true if the input still contains
 * obvious preamble after one sanitizer pass. Used by tests +
 * lightweight diagnostics. Treats the presence of `PREAMBLE_OPENER`
 * BEFORE the report title as preamble.
 */
export function containsPreambleBeforeTitle(md: string): boolean {
  if (!md) return false;
  const titleMatch = md.match(REPORT_TITLE_REGEX);
  const head = titleMatch && typeof titleMatch.index === "number"
    ? md.slice(0, titleMatch.index)
    : md;
  const firstNonEmpty = head
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstNonEmpty) return false;
  return PREAMBLE_OPENER.test(firstNonEmpty);
}

/**
 * Defensive predicate — returns the year shown in the report's
 * "Generated:" header line, or null if no parseable year is found.
 * Used by tests to assert the in-report year matches the server.
 */
export function extractGeneratedYear(md: string): number | null {
  const m = md.match(GENERATED_LINE_REGEX);
  if (!m) return null;
  const yearMatch = (m[2] ?? "").match(/(20\d{2})/);
  if (!yearMatch) return null;
  return parseInt(yearMatch[1]!, 10);
}
