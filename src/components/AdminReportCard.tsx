"use client";

import { useCallback, useEffect, useState } from "react";
import { ReportViewerClient } from "./ReportViewerClient";
import { parseReportScore, scoreTone } from "@/lib/parse-report-score";
import {
  deriveProcessingStatus,
  failureReasonDescription,
  type FailureReason,
} from "@/lib/processing-status";
import { costTone } from "@/lib/pricing";

type Order = {
  id: string;
  email: string;
  businessName: string | null;
  websiteUrl: string;
  competitorUrl: string | null;
  paymentStatus: string;
  reportStatus: string;
  reportMarkdown: string | null;
  reportError: string | null;
  failureReason: string | null;
  retryCount: number;
  lastRetryAt: string | null;
  // Cost telemetry (Phase 1.5) — internal admin-only.
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostUsd: number | null;
  modelUsed: string | null;
  workerRuntimeMs: number | null;
  reportGeneratedAt: string | null;
  reportSentToCustomerAt: string | null;
  reviewStatus: string;
  adminNotes: string | null;
  qualityScore: number | null;
  sentTo: string | null;
  sentCc: string | null;
  amount: number;
  currency: string;
  createdAt: string;
};

const REVIEW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "needs_changes", label: "Needs changes" },
];

// Pilot-launch sanity checklist. Each item is a manual visual confirmation
// the operator does on every order before sending. The "recipient" item is
// also wired to the Send-button gate; the others are nudges.
const LAUNCH_QA_ITEMS: Array<{ key: string; label: string }> = [
  { key: "biz", label: "Business name correct" },
  { key: "url", label: "Website URL correct" },
  { key: "clean", label: "Report looks clean" },
  { key: "halluc", label: "No obvious hallucinations" },
  { key: "pdf", label: "PDF / download works" },
  { key: "recipient", label: "Email recipient confirmed" },
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Cross-Model Intelligence telemetry summary for the admin card.
 * Null when the consensus gate was off for this order's run (or
 * intelligence row not yet written). Read-only — surfaced as small
 * pills so the operator can see which providers ran without
 * opening the DB.
 */
export type ValidatorTelemetry = {
  providers: Array<{ name: string; status: string }>;
  consensusComputed: boolean;
} | null;

export function AdminReportCard({
  adminKey,
  order,
  validatorTelemetry = null,
}: {
  adminKey: string;
  order: Order;
  validatorTelemetry?: ValidatorTelemetry;
}) {
  const [reportStatus, setReportStatus] = useState(order.reportStatus);
  const [markdown, setMarkdown] = useState<string | null>(order.reportMarkdown);
  const [reportError, setReportError] = useState<string | null>(
    order.reportError,
  );
  const [reportGeneratedAt, setReportGeneratedAt] = useState<string | null>(
    order.reportGeneratedAt,
  );
  const [reportSentAt, setReportSentAt] = useState<string | null>(
    order.reportSentToCustomerAt,
  );
  const [reviewStatus, setReviewStatus] = useState(order.reviewStatus);
  const [adminNotes, setAdminNotes] = useState(order.adminNotes ?? "");
  const [qualityScore, setQualityScore] = useState<string>(
    typeof order.qualityScore === "number" ? String(order.qualityScore) : "",
  );
  const [sentTo, setSentTo] = useState<string | null>(order.sentTo);
  const [sentCc, setSentCc] = useState<string | null>(order.sentCc);

  // Recipient override + confirmation gate. The input starts pre-filled with
  // the order's original email; the operator can edit, but Send stays
  // disabled until they click "Confirm recipient". Editing the input again
  // resets the confirmation so they can't drift from a confirmed value.
  const [recipientEmail, setRecipientEmail] = useState(order.email);
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [confirmedAddress, setConfirmedAddress] = useState<string | null>(null);

  // Six pilot-QA checkboxes. Local state, not persisted — they reset on
  // page refresh by design (pre-flight checks every send, not once-per-order).
  const [qaChecks, setQaChecks] = useState<Record<string, boolean>>({});

  const [expanded, setExpanded] = useState(false);
  const [reviewExpanded, setReviewExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [marking, setMarking] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err">("ok");

  /**
   * Single source of truth for state updates. Every report-side state
   * transition flows through this helper, regardless of whether it came
   * from a POST response or a polling GET. Logs every update so network
   * → state propagation is observable in the console.
   */
  const applyOrderUpdate = useCallback(
    (server: {
      reportStatus?: string;
      reportMarkdown?: string | null;
      reportError?: string | null;
      reportGeneratedAt?: string | null;
      reportSentToCustomerAt?: string | null;
      reviewStatus?: string;
      adminNotes?: string | null;
      qualityScore?: number | null;
      sentTo?: string | null;
      sentCc?: string | null;
    }) => {
      if (server.reportStatus !== undefined) {
        setReportStatus(server.reportStatus);
        // Auto-expand the report when status flips to generated.
        if (server.reportStatus === "generated") setExpanded(true);
      }
      if (server.reportMarkdown !== undefined) setMarkdown(server.reportMarkdown);
      if (server.reportError !== undefined) setReportError(server.reportError);
      if (server.reportGeneratedAt !== undefined)
        setReportGeneratedAt(server.reportGeneratedAt);
      if (server.reportSentToCustomerAt !== undefined)
        setReportSentAt(server.reportSentToCustomerAt);
      if (server.reviewStatus !== undefined) setReviewStatus(server.reviewStatus);
      if (server.adminNotes !== undefined)
        setAdminNotes(server.adminNotes ?? "");
      if (server.qualityScore !== undefined)
        setQualityScore(
          typeof server.qualityScore === "number"
            ? String(server.qualityScore)
            : "",
        );
      if (server.sentTo !== undefined) setSentTo(server.sentTo);
      if (server.sentCc !== undefined) setSentCc(server.sentCc);
      console.log(
        `[admin-card] orderId=${order.id} reportStatus=${server.reportStatus ?? reportStatus}`,
      );
    },
    [order.id, reportStatus],
  );

  // Poll the GET endpoint every 5s while the row is queued or running so
  // the dashboard auto-reconciles with whatever the worker writes back.
  // Stops automatically the moment status becomes terminal (generated /
  // failed / pending / etc.) because the effect re-runs and exits early.
  useEffect(() => {
    if (reportStatus !== "queued" && reportStatus !== "running") return;
    let cancelled = false;
    // Pause clock — when the server returns 429, set this to a future
    // timestamp and every subsequent setInterval tick returns
    // immediately until the clock passes. Avoids the prior retry-loop
    // behavior where the poll would keep hammering the rate-limited
    // endpoint every 5s with no back-off. Naturally resumes once the
    // clock passes; no manual restart needed.
    let pausedUntilMs = 0;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() < pausedUntilMs) return;
      try {
        const res = await fetch(
          `/api/admin/orders/${order.id}?key=${encodeURIComponent(adminKey)}`,
          { headers: { "x-admin-secret": adminKey }, cache: "no-store" },
        );
        if (cancelled) return;
        if (res.status === 429) {
          // Honor Retry-After (seconds). Falls back to 30s when the
          // header is missing. Logs a single line per pause; the next
          // tick after the pause naturally retries.
          const retryAfter =
            Number(res.headers.get("Retry-After")) || 30;
          pausedUntilMs = Date.now() + retryAfter * 1000;
          console.warn(
            `[admin-card] poll throttled — pausing ${retryAfter}s orderId=${order.id}`,
          );
          return;
        }
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          order?: Parameters<typeof applyOrderUpdate>[0];
        };
        if (data.success && data.order) {
          applyOrderUpdate(data.order);
        }
      } catch (err) {
        console.error("[admin-card] poll error:", err);
      }
    };
    tick();
    // 8s interval (was 5s) — 38% fewer requests with no perceptible
    // delay for the operator. Coupled with the 600/5min API limit
    // for /api/admin/orders/[id], multiple concurrent jobs + admin
    // tabs comfortably fit under the cap.
    const id = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [reportStatus, order.id, adminKey, applyOrderUpdate]);

  const post = (
    path: string,
    body: Record<string, unknown> = {},
  ): Promise<Response> =>
    fetch(`${path}?key=${encodeURIComponent(adminKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": adminKey,
      },
      body: JSON.stringify(body),
    });

  // Refetch the order from the server. Used after Run / Send / Review so
  // the UI reflects DB truth, not optimistic guesses.
  const refetchOrder = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/admin/orders/${order.id}?key=${encodeURIComponent(adminKey)}`,
        { headers: { "x-admin-secret": adminKey }, cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        order?: Parameters<typeof applyOrderUpdate>[0];
      };
      if (data.success && data.order) {
        console.log(
          `[admin-card] refetchOrder orderId=${order.id} dbReportStatus=${data.order.reportStatus}`,
        );
        applyOrderUpdate(data.order);
      }
    } catch (err) {
      console.error("[admin-card] refetch error:", err);
    }
  }, [order.id, adminKey, applyOrderUpdate]);

  const onRun = async (force = false) => {
    setRunning(true);
    setMessage("Queueing audit…");
    setTone("warn");
    console.log(
      `[admin-card] onRun POST orderId=${order.id} force=${force}`,
    );
    try {
      const res = await post(
        `/api/admin/orders/${order.id}/run-geo-audit`,
        force ? { force: true } : {},
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        status?: string;
        message?: string;
        error?: string;
        queuedAt?: string;
        previousStatus?: string;
        newStatus?: string;
        dbHost?: string;
      };
      console.log(
        `[admin-card] onRun response orderId=${order.id} httpStatus=${res.status} success=${data.success} newStatus=${data.newStatus} dbHost=${data.dbHost}`,
      );

      if (res.ok && data.success && data.status === "queued") {
        setTone("ok");
        // Take the server's reported newStatus, not a hardcoded optimistic value.
        applyOrderUpdate({
          reportStatus: data.newStatus ?? "queued",
          reportError: null,
        });
        // Server is source of truth — refetch to confirm DB state. Polling
        // useEffect will then continue every 5s while status is queued/running.
        await refetchOrder();
        setMessage(
          `Queued (was ${data.previousStatus}). Worker picks up in ~12s.`,
        );
      } else if (res.status === 409) {
        // Either already-generated (use force=true) or already in flight.
        setTone("warn");
        setMessage(data.message ?? data.error ?? "Already in progress.");
        if (data.status === "queued" || data.status === "running") {
          applyOrderUpdate({ reportStatus: data.status });
        }
        // Refetch anyway so UI reflects whatever the DB actually has.
        await refetchOrder();
      } else if (res.status === 401) {
        setTone("err");
        setMessage(
          "Unauthorized — refresh the page with a valid ?key=ADMIN_SECRET.",
        );
      } else {
        setTone("err");
        setMessage(`Queue failed: ${data.error ?? `HTTP ${res.status}`}`);
        // Don't optimistically mark failed — the worker handles real failures.
        // Just refetch so UI shows what's actually in the DB.
        await refetchOrder();
      }
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const onMarkReviewed = async () => {
    setMarking(true);
    setMessage("Marking reviewed…");
    setTone("warn");
    try {
      const parsedScore =
        qualityScore.trim() === "" ? null : Number(qualityScore.trim());
      const res = await post(`/api/admin/orders/${order.id}/review`, {
        reviewStatus: "approved",
        adminNotes,
        qualityScore: parsedScore,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        applyOrderUpdate({ reviewStatus: "approved" });
        setTone("ok");
        setMessage("Marked reviewed.");
      } else {
        setTone("err");
        setMessage(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setMarking(false);
    }
  };

  const onSend = async (force = false) => {
    const recipient = (confirmedAddress ?? recipientEmail).trim().toLowerCase();
    if (
      !force &&
      !confirm(
        `Send the generated report to ${recipient}?\nA copy will be CC'd to the admin notification address (set via AUDIT_NOTIFICATION_EMAIL).`,
      )
    ) {
      return;
    }
    setSending(true);
    setMessage("Sending email…");
    setTone("warn");
    try {
      const res = await post(`/api/admin/orders/${order.id}/send-report`, {
        ...(force ? { force: true } : {}),
        recipientEmail: recipient,
      });
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        to?: string;
        cc?: string | null;
        sentAt?: string;
        resendId?: string | null;
        error?: string;
        message?: string;
      };
      if (res.ok) {
        setTone("ok");
        const id = data.resendId ? ` · id ${data.resendId}` : "";
        setMessage(`Sent to ${data.to ?? recipient}${id}`);
        applyOrderUpdate({
          reportSentToCustomerAt: data.sentAt ?? new Date().toISOString(),
          sentTo: data.to ?? recipient,
          sentCc: data.cc ?? null,
        });
      } else if (res.status === 409) {
        setTone("warn");
        setMessage(data.message ?? data.error ?? "Already sent.");
      } else {
        setTone("err");
        setMessage(`Send failed: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  const onConfirmRecipient = () => {
    const trimmed = recipientEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setTone("err");
      setMessage(`Invalid recipient email: "${trimmed}"`);
      return;
    }
    setConfirmedAddress(trimmed);
    setRecipientConfirmed(true);
    setQaChecks((prev) => ({ ...prev, recipient: true }));
    setTone("ok");
    setMessage(`Recipient confirmed: ${trimmed}`);
  };

  const onChangeRecipient = (value: string) => {
    setRecipientEmail(value);
    if (recipientConfirmed) {
      setRecipientConfirmed(false);
      setConfirmedAddress(null);
      setQaChecks((prev) => ({ ...prev, recipient: false }));
    }
  };

  const toggleQaCheck = (key: string) => {
    setQaChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const saveReview = async (overrideStatus?: string) => {
    setSavingReview(true);
    setMessage(null);
    const status = overrideStatus ?? reviewStatus;
    const parsedScore =
      qualityScore.trim() === "" ? null : Number(qualityScore.trim());
    if (
      parsedScore !== null &&
      (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10)
    ) {
      setTone("err");
      setMessage("Quality score must be 0–10 (or empty).");
      setSavingReview(false);
      return;
    }
    try {
      const res = await post(`/api/admin/orders/${order.id}/review`, {
        reviewStatus: status,
        adminNotes,
        qualityScore: parsedScore,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setTone("ok");
        setMessage("Review saved.");
        if (overrideStatus) applyOrderUpdate({ reviewStatus: overrideStatus });
      } else {
        setTone("err");
        setMessage(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingReview(false);
    }
  };

  const businessLabel = order.businessName ?? order.websiteUrl;
  const anyBusy = running || sending || marking || savingReview;
  // The "recipient" checklist item is auto-controlled by the confirm button —
  // every other item is a manual checkbox. All six must be ticked + the
  // review must be approved before Send is allowed to fire.
  const checklistComplete = LAUNCH_QA_ITEMS.every((it) =>
    it.key === "recipient" ? recipientConfirmed : Boolean(qaChecks[it.key]),
  );
  // Pilot-launch send gate: every condition must hold. The `title` attribute
  // on the Send button explains exactly which one is blocking.
  const sendBlockReason: string | null = anyBusy
    ? null // button is in busy state, the spinner explains itself
    : reportStatus !== "generated"
      ? "No generated report. Run the audit first."
      : reviewStatus !== "approved"
        ? "Review not approved. Mark the report approved before sending."
        : !recipientConfirmed
          ? "Recipient email not confirmed. Confirm the address below."
          : !checklistComplete
            ? "Launch QA checklist incomplete. Tick every item before sending."
            : null;
  const sendDisabled = anyBusy || sendBlockReason !== null;
  const markDisabled =
    anyBusy || reportStatus !== "generated" || reviewStatus === "approved";
  const scoreInfo = parseReportScore(markdown);

  // Single per-order status banner — the headline an operator should be able
  // to read from across the room. Distinct from the granular pills (paid /
  // audit / review / sent) which are still useful for at-a-glance scanning.
  //
  // Operational vs result split:
  //   • Operational state is derived from (reportStatus + failureReason +
  //     retryCount) via `deriveProcessingStatus`. Banner shows the
  //     category (TIMEOUT / FETCH_FAILED / etc.) instead of a generic
  //     "Audit failed" so the operator can act without opening logs.
  //   • Result classification (Weak / Needs Improvement / Strong /
  //     Excellent visibility) is computed from the score and surfaced
  //     elsewhere — it's an outcome, not a processing state.
  const processingStatus = deriveProcessingStatus({
    reportStatus,
    failureReason: order.failureReason,
    retryCount: order.retryCount,
  });
  const banner: { text: string; tone: "err" | "ok" | "ready" | "warn" | "info" | "muted" } =
    reportStatus === "failed"
      ? {
          text: order.failureReason
            ? `${processingStatus.replace(/_/g, " ")} — ${failureReasonDescription(order.failureReason as FailureReason)}`
            : "Audit failed — needs attention",
          tone: "err",
        }
      : reportSentAt
        ? { text: "Sent to customer", tone: "ok" }
        : reviewStatus === "approved" && reportStatus === "generated"
          ? { text: "Approved — ready to send", tone: "ready" }
          : reportStatus === "generated"
            ? { text: "Report ready — needs review", tone: "warn" }
            : reportStatus === "running"
              ? { text: "Generating report", tone: "info" }
              : reportStatus === "queued"
                ? {
                    text:
                      order.retryCount > 0
                        ? `Retrying — attempt ${order.retryCount + 1} (after ${(order.failureReason ?? "transient failure").replace(/_/g, " ")})`
                        : "Queued — waiting on worker",
                    tone: "warn",
                  }
                : { text: "Paid — report not generated", tone: "muted" };
  const bannerClass =
    banner.tone === "err"
      ? "border-red-400/40 bg-red-500/[0.08] text-red-200"
      : banner.tone === "ok"
        ? "border-emerald-300/40 bg-emerald-300/[0.08] text-emerald-200"
        : banner.tone === "ready"
          ? "border-emerald-300/50 bg-emerald-300/[0.12] text-emerald-100"
          : banner.tone === "warn"
            ? "border-amber-300/40 bg-amber-300/[0.08] text-amber-100"
            : banner.tone === "info"
              ? "border-sky-300/40 bg-sky-300/[0.08] text-sky-100"
              : "border-white/15 bg-white/[0.03] text-white/70";

  return (
    <article className="rounded-lg border border-white/10 bg-ink-900/60 shadow-card">
      {/* Header — single source of identity for the order. */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 p-5">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-white leading-tight">
            {businessLabel}
          </h3>
          <a
            href={order.websiteUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="muted mt-1 block text-xs break-all hover:text-accent"
          >
            {order.websiteUrl}
          </a>
          <p className="mt-2 text-xs text-white/65">
            <span className="font-medium text-white/85">{order.email}</span>
            {order.competitorUrl ? (
              <>
                {" · vs "}
                <a
                  href={order.competitorUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-accent"
                >
                  {order.competitorUrl}
                </a>
              </>
            ) : null}
          </p>
        </div>
        <StatusBadges
          paymentStatus={order.paymentStatus}
          reportStatus={reportStatus}
          reviewStatus={reviewStatus}
          sentAt={reportSentAt}
          createdAt={order.createdAt}
          amount={order.amount}
        />
      </header>

      {/* Single status banner — one short headline per order. The granular
          pills in the header still show paid / audit / review / sent for
          at-a-glance scanning; this is the loud, one-liner version. */}
      <div className={`border-b ${bannerClass} px-5 py-3`}>
        <p className="text-sm font-semibold">{banner.text}</p>
      </div>

      {/* Cross-Model Intelligence telemetry — per-provider validator
          status pills + consensus-computed badge. Null when the
          consensus gate was off for this order's worker run. Read-only. */}
      <ValidatorTelemetryStrip telemetry={validatorTelemetry} />

      {/* Action row — strict logical order:
          Run GEO Audit → View Report → Mark Reviewed → Send Report. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
        <button
          type="button"
          disabled={anyBusy}
          onClick={() =>
            onRun(reportStatus === "generated" || reportStatus === "failed")
          }
          className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running
            ? "Queueing…"
            : reportStatus === "generated"
              ? "Re-run GEO Audit"
              : reportStatus === "failed"
                ? "Re-run GEO Audit"
                : reportStatus === "queued"
                  ? "Queued (worker pending)"
                  : reportStatus === "running"
                    ? "Worker running…"
                    : "Run GEO Audit"}
        </button>
        <button
          type="button"
          disabled={!markdown || anyBusy}
          onClick={() => setExpanded((v) => !v)}
          className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {expanded ? "Hide Report" : "View Report"}
        </button>
        <a
          href={`/api/report/${order.id}/pdf?key=${encodeURIComponent(adminKey)}`}
          target="_blank"
          rel="noreferrer noopener"
          className={
            !markdown || reportStatus !== "generated"
              ? "btn-ghost text-sm pointer-events-none opacity-50"
              : "btn-ghost text-sm"
          }
          aria-disabled={!markdown || reportStatus !== "generated"}
          onClick={(e) => {
            if (!markdown || reportStatus !== "generated") {
              e.preventDefault();
            } else {
              console.log(
                `[admin-card] download PDF orderId=${order.id}`,
              );
            }
          }}
        >
          Download PDF
        </a>
        <button
          type="button"
          disabled={markDisabled}
          onClick={onMarkReviewed}
          className={
            reviewStatus === "approved"
              ? "btn-ghost text-sm border-emerald-300/30 text-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
              : "btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {marking
            ? "Marking…"
            : reviewStatus === "approved"
              ? "Reviewed ✓"
              : "Mark Reviewed"}
        </button>
        <button
          type="button"
          disabled={sendDisabled}
          onClick={() => onSend(false)}
          title={sendBlockReason ?? undefined}
          className="btn-ghost text-sm border-emerald-300/30 text-emerald-200 hover:border-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending
            ? "Sending…"
            : reportSentAt
              ? "Resend Report"
              : "Send Report"}
        </button>
        {reportSentAt ? (
          <button
            type="button"
            disabled={sendDisabled}
            onClick={() => onSend(true)}
            className="text-[11px] text-white/40 underline-offset-4 hover:text-white/70 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            force resend
          </button>
        ) : null}
        {message ? (
          <span
            role="status"
            className={
              tone === "ok"
                ? "ml-auto text-sm text-emerald-300"
                : tone === "warn"
                  ? "ml-auto text-sm text-amber-200"
                  : "ml-auto text-sm text-red-300"
            }
          >
            {message}
          </span>
        ) : null}
      </div>

      {/* Audit Cost & Runtime — operator-facing, always visible.
          Promoted from a collapsed <details> to an inline strip so
          the operator can scan cost/runtime/retries during active
          testing without clicking. Cost cell carries the
          green/yellow/red tone from `costTone()`. Admin-card-only;
          never reaches a customer surface. */}
      {order.inputTokens === null && order.outputTokens === null ? (
        <div className="border-b border-white/10 bg-white/[0.015] px-5 py-3 text-xs">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
              Audit cost &amp; runtime
            </span>
            <span className="text-[10px] text-white/35">(internal)</span>
          </div>
          <p className="mt-1 text-white/55">
            Cost data unavailable for this audit (CLI mode or
            pre-telemetry row).
          </p>
        </div>
      ) : (
        <div className="border-b border-white/10 bg-white/[0.015] px-5 py-3 text-xs">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
              Audit cost &amp; runtime
            </span>
            <span className="text-[10px] text-white/35">(internal)</span>
          </div>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
            <CostRow
              label="Estimated AI cost"
              value={
                typeof order.estimatedCostUsd === "number"
                  ? `$${order.estimatedCostUsd.toFixed(4)}`
                  : "—"
              }
              tone={
                typeof order.estimatedCostUsd === "number"
                  ? costTone(order.estimatedCostUsd)
                  : "none"
              }
            />
            <CostRow
              label="Model"
              value={order.modelUsed ?? "—"}
              mono
            />
            <CostRow
              label="Input tokens"
              value={
                typeof order.inputTokens === "number"
                  ? order.inputTokens.toLocaleString()
                  : "—"
              }
              mono
            />
            <CostRow
              label="Output tokens"
              value={
                typeof order.outputTokens === "number"
                  ? order.outputTokens.toLocaleString()
                  : "—"
              }
              mono
            />
            <CostRow
              label="Runtime"
              value={formatRuntime(order.workerRuntimeMs)}
              mono
            />
            <CostRow label="Retry count" value={String(order.retryCount)} />
            <CostRow
              label="Status"
              value={deriveProcessingStatus({
                reportStatus,
                failureReason: order.failureReason,
                retryCount: order.retryCount,
              }).replace(/_/g, " ")}
            />
            {order.failureReason ? (
              <CostRow
                label="Failure reason"
                value={order.failureReason}
                mono
              />
            ) : null}
          </dl>
        </div>
      )}

      {/* Pre-flight panel — only meaningful once a report exists. Recipient
          confirmation gates the Send button (alongside review approval);
          the six checklist items are visual nudges for the operator. */}
      {reportStatus === "generated" ? (
        <div className="border-b border-white/10 bg-white/[0.015] px-5 py-4">
          <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                Send-time recipient
              </p>
              <p className="mt-1 text-xs text-white/55">
                Pre-filled from the order ({order.email}). Edit if the customer
                asked you to use a different address. Confirm before Send.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => onChangeRecipient(e.target.value)}
                  disabled={anyBusy}
                  spellCheck={false}
                  autoComplete="off"
                  className="input-field flex-1 min-w-[220px] text-sm font-mono"
                />
                <button
                  type="button"
                  onClick={onConfirmRecipient}
                  disabled={anyBusy || recipientConfirmed}
                  className={
                    recipientConfirmed
                      ? "btn-ghost text-xs border-emerald-300/30 text-emerald-200 disabled:cursor-not-allowed disabled:opacity-70"
                      : "btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  }
                  title={
                    recipientConfirmed
                      ? `Confirmed as ${confirmedAddress ?? recipientEmail}. Edit the field to re-confirm.`
                      : "Confirm this is the correct address before sending."
                  }
                >
                  {recipientConfirmed ? "Confirmed ✓" : "Confirm recipient"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-white/45">
                A copy is always CC&apos;d to{" "}
                <code className="text-white/65">AUDIT_NOTIFICATION_EMAIL</code>{" "}
                if set.
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
                Launch QA Checklist
              </p>
              <p className="mt-1 text-xs text-white/55">
                Pre-flight sanity check. Resets per page load — every send.
              </p>
              <ul className="mt-3 space-y-1.5">
                {LAUNCH_QA_ITEMS.map((it) => {
                  const checked = Boolean(qaChecks[it.key]);
                  // The "recipient" checkbox is wired to the confirm button —
                  // mirrors recipientConfirmed and is read-only here.
                  const isRecipient = it.key === "recipient";
                  return (
                    <li key={it.key}>
                      <label className="flex items-start gap-2 text-xs text-white/80">
                        <input
                          type="checkbox"
                          checked={isRecipient ? recipientConfirmed : checked}
                          onChange={() => {
                            if (isRecipient) return; // controlled by confirm button
                            toggleQaCheck(it.key);
                          }}
                          disabled={isRecipient || anyBusy}
                          className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-emerald-400 disabled:cursor-not-allowed"
                        />
                        <span
                          className={
                            isRecipient
                              ? "text-white/55"
                              : checked
                                ? "text-emerald-200"
                                : "text-white/80"
                          }
                        >
                          {it.label}
                          {isRecipient ? (
                            <span className="ml-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
                              (auto)
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {!checklistComplete ? (
                <p className="mt-3 text-[11px] text-amber-200/80">
                  Tick every item before sending — these aren&apos;t enforced
                  server-side, but the customer sees this report.
                </p>
              ) : (
                <p className="mt-3 text-[11px] text-emerald-300/80">
                  All checks complete. Send when ready.
                </p>
              )}
            </div>
          </div>
          {sendBlockReason ? (
            <p className="mt-4 rounded-md border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-200">
              <span className="font-semibold uppercase tracking-[0.16em] text-amber-100">
                Send blocked:
              </span>{" "}
              {sendBlockReason}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Empty / queued / running / failed / sent — explicit state hints */}
      {reportStatus === "pending" && !markdown ? (
        <div className="border-b border-white/10 px-5 py-4 text-xs text-white/55">
          No audit yet. Click <span className="text-white">Run GEO Audit</span>{" "}
          to enqueue. The worker on your local machine processes the queue.
        </div>
      ) : null}
      {reportStatus === "queued" ? (
        <div className="border-b border-white/10 bg-amber-300/[0.04] px-5 py-4 text-xs text-amber-200">
          Audit queued. Run{" "}
          <code className="rounded bg-black/30 px-1 py-0.5 text-amber-100">
            npm run geo-worker
          </code>{" "}
          on the host that has the GEO engine installed, then refresh this
          page.
        </div>
      ) : null}
      {reportStatus === "running" ? (
        <div className="border-b border-white/10 bg-amber-300/[0.04] px-5 py-4 text-xs text-amber-200">
          The worker has picked up this job and is running the audit
          (1–3 minutes). Refresh when done.
        </div>
      ) : null}
      {reportStatus === "failed" && reportError ? (
        <div className="border-b border-white/10 bg-red-500/[0.04] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
            Audit failed
          </p>
          <p className="mt-1 text-[11px] text-red-200/80">
            The worker reported an error. Read the stderr below before
            re-running. Re-run with the <span className="text-white">Re-run GEO Audit</span> button once the underlying issue is resolved.
          </p>
          <pre className="mt-3 max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border border-red-400/20 bg-black/30 p-3 text-xs leading-relaxed text-red-200">
{reportError}
          </pre>
        </div>
      ) : null}
      {reportSentAt ? (
        <div className="border-b border-white/10 bg-emerald-300/[0.04] px-5 py-3 text-xs text-emerald-200">
          Report sent to <span className="text-white">{sentTo ?? order.email}</span>
          {sentTo && sentTo.toLowerCase() !== order.email.toLowerCase() ? (
            <span className="text-white/55"> (overrode original {order.email})</span>
          ) : null}
          {sentCc ? <span className="text-white/55"> · cc {sentCc}</span> : null}
          {" · "}
          {new Date(reportSentAt).toLocaleString()}. To send again, click{" "}
          <span className="text-white">force resend</span>.
        </div>
      ) : null}

      {/* Inline expanded report. Score banner up top, prose below. */}
      {expanded && markdown ? (
        <div className="border-b border-white/10 px-5 py-6 md:px-8 md:py-8">
          {scoreInfo ? <ScoreBanner score={scoreInfo.score} status={scoreInfo.status} business={businessLabel} url={order.websiteUrl} /> : null}
          <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-white/50">
            Report
            {reportGeneratedAt
              ? ` · generated ${new Date(reportGeneratedAt).toLocaleString()}`
              : ""}
          </p>
          <div className="mt-3 rounded-lg border border-white/10 bg-ink-900/80 p-6 md:p-8">
            <ReportViewerClient
              markdown={markdown}
              orderId={order.id}
              businessLabel={businessLabel}
            />
          </div>
        </div>
      ) : null}

      {/* Review panel — clearly-separated. Toggle keeps the card tidy when
          you just want to run/view/send without QA notes. */}
      <div className="px-5 py-4">
        <button
          type="button"
          onClick={() => setReviewExpanded((v) => !v)}
          className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-[0.2em] text-white/55 hover:text-white"
        >
          <span>QA review · notes & quality score</span>
          <span className="text-base">{reviewExpanded ? "−" : "+"}</span>
        </button>
        {reviewExpanded ? (
          <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="grid gap-4 md:grid-cols-[1fr_140px]">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                  Admin notes (internal — not sent to customer)
                </label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  disabled={savingReview}
                  placeholder="Anything to flag before sending — score sanity check, edits made, customer-specific context…"
                  className="input-field mt-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
                  Quality (0–10)
                </label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  value={qualityScore}
                  onChange={(e) => setQualityScore(e.target.value)}
                  disabled={savingReview}
                  className="input-field mt-2"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-white/40">
                Status:
              </span>
              {REVIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingReview}
                  onClick={() => saveReview(opt.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    reviewStatus === opt.value
                      ? "border-accent bg-accent text-ink-950"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/30 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                disabled={savingReview}
                onClick={() => saveReview()}
                className="ml-auto rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                title="Save notes / score without changing review status"
              >
                Save notes
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function StatusBadges({
  paymentStatus,
  reportStatus,
  reviewStatus,
  sentAt,
  createdAt,
  amount,
}: {
  paymentStatus: string;
  reportStatus: string;
  reviewStatus: string;
  sentAt: string | null;
  createdAt: string;
  amount: number;
}) {
  // Canonical labels: Paid · Audit Pending / Running / Generated / Failed ·
  // Reviewed (only when approved) / Needs Changes (only when set) · Sent.
  const reportLabel =
    reportStatus === "pending"
      ? "Audit Pending"
      : reportStatus === "queued"
        ? "Queued"
        : reportStatus === "running"
          ? "Worker Running"
          : reportStatus === "generated"
            ? "Generated"
            : reportStatus === "failed"
              ? "Audit Failed"
              : reportStatus;
  const reportToneClass: "ok" | "warn" | "err" | "muted" | "info" =
    reportStatus === "generated"
      ? "ok"
      : reportStatus === "failed"
        ? "err"
        : reportStatus === "running"
          ? "info"
          : reportStatus === "queued"
            ? "warn"
            : "muted";

  // Always show all four status dimensions so an operator scanning the queue
  // can read paid · audit · review · sent at a glance — including the
  // negative cases ("Not Reviewed" / "Not Sent"), which were previously
  // implicit-by-absence and easy to miss.
  const reviewLabel =
    reviewStatus === "approved"
      ? "Reviewed"
      : reviewStatus === "needs_changes"
        ? "Needs Changes"
        : "Not Reviewed";
  const reviewToneClass: "ok" | "warn" | "muted" =
    reviewStatus === "approved"
      ? "ok"
      : reviewStatus === "needs_changes"
        ? "warn"
        : "muted";

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
      <Pill tone={paymentStatus === "paid" ? "ok" : "warn"}>
        {paymentStatus === "paid" ? `Paid · $${(amount / 100).toFixed(0)}` : "Unpaid"}
      </Pill>
      <Pill tone={reportToneClass}>{reportLabel}</Pill>
      <Pill tone={reviewToneClass}>{reviewLabel}</Pill>
      {sentAt ? (
        <Pill tone="ok">Sent {formatShort(sentAt)}</Pill>
      ) : (
        <Pill tone="muted">Not Sent</Pill>
      )}
      <span className="text-white/35">{formatShort(createdAt)}</span>
    </div>
  );
}

function ScoreBanner({
  score,
  status,
  business,
  url,
}: {
  score: number;
  status: string | null;
  business: string;
  url: string;
}) {
  const tone = scoreTone(score);
  const ring =
    tone === "ok"
      ? "border-emerald-300/40 bg-emerald-300/[0.08]"
      : tone === "warn"
        ? "border-amber-300/40 bg-amber-300/[0.08]"
        : "border-accent/40 bg-accent/[0.08]";
  const number =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-amber-300"
        : "text-accent";
  return (
    <div className="grid gap-4 rounded-lg border border-white/10 bg-ink-900/60 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
      <div
        className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center rounded-full border-2 ${ring}`}
      >
        <div className={`text-3xl font-bold leading-none ${number}`}>
          {score}
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/50">
          / 100
        </div>
      </div>
      <div>
        <h2 className="text-2xl font-semibold text-white leading-tight">
          {business}
        </h2>
        {status ? (
          <p className="mt-1 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
            {status}
          </p>
        ) : null}
        <p className="muted mt-2 text-sm break-all">{url}</p>
      </div>
    </div>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "err" | "muted" | "info";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
        : tone === "err"
          ? "border-red-400/30 bg-red-400/10 text-red-200"
          : tone === "info"
            ? "border-sky-300/40 bg-sky-300/10 text-sky-200"
            : "border-white/15 bg-white/[0.04] text-white/60";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${cls}`}
    >
      {children}
    </span>
  );
}

function formatShort(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function CostRow({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "low" | "medium" | "high" | "none";
}) {
  // Color dot reserved for the cost cell — green/yellow/red signals
  // whether this audit was low, normal, or unusually expensive.
  // Other rows pass no `tone` and get no dot.
  const dotClass =
    tone === "low"
      ? "bg-emerald-300"
      : tone === "medium"
        ? "bg-amber-300"
        : tone === "high"
          ? "bg-red-400"
          : null;
  const valueClass =
    tone === "low"
      ? "text-emerald-200"
      : tone === "medium"
        ? "text-amber-200"
        : tone === "high"
          ? "text-red-200"
          : "text-white/85";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-white/45">{label}</dt>
      <dd
        className={`flex items-center gap-1.5 ${valueClass} ${mono ? "font-mono text-[11px]" : "text-[11.5px]"}`}
      >
        {dotClass ? (
          <span
            aria-hidden
            className={`inline-block h-1.5 w-1.5 rounded-full ${dotClass}`}
          />
        ) : null}
        <span>{value}</span>
      </dd>
    </div>
  );
}

function formatRuntime(ms: number | null): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds - minutes * 60);
  return `${minutes}m ${remSeconds}s`;
}

// ────────────────────────────────────────────────────────────
// Validator telemetry strip — operator-facing one-line summary of
// per-provider status + whether consensus was computed.
// ────────────────────────────────────────────────────────────

const PROVIDER_DISPLAY: Record<string, string> = {
  openai: "ChatGPT",
  anthropic: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  "google-ai-overview": "Google AI Overview",
};

const PROVIDER_ORDER = ["openai", "anthropic", "gemini", "perplexity"] as const;

function ValidatorTelemetryStrip({ telemetry }: { telemetry: ValidatorTelemetry }) {
  if (!telemetry) {
    return (
      <div className="border-b border-white/[0.06] px-5 py-2 text-[11px] text-white/40">
        Cross-Model Intelligence:{" "}
        <span className="text-white/55">
          gate OFF (no validator data for this order)
        </span>
      </div>
    );
  }
  const byProvider: Record<string, string> = {};
  for (const p of telemetry.providers) {
    if (typeof p.name === "string") byProvider[p.name] = p.status;
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.06] px-5 py-2 text-[11px] text-white/55">
      <span className="text-white/40">Validators:</span>
      {PROVIDER_ORDER.map((p) => {
        const status = byProvider[p] ?? "—";
        const display = PROVIDER_DISPLAY[p] ?? p;
        const mark =
          status === "passed"
            ? "✓"
            : status === "failed"
              ? "✗"
              : status === "unavailable"
                ? "—"
                : status === "skipped"
                  ? "·"
                  : "?";
        const toneClass =
          status === "passed"
            ? "text-severity-info"
            : status === "failed"
              ? "text-severity-critical"
              : "text-white/40";
        return (
          <span
            key={p}
            className="inline-flex items-baseline gap-1"
            title={`${display}: ${status}`}
          >
            <span className={`font-mono ${toneClass}`}>{mark}</span>
            <span>{display}</span>
          </span>
        );
      })}
      <span aria-hidden className="text-white/20">
        ·
      </span>
      <span>
        Consensus:{" "}
        <span
          className={
            telemetry.consensusComputed
              ? "text-severity-info"
              : "text-white/40"
          }
        >
          {telemetry.consensusComputed ? "computed" : "not computed"}
        </span>
      </span>
    </div>
  );
}
