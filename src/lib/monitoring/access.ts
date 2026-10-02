/**
 * Subscription access rules — derived from the Stripe status at read
 * time, never stored separately.
 *
 * - Scheduling (new re-audits) runs only while Stripe says the customer
 *   is paid up: `active` or `trialing`. A subscription set to cancel at
 *   period end keeps scheduling until that date and never schedules an
 *   audit past it.
 * - The status page and every past report stay available in all states
 *   — completed audits are the customer's, whatever happens to billing.
 */
import type { MonitoringSubscriptionRecord } from "./types";

export type MonitoringAccess = {
  /** New scheduled audits may be queued right now. */
  schedulingEnabled: boolean;
  /** Customer-facing status label. */
  label: string;
  tone: "ok" | "warning" | "ended";
};

const SCHEDULABLE = new Set(["active", "trialing"]);

export function monitoringAccess(
  sub: Pick<MonitoringSubscriptionRecord, "status" | "cancelAtPeriodEnd" | "currentPeriodEnd">,
  now: Date,
): MonitoringAccess {
  const periodOver = sub.currentPeriodEnd !== null && sub.currentPeriodEnd.getTime() <= now.getTime();

  if (SCHEDULABLE.has(sub.status)) {
    if (sub.cancelAtPeriodEnd) {
      if (periodOver) return { schedulingEnabled: false, label: "Canceled", tone: "ended" };
      return { schedulingEnabled: true, label: "Active — cancels at period end", tone: "warning" };
    }
    return {
      schedulingEnabled: true,
      label: sub.status === "trialing" ? "Trial" : "Active",
      tone: "ok",
    };
  }
  switch (sub.status) {
    case "past_due":
      return { schedulingEnabled: false, label: "Payment issue — audits paused", tone: "warning" };
    case "unpaid":
      return { schedulingEnabled: false, label: "Unpaid — audits paused", tone: "warning" };
    case "incomplete":
      return { schedulingEnabled: false, label: "Awaiting payment", tone: "warning" };
    case "paused":
      return { schedulingEnabled: false, label: "Paused", tone: "warning" };
    case "canceled":
    case "incomplete_expired":
      return { schedulingEnabled: false, label: "Canceled", tone: "ended" };
    default:
      // Unknown future Stripe status: fail closed on scheduling.
      return { schedulingEnabled: false, label: "Inactive", tone: "warning" };
  }
}

/**
 * Should an audit scheduled for `scheduledFor` be queued? Requires
 * scheduling to be enabled now AND — for a subscription canceling at
 * period end — the audit to fall inside the paid period.
 */
export function mayQueueAuditFor(
  sub: Pick<MonitoringSubscriptionRecord, "status" | "cancelAtPeriodEnd" | "currentPeriodEnd">,
  scheduledFor: Date,
  now: Date,
): boolean {
  if (!monitoringAccess(sub, now).schedulingEnabled) return false;
  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd && scheduledFor.getTime() > sub.currentPeriodEnd.getTime()) {
    return false;
  }
  return true;
}
