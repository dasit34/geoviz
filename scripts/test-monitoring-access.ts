/* eslint-disable no-console */
/**
 * scripts/test-monitoring-access.ts — subscription access rules and the
 * customer status-page view (scores only from reviewed audits).
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { DAY, T0, harness } from "./lib/monitoring-fakes";
import { mayQueueAuditFor, monitoringAccess } from "../src/lib/monitoring/access";
import { buildMonitoringStatusView, type StatusAuditRow } from "../src/lib/monitoring/status-view";
import type { MonitoringSubscriptionRecord } from "../src/lib/monitoring/types";

const h = harness("monitoring-access");
const periodEnd = new Date(T0.getTime() + 10 * DAY);
const base = { cancelAtPeriodEnd: false, currentPeriodEnd: periodEnd };

function sub(overrides: Partial<MonitoringSubscriptionRecord> = {}): MonitoringSubscriptionRecord {
  return {
    id: "msub_1", accessToken: "tok_0123456789abcdefghij", planKey: "monthly", stripePriceId: "price_x",
    stripeSubscriptionId: "sub_1", priorStripeSubscriptionIds: [], customerId: "cust_1", stripeCustomerId: "cus_1", stripeCheckoutSessionId: "cs_1",
    status: "active", cancelAtPeriodEnd: false, currentPeriodEnd: periodEnd, canceledAt: null, endedAt: null,
    lastSyncedAt: T0, websiteUrl: "https://rockroofing.example", businessName: "Rock Roofing",
    email: "o@r.example", businessId: "biz_1", baselineAuditOrderId: "o_base", cadenceDays: 30,
    nextAuditAt: new Date(T0.getTime() + 5 * DAY), lastAuditQueuedAt: null, welcomeEmailSentAt: T0, createdAt: T0,
    ...overrides,
  };
}

function row(id: string, daysAgo: number, overrides: Partial<StatusAuditRow> = {}): StatusAuditRow {
  return {
    id, createdAt: new Date(T0.getTime() - daysAgo * DAY), reportStatus: "generated", reviewStatus: "approved",
    previousAuditOrderId: null, overallScore: 50, isBaseline: false, ...overrides,
  };
}

(async () => {
  console.log("[monitoring-access] running...");

  await h.check("active and trialing schedule; every other Stripe status pauses scheduling", () => {
    assert.equal(monitoringAccess({ ...base, status: "active" }, T0).schedulingEnabled, true);
    assert.equal(monitoringAccess({ ...base, status: "trialing" }, T0).schedulingEnabled, true);
    for (const status of ["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled", "paused", "some_future_status"]) {
      assert.equal(monitoringAccess({ ...base, status }, T0).schedulingEnabled, false, status);
    }
  });

  await h.check("cancel-at-period-end keeps scheduling until period end, never past it", () => {
    const s = { status: "active", cancelAtPeriodEnd: true, currentPeriodEnd: periodEnd };
    assert.equal(monitoringAccess(s, T0).schedulingEnabled, true);
    assert.match(monitoringAccess(s, T0).label, /cancels at period end/);
    assert.equal(mayQueueAuditFor(s, new Date(T0.getTime() + 5 * DAY), T0), true);
    assert.equal(mayQueueAuditFor(s, new Date(T0.getTime() + 11 * DAY), T0), false, "audit after paid period");
    assert.equal(monitoringAccess(s, new Date(periodEnd.getTime() + 1)).schedulingEnabled, false);
  });

  await h.check("status view: latest, previous, and change come only from reviewed, completed audits", () => {
    const v = buildMonitoringStatusView(sub(), [
      row("o_base", 40, { overallScore: 41, isBaseline: true }),
      row("o_m1", 10, { overallScore: 48, previousAuditOrderId: "o_base" }),
      row("o_m2", 1, { overallScore: 99, reviewStatus: "pending" }), // generated, not yet approved
      row("o_m3", 0, { reportStatus: "queued", reviewStatus: "pending", overallScore: null }),
    ], T0);
    assert.equal(v.latestScore, 48);
    assert.equal(v.previousScore, 41);
    assert.equal(v.scoreChange, 7);
    assert.deepEqual(v.audits.map((a) => a.state), ["in_progress", "in_review", "report_ready", "report_ready"]);
    assert.equal(v.audits.find((a) => a.id === "o_m2")?.score, null, "unreviewed score never shown");
    assert.equal(v.audits.find((a) => a.id === "o_m1")?.reportUrl, "/report/o_m1/print");
    assert.equal(v.audits.find((a) => a.id === "o_m1")?.comparisonUrl, "/report/o_m1/verification");
    assert.equal(v.audits.find((a) => a.id === "o_m2")?.reportUrl, null);
    assert.equal(v.nextAuditAt?.getTime(), T0.getTime() + 5 * DAY);
    assert.equal(v.canManageBilling, true);
  });

  await h.check("status view: single reviewed audit → no fabricated previous score or change", () => {
    const v = buildMonitoringStatusView(sub(), [row("o_base", 3, { overallScore: 41 })], T0);
    assert.equal(v.latestScore, 41);
    assert.equal(v.previousScore, null);
    assert.equal(v.scoreChange, null);
  });

  await h.check("status view: past_due hides the next audit date but keeps reports", () => {
    const v = buildMonitoringStatusView(sub({ status: "past_due" }), [row("o_base", 3)], T0);
    assert.equal(v.nextAuditAt, null);
    assert.equal(v.audits[0]?.reportUrl, "/report/o_base/print");
    assert.match(v.access.label, /Payment issue/);
  });

  h.done();
})();
