"use client";

import { useState } from "react";

type Props = {
  orderId: string;
  adminKey: string;
  initialReviewStatus: string;
  initialAdminNotes: string;
  initialQualityScore: number | null;
};

const STATUSES: Array<{ value: string; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "needs_changes", label: "Needs changes" },
];

export function AdminReviewForm({
  orderId,
  adminKey,
  initialReviewStatus,
  initialAdminNotes,
  initialQualityScore,
}: Props) {
  const [reviewStatus, setReviewStatus] = useState(initialReviewStatus);
  const [adminNotes, setAdminNotes] = useState(initialAdminNotes);
  const [qualityScore, setQualityScore] = useState<string>(
    typeof initialQualityScore === "number" ? String(initialQualityScore) : "",
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "err">("ok");

  const save = async (newStatus?: string) => {
    setSaving(true);
    setMessage(null);
    const status = newStatus ?? reviewStatus;
    const parsedScore =
      qualityScore.trim() === "" ? null : Number(qualityScore.trim());
    if (
      parsedScore !== null &&
      (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 10)
    ) {
      setTone("err");
      setMessage("Quality score must be a number 0–10 (or empty).");
      setSaving(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/admin/orders/${orderId}/review?key=${encodeURIComponent(adminKey)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-secret": adminKey,
          },
          body: JSON.stringify({
            reviewStatus: status,
            adminNotes,
            qualityScore: parsedScore,
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setTone("err");
        setMessage(data.error ?? `HTTP ${res.status}`);
      } else {
        setTone("ok");
        setMessage("Saved.");
        if (newStatus) setReviewStatus(newStatus);
      }
    } catch (err) {
      setTone("err");
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card space-y-5">
      <div>
        <label
          htmlFor="reviewStatus"
          className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50"
        >
          Review status
        </label>
        <div className="mt-2 flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              disabled={saving}
              onClick={() => setReviewStatus(s.value)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                reviewStatus === s.value
                  ? "border-accent bg-accent text-ink-950"
                  : "border-white/10 bg-white/[0.03] text-white/70 hover:border-white/30 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label
          htmlFor="qualityScore"
          className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50"
        >
          Quality score (0–10)
        </label>
        <input
          id="qualityScore"
          type="number"
          min={0}
          max={10}
          step={1}
          value={qualityScore}
          onChange={(e) => setQualityScore(e.target.value)}
          disabled={saving}
          className="input-field mt-2 max-w-[120px]"
        />
      </div>

      <div>
        <label
          htmlFor="adminNotes"
          className="block text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50"
        >
          Admin notes
        </label>
        <textarea
          id="adminNotes"
          rows={4}
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          disabled={saving}
          placeholder="Anything to flag before sending — score sanity check, edits made, customer-specific context…"
          className="input-field mt-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => save("approved")}
          className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : "Mark Reviewed (Approve)"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save()}
          className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          Save changes
        </button>
        {message ? (
          <span
            className={
              tone === "ok"
                ? "text-sm text-emerald-300"
                : "text-sm text-red-300"
            }
          >
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
