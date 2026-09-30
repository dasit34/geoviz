/**
 * Pure scheduling math for monitoring re-audits.
 */
import { MONITORING_SESSION_PREFIX } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Deterministic synthetic `AuditOrder.stripeSessionId` for one scheduled
 * run. `stripeSessionId` is @unique, so two scheduler ticks racing on the
 * same due subscription can create at most ONE order — the loser gets a
 * unique-constraint error, treated as "already queued".
 */
export function scheduledRunSessionId(subscriptionId: string, scheduledFor: Date): string {
  return `${MONITORING_SESSION_PREFIX}${subscriptionId}_${scheduledFor.toISOString()}`;
}

/**
 * Next due date after queuing the run that was due at `scheduledFor`.
 * Normally `scheduledFor + cadence`; if the scheduler was down long
 * enough that this is already in the past, restart the cadence from
 * `now` instead of queuing a burst of catch-up audits.
 */
export function nextAuditAfter(scheduledFor: Date, cadenceDays: number, now: Date): Date {
  const next = new Date(scheduledFor.getTime() + cadenceDays * DAY_MS);
  if (next.getTime() <= now.getTime()) return new Date(now.getTime() + cadenceDays * DAY_MS);
  return next;
}
