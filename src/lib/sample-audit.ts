/**
 * sample-audit.ts — identify public sample audits.
 *
 * Sample/self-audit rows are seeded with a synthetic Stripe session id of the
 * form `self_audit_<slug>_<timestamp>` (see `scripts/seed-public-samples.ts`).
 * Real paid orders carry a genuine Stripe `cs_...` session id. This is the one
 * stable marker that distinguishes a public marketing sample from a paying
 * customer's order, so report-view rate limiters can let samples through
 * without weakening protection on real audit/order generation.
 */
export const SAMPLE_SESSION_PREFIX = "self_audit_";

export function isSampleAudit(
  stripeSessionId: string | null | undefined,
): boolean {
  return (
    typeof stripeSessionId === "string" &&
    stripeSessionId.startsWith(SAMPLE_SESSION_PREFIX)
  );
}
