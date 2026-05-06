"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CategoryScore = {
  key: string;
  label: string;
  short: string;
  max: number;
  score: number | null;
};

type CalibrationRun = {
  id: string;
  url: string;
  label: string;
  reportStatus: string;
  reportError: string | null;
  reportQueuedAt: string | null;
  reportStartedAt: string | null;
  reportGeneratedAt: string | null;
  createdAt: string;
  overall: number | null;
  bandStatus: string | null;
  categories: CategoryScore[];
  expectedScore: number | null;
  notes: string | null;
};

type Filter = "all" | "low" | "high" | "over-penalized";

const BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "Invisible", min: 0, max: 25 },
  { label: "At Risk", min: 26, max: 45 },
  { label: "Needs Work", min: 46, max: 65 },
  { label: "Competitive", min: 66, max: 80 },
  { label: "AI-Ready", min: 81, max: 100 },
];

export function CalibrationDashboard({ adminKey }: { adminKey: string }) {
  const [runs, setRuns] = useState<CalibrationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/calibration?key=${encodeURIComponent(adminKey)}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load runs");
      setRuns(data.runs as CalibrationRun[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [adminKey]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // Auto-poll every 6 seconds while any run is queued or running so the
  // table reconciles as the worker processes the queue.
  useEffect(() => {
    const hasInflight = runs.some(
      (r) => r.reportStatus === "queued" || r.reportStatus === "running",
    );
    if (!hasInflight) return;
    const t = setInterval(fetchRuns, 6000);
    return () => clearInterval(t);
  }, [runs, fetchRuns]);

  const onSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSubmitting(true);
      setSubmitMsg(null);
      const urls = bulkText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"));
      if (urls.length === 0) {
        setSubmitMsg("Add at least one URL before queueing.");
        setSubmitting(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/admin/calibration?key=${encodeURIComponent(adminKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls }),
          },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Queue failed");
        setSubmitMsg(
          `Queued ${data.queued} · skipped ${data.skipped}` +
            (data.skipped > 0
              ? ` (${(data.skippedDetail as Array<{ url: string; reason: string }>)
                  .map((s) => `${s.url}: ${s.reason}`)
                  .join("; ")})`
              : ""),
        );
        setBulkText("");
        await fetchRuns();
      } catch (err) {
        setSubmitMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [bulkText, adminKey, fetchRuns],
  );

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      if (filter === "all") return true;
      if (typeof r.overall !== "number") return false;
      if (filter === "low") return r.overall < 30;
      if (filter === "high") return r.overall > 70;
      if (filter === "over-penalized") {
        if (typeof r.expectedScore !== "number") return false;
        return r.expectedScore - r.overall > 15;
      }
      return true;
    });
  }, [runs, filter]);

  const insights = useMemo(() => computeInsights(runs), [runs]);

  return (
    <div className="space-y-10">
      {/* URL input */}
      <form onSubmit={onSubmit} className="card">
        <p className="section-eyebrow">Step 1 · Queue audits</p>
        <h2 className="h3 mt-2">Paste URLs (one per line)</h2>
        <p className="muted mt-2 text-sm">
          Each non-empty line becomes a queued AuditOrder. Blank lines and
          lines starting with <code>#</code> are skipped.
        </p>
        <textarea
          className="input-field mt-4 font-mono text-sm"
          rows={8}
          placeholder={
            "https://acmeplumbing.com\nhttps://buckeyeprorroofing.com\n# add comments — this line is skipped"
          }
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || bulkText.trim().length === 0}
          >
            {submitting ? "Queueing…" : "Queue audits"}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => fetchRuns()}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          {submitMsg ? (
            <span className="text-xs text-white/70">{submitMsg}</span>
          ) : null}
        </div>
      </form>

      {/* Insights */}
      <div className="grid gap-5 md:grid-cols-3">
        <InsightCard label="Total runs" value={`${runs.length}`} />
        <InsightCard
          label="Mean / median (scored)"
          value={
            insights.scoredCount === 0
              ? "—"
              : `${insights.mean.toFixed(1)} · ${insights.median.toFixed(1)}`
          }
          hint={`${insights.scoredCount} scored`}
        />
        <InsightCard
          label="Score spread (σ)"
          value={
            insights.scoredCount < 2
              ? "—"
              : insights.stdDev.toFixed(2)
          }
          hint={
            insights.stdDev > 0 && insights.stdDev < 6
              ? "tight cluster — vary input quality more"
              : insights.stdDev >= 12
                ? "healthy spread"
                : "moderate spread"
          }
        />
      </div>

      {/* Histogram */}
      <Histogram bands={insights.bands} total={insights.scoredCount} />

      {/* Bottlenecks */}
      <div className="card">
        <p className="section-eyebrow">Category bottlenecks</p>
        <h3 className="h3 mt-2">Average score per category, across all runs</h3>
        <ul className="mt-4 space-y-3">
          {insights.categoryAverages.map((c) => (
            <li key={c.key}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-white">{c.label}</span>
                <span className="font-mono text-white/80">
                  {c.average === null ? "—" : c.average.toFixed(1)}
                  <span className="text-white/40"> / {c.max}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-accent"
                  style={{
                    width:
                      c.average === null
                        ? "0%"
                        : `${Math.round((c.average / c.max) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
        {insights.bottleneck ? (
          <p className="muted mt-4 text-sm">
            <strong className="text-white">Biggest bottleneck:</strong>{" "}
            {insights.bottleneck.label} — averaging{" "}
            {insights.bottleneck.average?.toFixed(1)} /{" "}
            {insights.bottleneck.max} across scored runs. Consider whether
            the rubric anchor here is too punitive or whether sampled sites
            genuinely lack this signal.
          </p>
        ) : null}
        {insights.commonZeroCategories.length > 0 ? (
          <p className="muted mt-2 text-sm">
            <strong className="text-white">Most common penalties:</strong>{" "}
            {insights.commonZeroCategories
              .map((c) => `${c.label} (${c.zeroCount} zero-banded)`)
              .join(" · ")}
          </p>
        ) : null}
      </div>

      {/* Filters + table */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow">Step 2 · Inspect</p>
            <h3 className="h3 mt-2">
              {filteredRuns.length} of {runs.length} runs
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "All" },
                { id: "low", label: "Low (<30)" },
                { id: "high", label: "High (>70)" },
                { id: "over-penalized", label: "Likely over-penalized" },
              ] as Array<{ id: Filter; label: string }>
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`pill ${filter === f.id ? "border-accent text-accent" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-white/45">
                <th className="px-2 py-2 font-semibold">URL</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold text-right">Overall</th>
                <th className="px-2 py-2 font-semibold text-right">Schema /25</th>
                <th className="px-2 py-2 font-semibold text-right">Crawler /20</th>
                <th className="px-2 py-2 font-semibold text-right">Trust /20</th>
                <th className="px-2 py-2 font-semibold text-right">Content /15</th>
                <th className="px-2 py-2 font-semibold text-right">Clarity /10</th>
                <th className="px-2 py-2 font-semibold text-right">Tech /10</th>
                <th className="px-2 py-2 font-semibold text-right">Expected</th>
                <th className="px-2 py-2 font-semibold text-right">Δ</th>
                <th className="px-2 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRuns.map((r) => (
                <RunRow
                  key={r.id}
                  run={r}
                  adminKey={adminKey}
                  onChange={fetchRuns}
                />
              ))}
              {filteredRuns.length === 0 ? (
                <tr>
                  <td
                    className="px-2 py-6 text-center text-white/50"
                    colSpan={12}
                  >
                    No calibration runs match the current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RunRow({
  run,
  adminKey,
  onChange,
}: {
  run: CalibrationRun;
  adminKey: string;
  onChange: () => void | Promise<void>;
}) {
  const [expectedDraft, setExpectedDraft] = useState<string>(
    run.expectedScore === null ? "" : String(run.expectedScore),
  );
  const [saving, setSaving] = useState(false);

  // Sync local draft when server-side value changes (poll refresh).
  useEffect(() => {
    setExpectedDraft(
      run.expectedScore === null ? "" : String(run.expectedScore),
    );
  }, [run.expectedScore]);

  const overall = run.overall;
  const expected =
    expectedDraft.trim() === "" ? null : Number(expectedDraft.trim());
  const delta =
    typeof overall === "number" && typeof expected === "number"
      ? expected - overall
      : null;

  const saveExpected = useCallback(async () => {
    setSaving(true);
    try {
      const value =
        expectedDraft.trim() === "" ? null : Number(expectedDraft.trim());
      await fetch(
        `/api/admin/calibration/${run.id}?key=${encodeURIComponent(adminKey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expected: value }),
        },
      );
      await onChange();
    } finally {
      setSaving(false);
    }
  }, [run.id, adminKey, expectedDraft, onChange]);

  const remove = useCallback(async () => {
    if (!confirm(`Delete calibration run for ${run.url}?`)) return;
    await fetch(
      `/api/admin/calibration/${run.id}?key=${encodeURIComponent(adminKey)}`,
      { method: "DELETE" },
    );
    await onChange();
  }, [run.id, run.url, adminKey, onChange]);

  return (
    <tr className="border-t border-white/5 align-top">
      <td className="px-2 py-3">
        <a
          href={run.url}
          target="_blank"
          rel="noreferrer"
          className="text-white hover:text-accent break-all"
        >
          {run.label}
        </a>
        <div className="mt-0.5 text-xs text-white/40 break-all">{run.url}</div>
      </td>
      <td className="px-2 py-3">
        <StatusBadge status={run.reportStatus} error={run.reportError} />
      </td>
      <td className="px-2 py-3 text-right font-mono">
        {overall === null ? "—" : <span className="text-white font-bold">{overall}</span>}
      </td>
      {run.categories.map((c) => (
        <td key={c.key} className="px-2 py-3 text-right font-mono text-white/85">
          {c.score === null ? "—" : c.score}
        </td>
      ))}
      <td className="px-2 py-3 text-right">
        <input
          type="number"
          min={0}
          max={100}
          value={expectedDraft}
          onChange={(e) => setExpectedDraft(e.target.value)}
          onBlur={saveExpected}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="w-16 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-right text-sm text-white"
          placeholder="—"
          disabled={saving}
        />
      </td>
      <td className="px-2 py-3 text-right font-mono">
        {delta === null ? (
          "—"
        ) : (
          <span
            className={
              delta > 15
                ? "text-orange-300"
                : delta < -15
                  ? "text-blue-300"
                  : "text-white/70"
            }
          >
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </td>
      <td className="px-2 py-3 text-right">
        <button
          type="button"
          onClick={remove}
          className="text-xs text-white/40 hover:text-red-300"
          aria-label={`Delete ${run.label}`}
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: string;
  error: string | null;
}) {
  const tone =
    status === "generated"
      ? "ok"
      : status === "running" || status === "queued"
        ? "info"
        : status === "failed"
          ? "bad"
          : "muted";
  const colors = {
    ok: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    info: "border-blue-400/40 bg-blue-400/10 text-blue-200",
    bad: "border-red-400/40 bg-red-400/10 text-red-200",
    muted: "border-white/15 bg-white/5 text-white/60",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] ${colors[tone]}`}
      title={error ?? undefined}
    >
      {status}
    </span>
  );
}

function InsightCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="card">
      <p className="text-xs uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-white/55">{hint}</p> : null}
    </div>
  );
}

function Histogram({
  bands,
  total,
}: {
  bands: Array<{ label: string; min: number; max: number; count: number }>;
  total: number;
}) {
  const peak = Math.max(1, ...bands.map((b) => b.count));
  return (
    <div className="card">
      <p className="section-eyebrow">Score distribution</p>
      <h3 className="h3 mt-2">
        {total === 0
          ? "No scored runs yet"
          : `${total} scored run${total === 1 ? "" : "s"}`}
      </h3>
      <ul className="mt-5 space-y-3">
        {bands.map((b) => (
          <li key={b.label}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-white/85">
                <span className="font-semibold">{b.label}</span>
                <span className="ml-2 text-xs text-white/45">
                  {b.min}–{b.max}
                </span>
              </span>
              <span className="font-mono text-white/85">{b.count}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.round((b.count / peak) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- insights ----------------

type Insights = {
  scoredCount: number;
  mean: number;
  median: number;
  stdDev: number;
  bands: Array<{ label: string; min: number; max: number; count: number }>;
  categoryAverages: Array<{
    key: string;
    label: string;
    max: number;
    average: number | null;
  }>;
  bottleneck: { label: string; max: number; average: number | null } | null;
  commonZeroCategories: Array<{ label: string; zeroCount: number }>;
};

function computeInsights(runs: CalibrationRun[]): Insights {
  const scored = runs.filter(
    (r) => typeof r.overall === "number",
  ) as Array<CalibrationRun & { overall: number }>;
  const scoredCount = scored.length;
  const mean = scoredCount === 0 ? 0 : avg(scored.map((r) => r.overall));
  const median = scoredCount === 0 ? 0 : medianOf(scored.map((r) => r.overall));
  const stdDev =
    scoredCount < 2
      ? 0
      : Math.sqrt(
          avg(scored.map((r) => (r.overall - mean) ** 2)),
        );

  const bands = BANDS.map((b) => ({
    ...b,
    count: scored.filter((r) => r.overall >= b.min && r.overall <= b.max)
      .length,
  }));

  // Category averages — pull from any run that has parsed scores
  // (regardless of overall presence) so partial parses still inform
  // per-category insights.
  const categoryKeys = scored[0]?.categories.map((c) => ({
    key: c.key,
    label: c.short,
    max: c.max,
  })) ?? [
    { key: "schema", label: "Business info AI can read", max: 25 },
    { key: "crawler", label: "AI tools can read your site", max: 20 },
    { key: "trust", label: "Local trust signals", max: 20 },
    { key: "content", label: "Service pages + FAQs", max: 15 },
    { key: "brand", label: "Business clarity", max: 10 },
    { key: "tech", label: "Site reachability", max: 10 },
  ];

  const categoryAverages = categoryKeys.map((ck) => {
    const values = scored
      .map((r) => r.categories.find((c) => c.key === ck.key)?.score)
      .filter((v): v is number => typeof v === "number");
    return {
      key: ck.key,
      label: ck.label,
      max: ck.max,
      average: values.length === 0 ? null : avg(values),
    };
  });

  const bottleneck =
    categoryAverages
      .filter((c) => typeof c.average === "number")
      .map((c) => ({
        label: c.label,
        max: c.max,
        average: c.average,
        ratio: (c.average ?? 0) / c.max,
      }))
      .sort((a, b) => a.ratio - b.ratio)[0] ?? null;

  const zeroBandThreshold = (max: number) =>
    max >= 25 ? 6 : max >= 20 ? 6 : max >= 15 ? 5 : 2;
  const commonZeroCategories = categoryKeys
    .map((ck) => {
      const zeroCount = scored.reduce((acc, r) => {
        const v = r.categories.find((c) => c.key === ck.key)?.score;
        return typeof v === "number" && v <= zeroBandThreshold(ck.max)
          ? acc + 1
          : acc;
      }, 0);
      return { label: ck.label, zeroCount };
    })
    .filter((c) => c.zeroCount >= Math.max(2, Math.ceil(scoredCount / 3)))
    .sort((a, b) => b.zeroCount - a.zeroCount)
    .slice(0, 3);

  return {
    scoredCount,
    mean,
    median,
    stdDev,
    bands,
    categoryAverages,
    bottleneck: bottleneck
      ? { label: bottleneck.label, max: bottleneck.max, average: bottleneck.average }
      : null,
    commonZeroCategories,
  };
}

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function medianOf(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
