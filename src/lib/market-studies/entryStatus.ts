import type { EntryStatusInput, MarketStudyEntryStatus } from "./types";

/**
 * Derive a `MarketStudyEntry`'s status from its linked audit order.
 * Pure. The entry never stores its own status column — the audit's
 * `reportStatus` is the single source of truth, so this can't drift.
 *
 *   skipReason set        → "skipped"
 *   no audit order        → "skipped" (shouldn't happen without a
 *                           skipReason, but fail safe)
 *   reportStatus mapping  → queued|pending  → "queued"
 *                           running          → "running"
 *                           generated        → "completed"
 *                           failed           → "failed"
 *                           anything else    → "queued"
 */
export function deriveEntryStatus(
  entry: EntryStatusInput,
): MarketStudyEntryStatus {
  if (entry.skipReason) return "skipped";
  const reportStatus = entry.auditOrder?.reportStatus;
  if (!reportStatus) return "skipped";
  switch (reportStatus) {
    case "generated":
      return "completed";
    case "running":
      return "running";
    case "failed":
      return "failed";
    case "queued":
    case "pending":
      return "queued";
    default:
      return "queued";
  }
}
