"use client";

import { useCallback, useEffect, useState } from "react";
import { ReportViewerClient } from "./ReportViewerClient";
import { parseReportScore, scoreTone } from "@/lib/parse-report-score";

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
  reportGeneratedAt: string | null;
  reportSentToCustomerAt: string | null;
  reviewStatus: string;
  adminNotes: string | null;
  qualityScore: number | null;
  amount: number;
  currency: string;
  createdAt: string;
};

const REVIEW_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "needs_changes", label: "Needs changes" },
];

export function AdminReportCard({
  adminKey,
  order,
}: {
  adminKey: string;
  order: Order;
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
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/admin/orders/${order.id}?key=${encodeURIComponent(adminKey)}`,
          { headers: { "x-admin-secret": adminKey }, cache: "no-store" },
        );
        if (cancelled) return;
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
    const id = setInterval(tick, 5000);
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

  const onRun = async (force = false) => {
    setRunning(true);
    setMessage("Queueing audit…");
    setTone("warn");
    try {
      const res = await post(
        `/api/admin/orders/${order.id}/run-geo-audit`,
        force ? { force: true } : {},
      );
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        message?: string;
        error?: string;
        queuedAt?: string;
      };
      if (res.ok && data.status === "queued") {
        setTone("ok");
        applyOrderUpdate({ reportStatus: "queued", reportError: null });
        setMessage(
          "Queued for the worker. Run `npm run geo-worker:dev` (loop mode) — UI will auto-update when it completes.",
        );
      } else if (res.status === 409) {
        // Either already-generated (use force=true) or already in flight.
        setTone("warn");
        setMessage(data.message ?? data.error ?? "Already in progress.");
        if (data.status === "queued" || data.status === "running") {
          applyOrderUpdate({ reportStatus: data.status });
        }
      } else {
        setTone("err");
        applyOrderUpdate({
          reportStatus: "failed",
          reportError: data.error ?? `HTTP ${res.status}`,
        });
        setMessage(`Queue failed: ${data.error ?? `HTTP ${res.status}`}`);
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
    if (
      !force &&
      !confirm(
        `Send the generated report to ${order.email}?\nA copy will be CC'd to the admin notification address (set via AUDIT_NOTIFICATION_EMAIL).`,
      )
    ) {
      return;
    }
    setSending(true);
    setMessage("Sending email…");
    setTone("warn");
    try {
      const res = await post(
        `/api/admin/orders/${order.id}/send-report`,
        force ? { force: true } : {},
      );
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        to?: string;
        resendId?: string | null;
        error?: string;
        message?: string;
      };
      if (res.ok) {
        setTone("ok");
        const id = data.resendId ? ` · id ${data.resendId}` : "";
        setMessage(`Sent to ${data.to ?? order.email}${id}`);
        applyOrderUpdate({
          reportSentToCustomerAt: new Date().toISOString(),
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
  const sendDisabled = anyBusy || reportStatus !== "generated";
  const markDisabled =
    anyBusy || reportStatus !== "generated" || reviewStatus === "approved";
  const scoreInfo = parseReportScore(markdown);

  return (
    <article className="rounded-xl border border-white/10 bg-ink-900/60 shadow-card">
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

      {/* Action row — strict logical order:
          Run GEO Audit → View Report → Mark Reviewed → Send Report. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => onRun(reportStatus === "generated")}
          className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running
            ? "Queueing…"
            : reportStatus === "generated"
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
        <details className="border-b border-white/10 bg-red-500/[0.04] px-5 py-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-red-300">
            Last audit error · expand for stderr
          </summary>
          <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-red-200">
{reportError}
          </pre>
        </details>
      ) : null}
      {reportSentAt ? (
        <div className="border-b border-white/10 bg-emerald-300/[0.04] px-5 py-3 text-xs text-emerald-200">
          Report sent to {order.email}
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
          <div className="mt-3 rounded-xl border border-white/10 bg-ink-900/80 p-6 md:p-8">
            <ReportViewerClient markdown={markdown} />
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

  const showReview =
    reviewStatus === "approved" || reviewStatus === "needs_changes";
  const reviewLabel =
    reviewStatus === "approved" ? "Reviewed" : "Needs Changes";
  const reviewToneClass: "ok" | "warn" =
    reviewStatus === "approved" ? "ok" : "warn";

  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
      <Pill tone={paymentStatus === "paid" ? "ok" : "warn"}>
        Paid · ${(amount / 100).toFixed(0)}
      </Pill>
      <Pill tone={reportToneClass}>{reportLabel}</Pill>
      {showReview ? <Pill tone={reviewToneClass}>{reviewLabel}</Pill> : null}
      {sentAt ? <Pill tone="ok">Sent {formatShort(sentAt)}</Pill> : null}
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
    <div className="grid gap-4 rounded-xl border border-white/10 bg-ink-900/60 p-6 sm:grid-cols-[auto_1fr] sm:items-center">
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
