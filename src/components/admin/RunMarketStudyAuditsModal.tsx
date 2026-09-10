"use client";

import { useEffect, useState } from "react";

type StudyOption = { id: string; name: string; category: string | null };
type SkippedLead = { leadId: string; businessName: string; reason: string };
type EligibleLead = {
  leadId: string;
  businessName: string;
  website: string | null;
};
type DryRun = {
  dryRun: true;
  eligible: EligibleLead[];
  skipped: SkippedLead[];
  eligibleCount: number;
  skippedCount: number;
  maxBatch: number;
  estimatedCost: {
    count: number;
    perAuditUsd: number;
    totalUsd: number;
    basis: string;
  };
};
type QueueResult = {
  studyId: string;
  studyName: string;
  queuedCount: number;
  skippedCount: number;
  skipped: SkippedLead[];
};

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

export function RunMarketStudyAuditsModal({
  adminKey,
  leadIds,
  onClose,
  onQueued,
}: {
  adminKey: string;
  leadIds: string[];
  onClose: () => void;
  onQueued?: () => void;
}) {
  const [studies, setStudies] = useState<StudyOption[]>([]);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [studyId, setStudyId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DryRun | null>(null);
  const [result, setResult] = useState<QueueResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch(adminKey, "/api/admin/market-studies")
      .then((r) => r.json())
      .then((d: { studies?: StudyOption[] }) => {
        setStudies(d.studies ?? []);
        if ((d.studies ?? []).length > 0) setMode("existing");
      })
      .catch(() => undefined);
  }, [adminKey]);

  function body(confirm: boolean) {
    return {
      leadIds,
      confirm,
      ...(mode === "existing"
        ? { studyId }
        : {
            name: name.trim(),
            category: category.trim() || undefined,
            city: city.trim() || undefined,
            state: state.trim() || undefined,
          }),
    };
  }

  async function runPreview() {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const res = await authedFetch(adminKey, "/api/admin/market-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(false)),
      });
      const data = await res.json();
      if (res.ok) setPreview(data);
      else setError(data.error ?? "Preview failed.");
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmQueue() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch(adminKey, "/api/admin/market-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body(true)),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        onQueued?.();
      } else {
        setError(data.error ?? "Failed to queue audits.");
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  const canPreview =
    mode === "existing" ? Boolean(studyId) : name.trim().length > 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="card w-full max-w-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="h3">Run GeoViz Audits</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-white/60">
          {leadIds.length} lead{leadIds.length === 1 ? "" : "s"} selected. Each
          eligible lead gets one normal GeoViz audit on the existing queue —
          behind any paying-customer audits.
        </p>

        {result ? (
          <div>
            <div className="mb-4 rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm">
              <p className="text-white/80">
                <strong>{result.queuedCount}</strong> audit
                {result.queuedCount === 1 ? "" : "s"} queued for{" "}
                <strong>{result.studyName}</strong>.
                {result.skippedCount > 0 ? (
                  <>
                    {" "}
                    <strong>{result.skippedCount}</strong> skipped.
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex gap-2">
              <a
                href={`/admin/market-studies/${result.studyId}?key=${encodeURIComponent(adminKey)}`}
                className="btn-primary flex-1 text-center text-sm"
              >
                Open study
              </a>
              <button onClick={onClose} className="btn-ghost text-sm">
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {studies.length > 0 ? (
              <div className="mb-4 flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "existing"}
                    onChange={() => {
                      setMode("existing");
                      setPreview(null);
                    }}
                  />
                  Add to existing study
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={mode === "new"}
                    onChange={() => {
                      setMode("new");
                      setPreview(null);
                    }}
                  />
                  New study
                </label>
              </div>
            ) : null}

            {mode === "existing" ? (
              <select
                value={studyId}
                onChange={(e) => {
                  setStudyId(e.target.value);
                  setPreview(null);
                }}
                disabled={busy}
                className="input-field mb-4 w-full"
              >
                <option value="">Select a study…</option>
                {studies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.category ? ` · ${s.category}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="mb-4 space-y-3">
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="Study name (e.g. Columbus Roofers - September 2026)"
                  className="input-field w-full"
                />
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Category"
                    className="input-field"
                  />
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="City"
                    className="input-field"
                  />
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="State"
                    className="input-field"
                  />
                </div>
              </div>
            )}

            {error ? (
              <p className="mb-4 text-sm text-severity-critical">{error}</p>
            ) : null}

            {!preview ? (
              <button
                onClick={runPreview}
                disabled={busy || !canPreview}
                className="btn-primary w-full text-sm disabled:opacity-50"
              >
                {busy ? "Checking…" : "Preview"}
              </button>
            ) : (
              <div>
                <div className="mb-4 rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm">
                  <p className="text-white/80">
                    <strong>{preview.eligibleCount}</strong> audit
                    {preview.eligibleCount === 1 ? "" : "s"} will be queued,{" "}
                    <strong>{preview.skippedCount}</strong> skipped.
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Estimated cost ≈ ${preview.estimatedCost.totalUsd.toFixed(2)}{" "}
                    (${preview.estimatedCost.perAuditUsd.toFixed(2)}/audit —{" "}
                    {preview.estimatedCost.basis}). Max {preview.maxBatch} per
                    run.
                  </p>
                  {preview.skipped.length > 0 ? (
                    <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-white/50">
                      {preview.skipped.map((s) => (
                        <li key={s.leadId}>
                          {s.businessName}: {s.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>

                <button
                  onClick={confirmQueue}
                  disabled={busy || preview.eligibleCount === 0}
                  className="btn-primary w-full text-sm disabled:opacity-50"
                >
                  {busy
                    ? "Queuing…"
                    : `Queue ${preview.eligibleCount} audit${preview.eligibleCount === 1 ? "" : "s"}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
