"use client";

import { useCallback, useEffect, useState } from "react";

type EntryStatus = "queued" | "running" | "completed" | "failed" | "skipped";

type Entry = {
  id: string;
  leadId: string | null;
  businessName: string;
  websiteUrl: string;
  status: EntryStatus;
  skipReason: string | null;
  auditOrderId: string | null;
  overallScore: number | null;
  reportGeneratedAt: string | null;
  leadStatus: string | null;
  outreachStatus: string | null;
};

type Aggregate = {
  auditedCount: number;
  legacyCount: number;
  insufficientData: boolean;
  avgScore: number | null;
  medianScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  scoreDistribution: { band: string; count: number; pct: number }[];
  categoryAverages: Record<string, number>;
  topFindings: { id: string; label: string; count: number; pctAffected: number }[];
};

type Detail = {
  study: {
    id: string;
    name: string;
    category: string | null;
    city: string | null;
    state: string | null;
    status: string;
    notes: string | null;
    createdAt: string;
  };
  counts: Record<EntryStatus, number> & { total: number };
  scoreStats: { avg: number | null; median: number | null; min: number | null; max: number | null };
  aggregate: Aggregate;
  caseStudySummary: string[];
  entries: Entry[];
};

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

const STATUS_TONE: Record<EntryStatus, string> = {
  queued: "bg-white/10 text-white/60",
  running: "bg-accent/15 text-accent",
  completed: "bg-severity-info/15 text-severity-info",
  failed: "bg-severity-critical/15 text-severity-critical",
  skipped: "bg-white/5 text-white/40",
};

export function MarketStudyDetail({
  adminKey,
  studyId,
}: {
  adminKey: string;
  studyId: string;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    authedFetch(adminKey, `/api/admin/market-studies/${studyId}`)
      .then((r) => r.json())
      .then((d: Detail | { error: string }) => {
        if ("error" in d) setError(d.error);
        else {
          setData(d);
          setError(null);
        }
      })
      .catch(() => setError("Network error."));
  }, [adminKey, studyId]);

  useEffect(() => {
    load();
  }, [load]);

  const inFlight =
    data != null && (data.counts.queued > 0 || data.counts.running > 0);

  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [inFlight, load]);

  async function saveName() {
    if (!nameDraft.trim() || !data) return;
    setBusy(true);
    try {
      const res = await authedFetch(
        adminKey,
        `/api/admin/market-studies/${studyId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nameDraft.trim() }),
        },
      );
      if (res.ok) {
        setRenaming(false);
        load();
      }
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive() {
    if (!data) return;
    setBusy(true);
    try {
      await authedFetch(adminKey, `/api/admin/market-studies/${studyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: data.study.status === "archived" ? "active" : "archived",
        }),
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  async function retryFailed() {
    setBusy(true);
    try {
      await authedFetch(
        adminKey,
        `/api/admin/market-studies/${studyId}/retry-failed`,
        { method: "POST" },
      );
      load();
    } finally {
      setBusy(false);
    }
  }

  function copySummary() {
    if (!data) return;
    navigator.clipboard
      ?.writeText(data.caseStudySummary.join("\n"))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  }

  if (error) {
    return <p className="mt-6 text-sm text-severity-critical">{error}</p>;
  }
  if (!data) {
    return <p className="muted mt-6">Loading…</p>;
  }

  const { study, counts, aggregate } = data;
  const loc = [study.city, study.state].filter(Boolean).join(", ");

  return (
    <div className="mt-3">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {renaming ? (
            <div className="flex items-center gap-2">
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="input-field text-lg"
                autoFocus
              />
              <button
                onClick={saveName}
                disabled={busy}
                className="btn-primary text-xs"
              >
                Save
              </button>
              <button
                onClick={() => setRenaming(false)}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="h2">
              {study.name}{" "}
              <button
                onClick={() => {
                  setNameDraft(study.name);
                  setRenaming(true);
                }}
                className="align-middle text-xs text-white/40 hover:text-white/70"
              >
                edit
              </button>
            </h1>
          )}
          <p className="muted mt-2 text-sm">
            {[study.category, loc].filter(Boolean).join(" · ") || "No category / location"}{" "}
            · created {new Date(study.createdAt).toLocaleDateString()}
            {study.status === "archived" ? " · archived" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {counts.failed > 0 ? (
            <button
              onClick={retryFailed}
              disabled={busy}
              className="btn-ghost text-xs"
            >
              Retry {counts.failed} failed
            </button>
          ) : null}
          <button
            onClick={toggleArchive}
            disabled={busy}
            className="btn-ghost text-xs"
          >
            {study.status === "archived" ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      {inFlight ? (
        <p className="mt-3 text-xs text-accent">
          {counts.queued} queued · {counts.running} running · auto-refreshing…
        </p>
      ) : null}

      {/* KPI tiles */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          ["Selected", counts.total],
          ["Audited", aggregate.auditedCount],
          ["Avg", aggregate.avgScore ?? "—"],
          ["Median", aggregate.medianScore ?? "—"],
          ["Min", aggregate.minScore ?? "—"],
          ["Max", aggregate.maxScore ?? "—"],
          ["Failed", counts.failed],
          ["Skipped", counts.skipped],
        ].map(([label, value]) => (
          <div key={String(label)} className="card p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              {label}
            </p>
            <p className="mono-data mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      {aggregate.insufficientData ? (
        <p className="mt-6 rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm text-white/60">
          Collecting results — aggregate metrics appear once at least 3 audits
          complete.
        </p>
      ) : (
        <>
          {/* Score distribution */}
          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.18em] text-white/50">
              Score distribution
            </p>
            <div className="mt-3 space-y-1.5">
              {aggregate.scoreDistribution.map((b) => (
                <div key={b.band} className="flex items-center gap-3 text-sm">
                  <span className="w-24 shrink-0 text-white/60">{b.band}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-sm bg-white/[0.06]">
                    <div
                      className="h-full rounded-sm bg-accent/60"
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                  <span className="mono-data w-16 shrink-0 text-right text-white/60">
                    {b.count} ({b.pct}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top recurring issues */}
          {aggregate.topFindings.length > 0 ? (
            <div className="mt-8">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                Top recurring issues
              </p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {aggregate.topFindings.map((f) => (
                  <li key={f.id} className="flex items-baseline gap-2">
                    <span className="mono-data w-14 shrink-0 text-accent">
                      {f.pctAffected}%
                    </span>
                    <span className="text-white/75">
                      {f.label}{" "}
                      <span className="text-white/40">
                        ({f.count} of {aggregate.auditedCount - aggregate.legacyCount})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {aggregate.legacyCount > 0 ? (
                <p className="mt-2 text-xs text-white/40">
                  {aggregate.legacyCount} audit(s) predate the current scoring
                  engine and are excluded from this breakdown.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Case study summary */}
          <div className="mt-8 rounded-md border border-white/10 bg-ink-900/60 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.18em] text-white/50">
                Case Study Summary
              </p>
              <button
                onClick={copySummary}
                className="text-xs text-white/40 hover:text-white/70"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-sm text-white/80">
              {data.caseStudySummary.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-white/35">
              Aggregate figures only — no individual business names or scores.
              Nothing is published automatically.
            </p>
          </div>
        </>
      )}

      {/* Entries */}
      <div className="mt-10 overflow-x-auto rounded-md border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
            <tr>
              <th className="px-3 py-2">Business</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Report</th>
              <th className="px-3 py-2">Outreach</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id} className="border-b border-white/5 align-top">
                <td className="px-3 py-2 text-white/85">
                  {e.leadId ? (
                    <a
                      href={`/admin/leads/${e.leadId}?key=${encodeURIComponent(adminKey)}`}
                      className="hover:text-accent hover:underline"
                    >
                      {e.businessName}
                    </a>
                  ) : (
                    e.businessName
                  )}
                  <span className="block break-all text-[11px] text-white/35">
                    {e.websiteUrl}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONE[e.status]}`}
                  >
                    {e.status}
                  </span>
                  {e.skipReason ? (
                    <span className="block text-[11px] text-white/40">
                      {e.skipReason}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-white/80">
                  {e.overallScore ?? "—"}
                </td>
                <td className="px-3 py-2">
                  {e.auditOrderId && e.status === "completed" ? (
                    <a
                      href={`/report/${e.auditOrderId}/print?key=${encodeURIComponent(adminKey)}`}
                      className="text-accent hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-white/30">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-white/50">
                  {e.outreachStatus ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
