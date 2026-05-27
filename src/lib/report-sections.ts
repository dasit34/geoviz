/**
 * Canonical section eyebrow strings for the GeoViz audit report.
 *
 * Why this file exists: prior to its introduction, the customer
 * print/PDF view (AuditReportContent.tsx) and the admin/internal
 * preview (ReportViewerClient.tsx) hardcoded their own section
 * numbers — the customer surface showed "Section 04 · Diagnosis"
 * while the admin preview showed "Section 02 · Diagnosis" for the
 * SAME content. Operators reviewing reports against a customer's
 * email had different vocabulary ("the issue in Section 02 / 04?").
 *
 * Both renderers now import from here. If you add a new section to
 * the report, add the eyebrow here first and reference it from the
 * renderers. The numbering reflects what the CUSTOMER sees in the
 * delivered PDF — that is the canonical surface.
 *
 * Guarded by scripts/test-eyebrow-consistency.ts, which fails if
 * either renderer hardcodes a "Section \d\d" literal outside of
 * this constants file.
 */

export const SECTION_EYEBROWS = {
  /** Section 01 — Executive summary block at the top of the report. */
  executiveSummary: "Section 01 · Executive summary",
  /** Section 02 — Six-category breakdown grid. */
  categoryBreakdown: "Section 02 · Category breakdown",
  /** Section 03 — Top-strengths card grid (high-score variant). */
  topStrengths: "Section 03 · Top strengths",
  /** Section 03 — Top-strengths card grid (low-score variant; same slot, gentler phrasing). */
  bestCurrentSignals: "Section 03 · Best current signals",
  /** Section 04 — Diagnosis / what's wrong. */
  diagnosis: "Section 04 · Diagnosis",
  /** Section 05 — Action plan / what to fix. */
  actionPlan: "Section 05 · Action plan",
  /** Section 06 — Business impact / what happens if ignored. */
  businessImpact: "Section 06 · Business impact",
  /** Appendix — technical details, raw signals. */
  technicalDetails: "Appendix · Technical details",
  /** Fallback for unrecognized parsed sections. */
  other: "Section",
} as const;

export type SectionEyebrowKey = keyof typeof SECTION_EYEBROWS;
