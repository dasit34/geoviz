"use client";

import { useState } from "react";
import { ReportViewerClient } from "./ReportViewerClient";

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
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err">("ok");

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
    setMessage("Running audit — this can take 1–3 minutes…");
    setTone("warn");
    try {
      const res = await post(
        `/api/admin/orders/${order.id}/run-geo-audit`,
        force ? { force: true } : {},
      );
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        bytes?: number;
        markdown?: string;
        generatedAt?: string;
        error?: string;
        message?: string;
      };
      if (res.ok) {
        setTone("ok");
        setMessage(`Audit ${data.status ?? "ok"} (${data.bytes ?? 0} bytes).`);
        if (data.markdown) setMarkdown(data.markdown);
        if (data.generatedAt) setReportGeneratedAt(data.generatedAt);
        setReportStatus("generated");
        setReportError(null);
        setExpanded(true);
      } else if (res.status === 409) {
        setTone("warn");
        setMessage(data.message ?? "Already generated.");
      } else {
        setTone("err");
        setReportStatus("failed");
        setReportError(data.error ?? `HTTP ${res.status}`);
        setMessage(`Audit failed: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const onSend = async (force = false) => {
    if (
      !force &&
      !confirm(
        `Send the generated report to ${order.email}? AUDIT_NOTIFICATION_EMAIL will be CC'd.`,
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
        sentAt?: string;
      };
      if (res.ok) {
        setTone("ok");
        const id = data.resendId ? ` (id ${data.resendId})` : "";
        setMessage(`Sent to ${data.to ?? order.email}${id}.`);
        setReportSentAt(new Date().toISOString());
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
        if (overrideStatus) setReviewStatus(overrideStatus);
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
  const sendDisabled = sending || running || reportStatus !== "generated";

  return (
    <article className="rounded-xl border border-white/10 bg-ink-900/60 shadow-card">
      {/* Header strip with metadata */}
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
        <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em]">
          <Pill tone={order.paymentStatus === "paid" ? "ok" : "warn"}>
            paid {`$${(order.amount / 100).toFixed(0)}`}
          </Pill>
          <Pill
            tone={
              reportStatus === "generated"
                ? "ok"
                : reportStatus === "failed"
                  ? "err"
                  : reportStatus === "running"
                    ? "warn"
                    : "muted"
            }
          >
            report {reportStatus}
          </Pill>
          <Pill
            tone={
              reviewStatus === "approved"
                ? "ok"
                : reviewStatus === "needs_changes"
                  ? "warn"
                  : "muted"
            }
          >
            review {reviewStatus.replace("_", " ")}
          </Pill>
          {reportSentAt ? (
            <Pill tone="ok">sent {formatShort(reportSentAt)}</Pill>
          ) : null}
          <span className="text-white/40">
            {formatShort(order.createdAt)}
          </span>
        </div>
      </header>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4">
        <button
          type="button"
          disabled={running || sending}
          onClick={() => onRun(reportStatus === "generated")}
          className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running
            ? "Running…"
            : reportStatus === "generated"
              ? "Re-run GEO Audit"
              : "Run GEO Audit"}
        </button>
        <button
          type="button"
          disabled={!markdown}
          onClick={() => setExpanded((v) => !v)}
          className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {expanded ? "Hide Report" : "View Report"}
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
              ? "Resend Report Email"
              : "Send Report Email"}
        </button>
        {reportSentAt ? (
          <button
            type="button"
            disabled={sendDisabled}
            onClick={() => onSend(true)}
            className="btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            Force resend
          </button>
        ) : null}
        {message ? (
          <span
            role="status"
            className={
              tone === "ok"
                ? "text-sm text-emerald-300"
                : tone === "warn"
                  ? "text-sm text-amber-200"
                  : "text-sm text-red-300"
            }
          >
            {message}
          </span>
        ) : null}
      </div>

      {/* Last error block, only when report failed */}
      {reportStatus === "failed" && reportError ? (
        <div className="border-b border-white/10 bg-red-500/[0.04] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-300">
            Last audit error
          </p>
          <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-red-200">
{reportError}
          </pre>
        </div>
      ) : null}

      {/* Inline review controls */}
      <div className="grid gap-4 border-b border-white/10 px-5 py-4 md:grid-cols-[1fr_140px_auto] md:items-end">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
            Admin notes (internal)
          </label>
          <textarea
            rows={2}
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            disabled={savingReview}
            placeholder="Anything to flag before sending — score sanity check, edits made…"
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
        <div className="flex flex-wrap items-center gap-2">
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
            className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            title="Save notes / score without changing review status"
          >
            Save
          </button>
        </div>
      </div>

      {/* Inline expanded report */}
      {expanded && markdown ? (
        <div className="px-5 py-6 md:px-8 md:py-8">
          <p className="text-[10px] uppercase tracking-[0.2em] text-white/50">
            Report
            {reportGeneratedAt
              ? ` · generated ${new Date(reportGeneratedAt).toLocaleString()}`
              : ""}
          </p>
          <div className="mt-4 rounded-xl border border-white/10 bg-ink-900/80 p-6 md:p-8">
            <ReportViewerClient markdown={markdown} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Pill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "err" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "border-emerald-300/30 bg-emerald-300/10 text-emerald-200"
      : tone === "warn"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
        : tone === "err"
          ? "border-red-400/30 bg-red-400/10 text-red-200"
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
