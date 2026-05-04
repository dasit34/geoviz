"use client";

import { useState } from "react";

type Props = {
  orderId: string;
  adminKey: string;
  reportStatus: string;
  reportSentToCustomerAt: string | null;
};

export function AdminOrderActions({
  orderId,
  adminKey,
  reportStatus,
  reportSentToCustomerAt,
}: Props) {
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn" | "err">("ok");

  const post = async (
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

  const onRun = async (force: boolean) => {
    setRunning(true);
    setMessage("Running audit — this can take 1–3 minutes…");
    setTone("warn");
    try {
      const res = await post(
        `/api/admin/orders/${orderId}/run-geo-audit`,
        force ? { force: true } : {},
      );
      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        bytes?: number;
        error?: string;
        message?: string;
      };
      if (res.ok) {
        setTone("ok");
        setMessage(`Audit ${data.status ?? "ok"} (${data.bytes ?? 0} bytes). Reload to view.`);
      } else if (res.status === 409) {
        setTone("warn");
        setMessage(data.message ?? "Already generated.");
      } else {
        setTone("err");
        setMessage(`Audit failed: ${data.error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const onSend = async (force: boolean) => {
    if (
      !force &&
      !confirm(
        "Send the generated report to the customer's email? This is the deliverable.",
      )
    ) {
      return;
    }
    setSending(true);
    setMessage("Sending email…");
    setTone("warn");
    try {
      const res = await post(
        `/api/admin/orders/${orderId}/send-report`,
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
        setMessage(
          `Sent to ${data.to ?? ""}${
            data.resendId ? ` (resend id ${data.resendId})` : ""
          }. Reload to refresh status.`,
        );
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

  const auditDisabled = running || sending;
  const sendDisabled =
    sending || running || reportStatus !== "generated";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={auditDisabled}
          onClick={() => onRun(false)}
          className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running ? "Running…" : reportStatus === "generated" ? "Re-run GEO Audit" : "Run GEO Audit"}
        </button>
        {reportStatus === "generated" ? (
          <button
            type="button"
            disabled={auditDisabled}
            onClick={() => onRun(true)}
            className="btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Force re-run
          </button>
        ) : null}
        <button
          type="button"
          disabled={sendDisabled}
          onClick={() => onSend(false)}
          className="btn-ghost text-sm border-emerald-300/30 text-emerald-200 hover:border-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {sending ? "Sending…" : reportSentToCustomerAt ? "Resend Report Email" : "Send Report Email"}
        </button>
        {reportSentToCustomerAt ? (
          <button
            type="button"
            disabled={sendDisabled}
            onClick={() => onSend(true)}
            className="btn-ghost text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Force resend
          </button>
        ) : null}
      </div>
      {message ? (
        <p
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
        </p>
      ) : null}
    </div>
  );
}
