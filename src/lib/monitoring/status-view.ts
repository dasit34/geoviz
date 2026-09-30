/**
 * Customer status-page view model (pure).
 *
 * Scores come only from audits that completed AND were approved in the
 * existing review queue — the same rule as report delivery — so a
 * customer never sees an unreviewed number. Score change is the latest
 * approved score minus the previous one (the baseline one-time audit
 * counts as "previous" for the first monitoring audit).
 */
import { monitoringAccess, type MonitoringAccess } from "./access";
import type { MonitoringSubscriptionRecord } from "./types";

export type StatusAuditRow = {
  id: string;
  createdAt: Date;
  reportStatus: string;
  reviewStatus: string;
  previousAuditOrderId: string | null;
  overallScore: number | null;
  isBaseline: boolean;
};

export type StatusAuditView = {
  id: string;
  createdAt: Date;
  state: "report_ready" | "in_review" | "in_progress" | "failed";
  stateLabel: string;
  score: number | null;
  reportUrl: string | null;
  comparisonUrl: string | null;
  isBaseline: boolean;
};

export type MonitoringStatusView = {
  access: MonitoringAccess;
  websiteUrl: string;
  businessName: string | null;
  planKey: string;
  nextAuditAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  latestScore: number | null;
  previousScore: number | null;
  /** latest − previous; null unless both exist. */
  scoreChange: number | null;
  audits: StatusAuditView[];
  canManageBilling: boolean;
};

function auditState(row: StatusAuditRow): Pick<StatusAuditView, "state" | "stateLabel"> {
  if (row.reportStatus === "generated") {
    return row.reviewStatus === "approved"
      ? { state: "report_ready", stateLabel: "Report ready" }
      : { state: "in_review", stateLabel: "In expert review" };
  }
  if (row.reportStatus === "failed") return { state: "failed", stateLabel: "Delayed — we're on it" };
  return { state: "in_progress", stateLabel: "Audit in progress" };
}

export function buildMonitoringStatusView(
  sub: MonitoringSubscriptionRecord,
  rows: StatusAuditRow[],
  now: Date,
): MonitoringStatusView {
  const access = monitoringAccess(sub, now);
  const audits: StatusAuditView[] = [...rows]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => {
      const s = auditState(row);
      const ready = s.state === "report_ready";
      return {
        id: row.id,
        createdAt: row.createdAt,
        ...s,
        score: ready ? row.overallScore : null,
        reportUrl: ready ? `/report/${row.id}/print` : null,
        comparisonUrl: ready && row.previousAuditOrderId ? `/report/${row.id}/verification` : null,
        isBaseline: row.isBaseline,
      };
    });

  const scored = audits.filter((a) => a.state === "report_ready" && a.score !== null);
  const latestScore = scored[0]?.score ?? null;
  const previousScore = scored[1]?.score ?? null;

  return {
    access,
    websiteUrl: sub.websiteUrl,
    businessName: sub.businessName,
    planKey: sub.planKey,
    nextAuditAt: access.schedulingEnabled ? sub.nextAuditAt : null,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    latestScore,
    previousScore,
    scoreChange: latestScore !== null && previousScore !== null ? latestScore - previousScore : null,
    audits,
    canManageBilling: Boolean(sub.stripeCustomerId),
  };
}
