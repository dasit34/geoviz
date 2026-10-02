/**
 * One scheduler tick — queues the re-audits that are due.
 *
 * A due subscription gets an ordinary queued AuditOrder
 * (orderType "MONITORING_RECHECK") that the existing worker, review
 * queue, report pages, and customer emails already handle. Safe to run
 * concurrently / repeatedly:
 *   - the order's stripeSessionId is deterministic per (subscription,
 *     due date) and @unique, so a race creates at most one order;
 *   - a subscription with an audit still queued/running is skipped;
 *   - access is re-checked against the synced Stripe status.
 */
import { mayQueueAuditFor } from "./access";
import { isMonitoringEnabled } from "./plans";
import { nextAuditAfter, scheduledRunSessionId } from "./schedule";
import type { MonitoringStore, MonitoringSubscriptionRecord } from "./types";

export const DEFAULT_MAX_PER_TICK = 3;

export type SchedulerTickResult =
  | { outcome: "disabled" }
  | {
      outcome: "ran";
      examined: number;
      queued: string[];
      alreadyQueued: string[];
      skippedInFlight: string[];
      skippedNoAccess: string[];
      trackingErrors: string[];
      websiteErrors: string[];
    };

/**
 * Optional prompt-tracking hook, run for each due subscription with the
 * same `scheduledFor` key as its re-audit (so a retried tick resumes the
 * same cycle and never re-pays for answers — see tracking/cycle.ts).
 */
export type TrackingCycleHook = (sub: MonitoringSubscriptionRecord, cycleKey: string) => Promise<unknown>;

/**
 * Optional website-tracking hook: ENQUEUES scan jobs only (same cycleKey;
 * idempotent). Scans run separately (`npm run monitoring:website-scans`),
 * so a slow or failing website never delays the re-audit or tracking.
 */
export type WebsiteScanEnqueueHook = (sub: MonitoringSubscriptionRecord, cycleKey: string) => Promise<unknown>;

export async function runMonitoringSchedulerTick(deps: {
  store: MonitoringStore;
  now: () => Date;
  env?: Record<string, string | undefined>;
  maxPerTick?: number;
  runTrackingCycle?: TrackingCycleHook;
  enqueueWebsiteScans?: WebsiteScanEnqueueHook;
}): Promise<SchedulerTickResult> {
  if (!isMonitoringEnabled(deps.env ?? process.env)) return { outcome: "disabled" };

  const now = deps.now();
  const due = await deps.store.findDue(now, deps.maxPerTick ?? DEFAULT_MAX_PER_TICK);
  const result = {
    outcome: "ran" as const,
    examined: due.length,
    queued: [] as string[],
    alreadyQueued: [] as string[],
    skippedInFlight: [] as string[],
    skippedNoAccess: [] as string[],
    trackingErrors: [] as string[],
    websiteErrors: [] as string[],
  };

  for (const sub of due) {
    const scheduledFor = sub.nextAuditAt;
    if (!scheduledFor) continue;
    if (!mayQueueAuditFor(sub, scheduledFor, now)) {
      result.skippedNoAccess.push(sub.id);
      continue;
    }
    if (await deps.store.hasInFlightAudit(sub.id)) {
      result.skippedInFlight.push(sub.id);
      continue;
    }
    const created = await deps.store.createScheduledAuditOrder({
      subscription: sub,
      stripeSessionId: scheduledRunSessionId(sub.id, scheduledFor),
      queuedAt: now,
    });
    (created.outcome === "created" ? result.queued : result.alreadyQueued).push(sub.id);
    if (deps.runTrackingCycle) {
      try {
        await deps.runTrackingCycle(sub, scheduledFor.toISOString());
      } catch (err) {
        // Tracking is resumable (same cycleKey) via the manual trigger; it
        // must never block the re-audit schedule.
        console.error(`[monitoring-scheduler] tracking cycle failed for ${sub.id}:`, err);
        result.trackingErrors.push(sub.id);
      }
    }
    if (deps.enqueueWebsiteScans) {
      try {
        await deps.enqueueWebsiteScans(sub, scheduledFor.toISOString());
      } catch (err) {
        console.error(`[monitoring-scheduler] website scan enqueue failed for ${sub.id}:`, err);
        result.websiteErrors.push(sub.id);
      }
    }
    await deps.store.advanceSchedule(sub.id, nextAuditAfter(scheduledFor, sub.cadenceDays, now), now);
  }
  return result;
}
