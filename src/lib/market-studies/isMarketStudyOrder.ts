import { MARKET_STUDY_SESSION_PREFIX } from "./constants";

/**
 * True when an AuditOrder was created by the Market Study / Bulk Audit
 * flow. Detected by the synthetic `stripeSessionId` prefix — mirrors
 * `isSampleAudit()` (`src/lib/sample-audit.ts`) and the `calibration_`
 * convention.
 *
 * Use this to exclude market-study audits from any operator-facing
 * "queued audit age" alerting (their `reportQueuedAt` is deliberately
 * backdated — see `MARKET_STUDY_QUEUED_AT`). It is NOT needed for
 * customer-email suppression — that runs off the `.invalid` email via
 * `isCalibrationOrder()`.
 */
export function isMarketStudyOrder(
  stripeSessionId: string | null | undefined,
): boolean {
  return (
    typeof stripeSessionId === "string" &&
    stripeSessionId.startsWith(MARKET_STUDY_SESSION_PREFIX)
  );
}
