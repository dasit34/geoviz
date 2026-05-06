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
        return { expected, notes };
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
    },
  });
}
