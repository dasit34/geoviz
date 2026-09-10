/**
 * Market Study / Bulk Audit — shared constants.
 *
 * A "market study" bulk-queues one normal GeoViz audit per selected
 * lead onto the EXISTING `AuditOrder.reportStatus` queue. Nothing here
 * changes the worker, the scoring engine, Stripe, or the lead
 * outreach flow — the audits are plain `AuditOrder` rows distinguished
 * only by a synthetic `stripeSessionId` prefix.
 */

/**
 * Max audits queued per single "Run GeoViz Audits" action. Matches the
 * 25-cap every other live bulk lead action uses (qualify, enrich, Send
 * to Instantly). A study can still accumulate more via repeated runs.
 * Override with `MARKET_STUDY_MAX_BATCH`.
 */
export const MARKET_STUDY_MAX_BATCH: number = (() => {
  const raw = Number(process.env.MARKET_STUDY_MAX_BATCH);
  return Number.isFinite(raw) && raw >= 1 && raw <= 200 ? Math.floor(raw) : 25;
})();

/**
 * Synthetic `stripeSessionId` prefix for market-study audit orders.
 * Mirrors `self_audit_` (samples) and `calibration_` (Launch QA). Used
 * by `isMarketStudyOrder()` and to keep these rows out of Stripe
 * reconciliation.
 */
export const MARKET_STUDY_SESSION_PREFIX = "market_study_";

/**
 * `AuditOrder.email` for market-study audits. There is no customer —
 * these are prospect audits. The `.invalid` sentinel is recognized by
 * `isCalibrationOrder()` (see `src/lib/customer-failure-mapping.ts`),
 * which is the single gate that suppresses the worker's customer
 * failure/delay emails. `reviewStatus` also stays `"pending"` forever,
 * so the success-email path (admin review approve) never fires either.
 */
export const MARKET_STUDY_AUDIT_EMAIL = "market-study@geoviz.invalid";

/**
 * Backdated `reportQueuedAt` for market-study audits.
 *
 * The worker claims work with `orderBy: { reportQueuedAt: "desc" }`
 * (newest first) — a frozen surface we must not touch. Stamping every
 * market-study audit with a fixed far-past timestamp makes them always
 * lose that ordering race, so any real paying-customer order (whose
 * `reportQueuedAt` is `new Date()` at checkout) is always claimed
 * first. The batch drains only when the customer queue is empty.
 */
export const MARKET_STUDY_QUEUED_AT = new Date("2000-01-01T00:00:00.000Z");

/**
 * Skip a lead whose most recent market-study audit was queued/ran/
 * completed within this window — prevents re-spending on a business
 * that was just audited (and double-clicks). Failed audits are NOT
 * covered (retry is allowed).
 */
export const MARKET_STUDY_RECENT_AUDIT_DAYS = 30;
