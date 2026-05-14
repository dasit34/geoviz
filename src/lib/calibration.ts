/**
 * Calibration helpers — shared by API routes and the dashboard UI.
 *
 * Calibration rows are real `AuditOrder` records tagged with a
 * recognizable `businessName` prefix and a small JSON metadata
 * payload stored in the existing `adminNotes` String? field. Keeping
 * the convention in one place lets callers stay decoupled from
 * Prisma's schema and makes it easy to migrate to a dedicated table
 * later without touching API + UI again.
 */

export const CALIBRATION_PREFIX = "[CAL]";

export type CalibrationNotes = {
  expected: number | null;
  notes?: string | null;
  /**
   * Operator-supplied industry slug. When present, the worker passes
   * this verbatim to `persistAuditIntelligence` as `industryRaw`,
   * which OVERRIDES the automatic industry inference. Absent / null
   * keeps the existing inference path. Optional — bulk batches that
   * don't supply it work exactly as before.
   *
   * Set per-URL by the bulk-queue POST (`industry` top-level default
   * or `industryByUrl` per-URL map). See
   * `src/app/api/admin/calibration/route.ts`.
   */
  industry?: string | null;
  /**
   * Operator-supplied benchmark cohort tag. Persisted to the
   * `AuditIntelligence.benchmarkTag` scalar (which is operator-set —
   * distinct from the system-set `benchmarkTags` JSON array). Used
   * to group bulk batches into named cohorts (e.g. `roofing_batch_1`,
   * `legal_cohort_may`) so calibration / benchmark queries can scope
   * by submission cohort instead of inferred industry.
   *
   * Absent / null leaves the intelligence row's `benchmarkTag`
   * unchanged. Optional — fully backwards compatible.
   */
  benchmarkTag?: string | null;
};

export function parseCalibrationNotes(
  raw: string | null | undefined,
): CalibrationNotes | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && "calibration" in obj) {
      const cal = (obj as Record<string, unknown>).calibration;
      if (cal && typeof cal === "object") {
        const c = cal as Record<string, unknown>;
        const expected =
          typeof c.expected === "number" ? c.expected : null;
        const notes = typeof c.notes === "string" ? c.notes : null;
        const industry =
          typeof c.industry === "string" && c.industry.trim().length > 0
            ? c.industry.trim()
            : null;
        const benchmarkTag =
          typeof c.benchmarkTag === "string" && c.benchmarkTag.trim().length > 0
            ? c.benchmarkTag.trim()
            : null;
        return { expected, notes, industry, benchmarkTag };
      }
    }
  } catch {
    // Not JSON, not calibration metadata — fall through.
  }
  return null;
}

export function stringifyCalibrationNotes(notes: CalibrationNotes): string {
  return JSON.stringify({
    calibration: {
      expected: notes.expected,
      notes: notes.notes ?? null,
      // Only emit operator tagging keys when present so existing
      // adminNotes JSON shape stays minimal for batches that don't
      // use the new fields.
      ...(notes.industry ? { industry: notes.industry } : {}),
      ...(notes.benchmarkTag ? { benchmarkTag: notes.benchmarkTag } : {}),
    },
  });
}
