"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { costTone, type CostTone } from "@/lib/pricing";
import { OperatorInsightsPanel } from "@/components/OperatorInsightsPanel";
import { ReplayHistoryPanel } from "@/components/ReplayHistoryPanel";
import {
  BENCHMARK_TAG_OPTIONS,
  OPERATOR_CONFIDENCE_OPTIONS,
  OPERATOR_VERDICT_OPTIONS,
  benchmarkTagLabel,
  formatAvgConfidence,
  operatorConfidenceLabel,
  operatorVerdictLabel,
  summarizeCalibration,
  type CalibrationInput,
} from "@/lib/intelligence/calibration";

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
  businessName: string;
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
  // Operator-intelligence telemetry (added Phase 1 / 1.5). Null for
  // historic rows or CLI-mode runs.
  estimatedCostUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  modelUsed: string | null;
  workerRuntimeMs: number | null;
  retryCount: number;
  failureReason: string | null;
  // V2 calibration intelligence — operator-judgment fields. Null
  // until the operator tags this audit. industryCategoryNormalized
  // is auto-derived by the V2 taxonomy module; the four "operator*"
  // / benchmark / notes fields are manually set.
  industryCategoryNormalized: string | null;
  operatorVerdict: string | null;
  operatorConfidence: string | null;
  benchmarkTag: string | null;
  calibrationNotes: string | null;
};

type Filter =
  | "all"
  | "low"
  | "high"
  | "over-penalized"
  | "generated"
  | "queued"
  | "failed"
  | "retrying"
  | "high-cost";

const HIGH_COST_USD = 0.15;

const BANDS: Array<{ label: string; min: number; max: number }> = [
  { label: "Invisible", min: 0, max: 25 },
  { label: "At Risk", min: 26, max: 45 },
  { label: "Needs Work", min: 46, max: 65 },
  { label: "Competitive", min: 66, max: 80 },
  { label: "AI-Ready", min: 81, max: 100 },
];

// Active = at least one calibration row is queued/running. Idle =
// everything terminal. Active cadence at 8s sits in the middle of
// the 8–10s "operator-grade" target — snappy enough that the queue
// feels live during active testing, calm enough not to hammer the
// API or flicker the operator's screen. Idle cadence at 30s is the
// upper end of the 20–30s spec; safe when nothing's moving.
//
// History: started at 3s during early-build testing → cut to 6s in
// the first rate-limit pass → 8s now per the operator-polling spec.
// Coupled with the 300/5min cap on `/api/admin/calibration` and the
// in-component 429 pause below.
const POLL_ACTIVE_MS = 8000;
const POLL_IDLE_MS = 30000;

export function CalibrationDashboard({ adminKey }: { adminKey: string }) {
  const [runs, setRuns] = useState<CalibrationRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkIndustry, setBulkIndustry] = useState("");
  const [bulkBenchmarkTag, setBulkBenchmarkTag] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);
  // 429 back-off — when the server rate-limits us, set this to a
  // future ms. Every subsequent poll exits early until the clock
  // passes. Naturally resumes; no retry loop. `pausedUntilMs > 0`
  // also drives the friendly "Refreshing paused…" UI below.
  const [pausedUntilMs, setPausedUntilMs] = useState(0);

  // Tick once a second so the "X seconds ago" label updates without
  // re-fetching. Cheap, decoupled from the polling loop.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const fetchRuns = useCallback(async () => {
    // If we're in a 429 cool-off window, skip this poll entirely.
    // The user-visible "Refreshing paused…" label is driven off the
    // same `pausedUntilMs` state, so the UX matches what's happening.
    if (Date.now() < pausedUntilMs) return;
    setLoading(true);
    setError(null);
    try {
      // Cache-bust on every poll so a CDN edge / browser cache can't
      // serve a stale list while the worker is processing the queue.
      const res = await fetch(
        `/api/admin/calibration?key=${encodeURIComponent(adminKey)}&t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (res.status === 429) {
        // Honor Retry-After (seconds). Falls back to 30s when missing.
        // We DON'T set an error message — the operator's not at fault
        // and "Too many requests" is scary. The status strip surfaces
        // a friendly "Refreshing paused…" label instead.
        const retryAfter =
          Number(res.headers.get("Retry-After")) || 30;
        setPausedUntilMs(Date.now() + retryAfter * 1000);
        console.warn(
          `[calibration] poll throttled — pausing ${retryAfter}s`,
        );
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load runs");
      setRuns(data.runs as CalibrationRun[]);
      setLastFetched(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [adminKey, pausedUntilMs]);

  // Stable polling loop. We avoid putting `runs` in the deps so the
  // interval doesn't tear down + recreate on every fetch (which would
  // cause race conditions where the timer never fires).
  const fetchRef = useRef(fetchRuns);
  useEffect(() => {
    fetchRef.current = fetchRuns;
  }, [fetchRuns]);

  const hasInflight = useMemo(
    () =>
      runs.some(
        (r) => r.reportStatus === "queued" || r.reportStatus === "running",
      ),
    [runs],
  );

  useEffect(() => {
    fetchRef.current();
    const interval = hasInflight ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const t = setInterval(() => fetchRef.current(), interval);
    return () => clearInterval(t);
  }, [hasInflight]);

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
      // Optional operator-supplied benchmark tagging. Empty inputs
      // submit as undefined so the POST handler falls back to the
      // original URL-only behavior — no inference change, fully
      // backwards compatible.
      const industry = bulkIndustry.trim().length > 0 ? bulkIndustry.trim() : undefined;
      const benchmarkTag =
        bulkBenchmarkTag.trim().length > 0 ? bulkBenchmarkTag.trim() : undefined;
      try {
        const res = await fetch(
          `/api/admin/calibration?key=${encodeURIComponent(adminKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls, industry, benchmarkTag }),
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
        setBulkIndustry("");
        setBulkBenchmarkTag("");
        await fetchRuns();
      } catch (err) {
        setSubmitMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setSubmitting(false);
      }
    },
    [bulkText, bulkIndustry, bulkBenchmarkTag, adminKey, fetchRuns],
  );

  const counts = useMemo(() => bucketCounts(runs), [runs]);
  const filteredRuns = useMemo(() => filterRuns(runs, filter), [runs, filter]);
  const insights = useMemo(() => computeInsights(runs), [runs]);
  // Today-scoped operator stats — narrow window of the same `runs`
  // array, no additional fetch needed. Cheap to recompute on every
  // poll because `runs` shape is small (~500 max).
  const todayStats = useMemo(() => computeTodayStats(runs), [runs]);
  const opIntelligence = useMemo(
    () => computeOperatorIntelligence(runs),
    [runs],
  );
  const failureIntel = useMemo(
    () => computeFailureIntelligence(runs),
    [runs],
  );
  const topExpensive = useMemo(
    () => computeTopExpensive(runs, 5),
    [runs],
  );
  const calibrationSummary = useMemo(
    () =>
      summarizeCalibration(
        runs.map<CalibrationInput>((r) => ({
          operatorVerdict: r.operatorVerdict,
          operatorConfidence: r.operatorConfidence,
          benchmarkTag: r.benchmarkTag,
          industryCategoryNormalized: r.industryCategoryNormalized,
        })),
      ),
    [runs],
  );

  const lastFetchedAgo =
    lastFetched === null ? null : Math.max(0, Math.round((Date.now() - lastFetched.getTime()) / 1000));
  // tick is referenced so the ago-label re-renders every second.
  void tick;

  return (
    <div className="space-y-10">
      {/* Today summary — operator-facing telemetry strip. Today =
          since midnight UTC. Six tiles: audits today, generated
          today, queued+running, failed, avg cost, avg runtime.
          Mobile 2x3 grid; desktop 6x1. */}
      <OperatorTodayStrip stats={todayStats} />

      {/* Deterministic operator insights — pure telemetry templates;
          no LLM, no consultant prose. Polls every 60s. */}
      <OperatorInsightsPanel adminKey={adminKey} />

      {/* Replay history — append-only calibration telemetry from
          scripts/replay-audits.ts --persist. Pure read; polls every
          30s. See src/components/ReplayHistoryPanel.tsx. */}
      <ReplayHistoryPanel adminKey={adminKey} />

      {/* Lightweight intelligence — text-only insights. No charts.
          Surfaces the highest-cost / highest-runtime / penalty-
          category-leader observations that an operator scanning
          this page needs without opening a row. */}
      <OperatorIntelligenceBlock intel={opIntelligence} />

      {/* Calibration intelligence — structured operator-judgment
          summary. Renders only once there's at least one tagged
          row; stays out of the way during empty-state. */}
      <CalibrationIntelligenceBlock summary={calibrationSummary} />

      {/* Failure intelligence — surfaces the dominant failure modes
          across today's run + total retry pressure. Renders only
          when there's at least one failure or retry to discuss. */}
      <FailureIntelligenceBlock intel={failureIntel} />

      {/* Top expensive audits — the 5 highest-cost rows across the
          whole window with their token + runtime profile, so an
          operator can spot outliers without sorting the table. */}
      <TopExpensiveAuditsBlock rows={topExpensive} />

      {/* Operator guidance — static text hints. No data; just a
          shared mental model for what makes audits expensive. */}
      <OperatorGuidanceBlock />

      {/* Live status strip — always visible, updates every poll */}
      <StatusStrip
        counts={counts}
        loading={loading}
        lastFetchedAgo={lastFetchedAgo}
        onRefresh={fetchRuns}
        pausedSecondsRemaining={
          pausedUntilMs > Date.now()
            ? Math.ceil((pausedUntilMs - Date.now()) / 1000)
            : 0
        }
      />

      {/* Active batch progress */}
      {counts.total > 0 && counts.queued + counts.running > 0 ? (
        <ProgressBar counts={counts} />
      ) : null}

      {/* URL input */}
      <form onSubmit={onSubmit} className="card">
        <p className="section-eyebrow">Step 1 · Queue audits</p>
        <h2 className="h3 mt-2">Paste URLs (one per line)</h2>
        <p className="muted mt-2 text-sm">
          Each non-empty line becomes a queued AuditOrder. Blank lines and
          lines starting with <code>#</code> are skipped. The Railway
          worker picks them up alongside any real customer queue — expect
          ~60–120s per audit.
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
        {/* Optional operator-supplied benchmark tagging. Both fields
            are entirely optional — leave blank to keep the existing
            URL-only inference behavior. When supplied, the values
            apply to every URL in this batch and override automatic
            industry inference on the resulting AuditIntelligence
            rows. */}
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-xs">
            <span className="text-white/55">
              Industry (optional, applies to all URLs)
            </span>
            <input
              type="text"
              className="input-field mt-1 font-mono text-sm"
              placeholder="e.g. roofing, hvac, legal"
              value={bulkIndustry}
              onChange={(e) => setBulkIndustry(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            <span className="text-white/55">
              Benchmark tag (optional, e.g. roofing_batch_1)
            </span>
            <input
              type="text"
              className="input-field mt-1 font-mono text-sm"
              placeholder="cohort name for this batch"
              value={bulkBenchmarkTag}
              onChange={(e) => setBulkBenchmarkTag(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting || bulkText.trim().length === 0}
          >
            {submitting ? "Queueing…" : "Queue audits"}
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
            insights.scoredCount < 2
              ? undefined
              : insights.stdDev < 6
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
            {insights.bottleneck.max} across scored runs.
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
              Showing {filteredRuns.length} of {runs.length} runs
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "all", label: "All" },
                { id: "generated", label: "Generated" },
                { id: "queued", label: "Queued / running" },
                { id: "failed", label: "Failed" },
                { id: "retrying", label: "Retrying" },
                { id: "high-cost", label: `High cost ≥ $${HIGH_COST_USD.toFixed(2)}` },
                { id: "low", label: "Low score (<30)" },
                { id: "high", label: "High score (>70)" },
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
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-white/45">
                <th className="px-2 py-2 font-semibold">Business · URL</th>
                <th className="px-2 py-2 font-semibold">Status</th>
                <th className="px-2 py-2 font-semibold text-right">Overall</th>
                <th className="px-2 py-2 font-semibold text-right">Cost</th>
                <th className="px-2 py-2 font-semibold text-right">Runtime</th>
                <th className="px-2 py-2 font-semibold text-right">Retries</th>
                <th className="px-2 py-2 font-semibold">Model</th>
                <th className="px-2 py-2 font-semibold text-right">Schema /25</th>
                <th className="px-2 py-2 font-semibold text-right">Crawler /20</th>
                <th className="px-2 py-2 font-semibold text-right">Trust /20</th>
                <th className="px-2 py-2 font-semibold text-right">Content /15</th>
                <th className="px-2 py-2 font-semibold text-right">Clarity /10</th>
                <th className="px-2 py-2 font-semibold text-right">Tech /10</th>
                <th className="px-2 py-2 font-semibold text-right">Expected</th>
                <th className="px-2 py-2 font-semibold">Calibration</th>
                <th className="px-2 py-2 font-semibold text-right">Δ</th>
                <th className="px-2 py-2 font-semibold">Report</th>
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
                    className="px-2 py-8 text-center text-white/55"
                    colSpan={13}
                  >
                    {runs.length === 0 ? (
                      <>
                        No calibration runs yet. Paste URLs above and click{" "}
                        <strong className="text-white">Queue audits</strong>{" "}
                        to start.
                      </>
                    ) : (
                      <>
                        No runs match the current filter.{" "}
                        <button
                          type="button"
                          onClick={() => setFilter("all")}
                          className="text-accent hover:underline"
                        >
                          Show all {runs.length}
                        </button>
                      </>
                    )}
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

function StatusStrip({
  counts,
  loading,
  lastFetchedAgo,
  onRefresh,
  pausedSecondsRemaining,
}: {
  counts: CountsByStatus;
  loading: boolean;
  lastFetchedAgo: number | null;
  onRefresh: () => void;
  /** Seconds remaining in a 429 back-off pause; 0 = not paused. */
  pausedSecondsRemaining: number;
}) {
  const isPaused = pausedSecondsRemaining > 0;
  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="section-eyebrow">Live queue</p>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs ${isPaused ? "text-amber-200" : "text-white/55"}`}
            aria-live="polite"
          >
            {isPaused
              ? `Refreshing paused — retrying in ${pausedSecondsRemaining}s`
              : loading
                ? "Refreshing…"
                : lastFetchedAgo === null
                  ? "Not yet fetched"
                  : `Updated ${lastFetchedAgo}s ago`}
          </span>
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={onRefresh}
            disabled={loading || isPaused}
          >
            Refresh now
          </button>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Counter label="Queued" value={counts.queued} tone="info" />
        <Counter label="Running" value={counts.running} tone="info" />
        <Counter label="Completed" value={counts.completed} tone="ok" />
        <Counter label="Failed" value={counts.failed} tone="bad" />
        <Counter label="Total" value={counts.total} tone="muted" />
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "info" | "bad" | "muted";
}) {
  const colorMap = {
    ok: "text-emerald-300 border-emerald-400/30 bg-emerald-400/5",
    info: "text-blue-300 border-blue-400/30 bg-blue-400/5",
    bad: "text-red-300 border-red-400/30 bg-red-400/5",
    muted: "text-white/85 border-white/10 bg-white/[0.03]",
  } as const;
  return (
    <div className={`rounded-lg border px-3 py-2 ${colorMap[tone]}`}>
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p className="mt-1 font-mono text-2xl font-bold">{value}</p>
    </div>
  );
}

function ProgressBar({ counts }: { counts: CountsByStatus }) {
  const done = counts.completed + counts.failed;
  const total = counts.total;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="rounded-lg border border-accent/30 bg-accent/[0.04] p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-white">
          Batch in progress · {done} of {total} done
        </p>
        <p className="font-mono text-xs text-white/70">{pct}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-accent transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-white/55">
        Auto-refreshing every {POLL_ACTIVE_MS / 1000}s while audits are
        running. You can leave this page open — counters update on their
        own.
      </p>
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
  // V2 calibration intelligence — operator-judgment editor expansion.
  // Each row tracks its own expand state; only the editor row below
  // renders conditionally. Notes use a local draft so we don't PATCH
  // on every keystroke; dropdowns save on change.
  const [calOpen, setCalOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>(
    run.calibrationNotes ?? "",
  );
  const [calSaving, setCalSaving] = useState(false);
  useEffect(() => {
    setNotesDraft(run.calibrationNotes ?? "");
  }, [run.calibrationNotes]);
  const patchCalibration = useCallback(
    async (
      patch: Partial<{
        operatorVerdict: string | null;
        operatorConfidence: string | null;
        benchmarkTag: string | null;
        calibrationNotes: string | null;
      }>,
    ) => {
      setCalSaving(true);
      try {
        await fetch(
          `/api/admin/audit-intelligence/${encodeURIComponent(run.id)}?key=${encodeURIComponent(adminKey)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        await onChange();
      } finally {
        setCalSaving(false);
      }
    },
    [run.id, adminKey, onChange],
  );

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
    <>
    <tr className="border-t border-white/5 align-top">
      <td className="px-2 py-3">
        <div className="font-semibold text-white break-words">
          {run.businessName}
        </div>
        <a
          href={run.url}
          target="_blank"
          rel="noreferrer"
          className="mt-0.5 block text-xs text-white/45 break-all hover:text-accent"
        >
          {run.url}
        </a>
      </td>
      <td className="px-2 py-3">
        <StatusBadge status={run.reportStatus} error={run.reportError} />
        {run.reportStatus === "failed" && run.failureReason ? (
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-red-300/85">
            {run.failureReason.replace(/_/g, " ")}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-3 text-right font-mono">
        {overall === null ? "—" : <span className="font-bold text-white">{overall}</span>}
      </td>
      <td className="px-2 py-3 text-right font-mono">
        {typeof run.estimatedCostUsd === "number" ? (
          <CostCell cost={run.estimatedCostUsd} />
        ) : (
          <span className="text-white/30">—</span>
        )}
      </td>
      <td className="px-2 py-3 text-right font-mono text-white/85">
        {formatShortRuntime(run.workerRuntimeMs)}
      </td>
      <td className="px-2 py-3 text-right font-mono">
        {run.retryCount > 0 ? (
          <span className="text-amber-200">{run.retryCount}</span>
        ) : (
          <span className="text-white/40">0</span>
        )}
      </td>
      <td className="px-2 py-3 font-mono text-xs text-white/65">
        {formatShortModel(run.modelUsed)}
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
      <td className="px-2 py-3">
        <button
          type="button"
          onClick={() => setCalOpen((v) => !v)}
          className={`pill text-[10px] ${run.operatorVerdict ? "border-accent/40 text-accent" : ""}`}
          aria-expanded={calOpen}
          aria-label="Toggle calibration editor"
        >
          {run.operatorVerdict
            ? operatorVerdictLabel(run.operatorVerdict)
            : "Tag"}
          <span className="ml-1 text-white/40">{calOpen ? "▾" : "▸"}</span>
        </button>
      </td>
      <td className="px-2 py-3">
        {run.reportStatus === "generated" ? (
          <a
            href={`/report/${encodeURIComponent(run.id)}/print`}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-accent hover:underline"
          >
            Open ↗
          </a>
        ) : (
          <span className="text-xs text-white/30">—</span>
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
    {calOpen ? (
      <tr className="border-t border-white/[0.03] bg-white/[0.015]">
        <td colSpan={18} className="px-4 py-4">
          <CalibrationEditor
            run={run}
            notesDraft={notesDraft}
            setNotesDraft={setNotesDraft}
            saving={calSaving}
            onPatch={patchCalibration}
            onClose={() => setCalOpen(false)}
          />
        </td>
      </tr>
    ) : null}
    </>
  );
}

function CalibrationEditor({
  run,
  notesDraft,
  setNotesDraft,
  saving,
  onPatch,
  onClose,
}: {
  run: CalibrationRun;
  notesDraft: string;
  setNotesDraft: (s: string) => void;
  saving: boolean;
  onPatch: (patch: {
    operatorVerdict?: string | null;
    operatorConfidence?: string | null;
    benchmarkTag?: string | null;
    calibrationNotes?: string | null;
  }) => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
          Calibration intelligence
          <span className="ml-2 font-normal normal-case tracking-normal text-white/35">
            (internal · operator memory only)
          </span>
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] text-white/45 hover:text-white/85"
        >
          Close
        </button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <CalSelect
          label="Operator verdict"
          value={run.operatorVerdict}
          options={OPERATOR_VERDICT_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          disabled={saving}
          onChange={(v) => onPatch({ operatorVerdict: v })}
        />
        <CalSelect
          label="Operator confidence in score"
          value={run.operatorConfidence}
          options={OPERATOR_CONFIDENCE_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          disabled={saving}
          onChange={(v) => onPatch({ operatorConfidence: v })}
        />
        <CalSelect
          label="Benchmark tag"
          value={run.benchmarkTag}
          options={BENCHMARK_TAG_OPTIONS.map((o) => ({
            value: o.value,
            label: o.label,
          }))}
          disabled={saving}
          onChange={(v) => onPatch({ benchmarkTag: v })}
        />
      </div>
      <div>
        <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
          Calibration notes
        </label>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() =>
            onPatch({
              calibrationNotes:
                notesDraft.trim().length === 0 ? null : notesDraft,
            })
          }
          disabled={saving}
          placeholder="Why this score feels right / wrong, what to recalibrate, edge-case context…"
          rows={2}
          className="mt-1.5 w-full resize-y rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/90 placeholder-white/30"
        />
        <p className="mt-1 text-[10px] text-white/35">
          Saved on blur · up to 2,000 chars
        </p>
      </div>
    </div>
  );
}

function CalSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  options: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
        {label}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        disabled={disabled}
        className="mt-1.5 w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-sm text-white"
      >
        <option value="">— Not tagged</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
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

// ---------------- helpers ----------------

type CountsByStatus = {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  pending: number;
  total: number;
};

function bucketCounts(runs: CalibrationRun[]): CountsByStatus {
  const out: CountsByStatus = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0,
    pending: 0,
    total: runs.length,
  };
  for (const r of runs) {
    if (r.reportStatus === "queued") out.queued++;
    else if (r.reportStatus === "running") out.running++;
    else if (r.reportStatus === "generated") out.completed++;
    else if (r.reportStatus === "failed") out.failed++;
    else out.pending++;
  }
  return out;
}

function filterRuns(runs: CalibrationRun[], filter: Filter): CalibrationRun[] {
  return runs.filter((r) => {
    if (filter === "all") return true;
    // Operational-state filters (don't require a score to be parseable)
    if (filter === "generated") return r.reportStatus === "generated";
    if (filter === "queued") {
      return r.reportStatus === "queued" || r.reportStatus === "running";
    }
    if (filter === "failed") return r.reportStatus === "failed";
    if (filter === "retrying") return r.retryCount > 0;
    if (filter === "high-cost") {
      return (
        typeof r.estimatedCostUsd === "number" &&
        r.estimatedCostUsd >= HIGH_COST_USD
      );
    }
    // Score-band filters — require a parsed overall score.
    if (typeof r.overall !== "number") return false;
    if (filter === "low") return r.overall < 30;
    if (filter === "high") return r.overall > 70;
    if (filter === "over-penalized") {
      if (typeof r.expectedScore !== "number") return false;
      return r.expectedScore - r.overall > 15;
    }
    return true;
  });
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
      : Math.sqrt(avg(scored.map((r) => (r.overall - mean) ** 2)));

  const bands = BANDS.map((b) => ({
    ...b,
    count: scored.filter((r) => r.overall >= b.min && r.overall <= b.max)
      .length,
  }));

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
    { key: "tech", label: "AI Readability", max: 10 },
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

// ───────────────────────────────────────────────────────────────
// Operator-intelligence surfaces (added when the calibration page
// became the operator dashboard). All pure functions over the
// existing `runs` array — no extra fetches, no DB calls.
// ───────────────────────────────────────────────────────────────

type TodayStats = {
  total: number;
  generated: number;
  inflight: number;
  failed: number;
  avgCostUsd: number | null;
  highestCostUsd: number | null;
  totalSpendUsd: number;
  avgRuntimeMs: number | null;
  totalRetries: number;
  mostUsedModel: string | null;
};

function computeTodayStats(runs: CalibrationRun[]): TodayStats {
  // Today = since midnight UTC of the current date. Matches the
  // worker's UTC timestamps; the operator gets "what happened
  // today" without TZ math.
  const startOfTodayUtc = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const today = runs.filter((r) => {
    const created = Date.parse(r.createdAt);
    return Number.isFinite(created) && created >= startOfTodayUtc;
  });
  const generated = today.filter((r) => r.reportStatus === "generated");
  const inflight = today.filter(
    (r) => r.reportStatus === "queued" || r.reportStatus === "running",
  );
  const failed = today.filter((r) => r.reportStatus === "failed");
  const costs = generated
    .map((r) => r.estimatedCostUsd)
    .filter((v): v is number => typeof v === "number");
  const runtimes = generated
    .map((r) => r.workerRuntimeMs)
    .filter((v): v is number => typeof v === "number");
  const totalRetries = today.reduce((sum, r) => sum + r.retryCount, 0);
  // Most-used model across today's audits (only counts rows that
  // recorded a model — backfilled rows leave modelUsed null).
  const modelCounts = new Map<string, number>();
  for (const r of today) {
    if (!r.modelUsed) continue;
    modelCounts.set(r.modelUsed, (modelCounts.get(r.modelUsed) ?? 0) + 1);
  }
  let mostUsedModel: string | null = null;
  let mostUsedCount = 0;
  for (const [model, count] of modelCounts) {
    if (count > mostUsedCount) {
      mostUsedModel = model;
      mostUsedCount = count;
    }
  }
  return {
    total: today.length,
    generated: generated.length,
    inflight: inflight.length,
    failed: failed.length,
    avgCostUsd:
      costs.length === 0 ? null : costs.reduce((a, b) => a + b, 0) / costs.length,
    highestCostUsd: costs.length === 0 ? null : Math.max(...costs),
    totalSpendUsd: costs.reduce((a, b) => a + b, 0),
    avgRuntimeMs:
      runtimes.length === 0
        ? null
        : runtimes.reduce((a, b) => a + b, 0) / runtimes.length,
    totalRetries,
    mostUsedModel,
  };
}

function OperatorTodayStrip({ stats }: { stats: TodayStats }) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
      <p className="section-eyebrow">
        Operational intelligence · today (since 00:00 UTC)
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        <TodayTile label="Audits today" value={String(stats.total)} />
        <TodayTile label="Generated" value={String(stats.generated)} tone="ok" />
        <TodayTile
          label="Queued / running"
          value={String(stats.inflight)}
          tone={stats.inflight > 0 ? "info" : "muted"}
        />
        <TodayTile
          label="Failed today"
          value={String(stats.failed)}
          tone={stats.failed > 0 ? "bad" : "muted"}
        />
        <TodayTile
          label="Retries today"
          value={String(stats.totalRetries)}
          tone={stats.totalRetries > 0 ? "info" : "muted"}
        />
        <TodayTile
          label="Avg audit cost"
          value={
            stats.avgCostUsd === null
              ? "—"
              : `$${stats.avgCostUsd.toFixed(4)}`
          }
          costTone={costTone(stats.avgCostUsd)}
        />
        <TodayTile
          label="Highest cost"
          value={
            stats.highestCostUsd === null
              ? "—"
              : `$${stats.highestCostUsd.toFixed(4)}`
          }
          costTone={costTone(stats.highestCostUsd)}
        />
        <TodayTile
          label="Total spend today"
          value={
            stats.totalSpendUsd === 0
              ? "—"
              : `$${stats.totalSpendUsd.toFixed(4)}`
          }
        />
        <TodayTile
          label="Avg runtime"
          value={formatShortRuntime(stats.avgRuntimeMs)}
        />
        <TodayTile
          label="Most-used model"
          value={
            stats.mostUsedModel ? formatShortModel(stats.mostUsedModel) : "—"
          }
        />
      </div>
    </div>
  );
}

function TodayTile({
  label,
  value,
  tone,
  costTone: ctone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "info" | "bad" | "muted";
  costTone?: CostTone;
}) {
  const colorClass =
    ctone === "low"
      ? "border-emerald-300/30 bg-emerald-300/[0.06] text-emerald-200"
      : ctone === "medium"
        ? "border-amber-300/30 bg-amber-300/[0.06] text-amber-200"
        : ctone === "high"
          ? "border-red-400/30 bg-red-500/[0.06] text-red-200"
          : tone === "ok"
            ? "border-emerald-400/30 bg-emerald-400/[0.05] text-emerald-200"
            : tone === "info"
              ? "border-blue-400/30 bg-blue-400/[0.05] text-blue-200"
              : tone === "bad"
                ? "border-red-400/30 bg-red-400/[0.05] text-red-200"
                : "border-white/10 bg-white/[0.02] text-white/85";
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${colorClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </p>
      <p className="mt-1 font-mono text-base font-semibold">{value}</p>
    </div>
  );
}

type OperatorIntelligence = {
  avgScoreToday: number | null;
  highestCost: { value: number; runId: string; url: string } | null;
  highestRuntime: { value: number; runId: string; url: string } | null;
  mostCommonPenaltyCategory: { label: string; avgRatio: number } | null;
  totalRetries: number;
};

function computeOperatorIntelligence(
  runs: CalibrationRun[],
): OperatorIntelligence {
  const startOfTodayUtc = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const today = runs.filter((r) => {
    const created = Date.parse(r.createdAt);
    return Number.isFinite(created) && created >= startOfTodayUtc;
  });
  const todayScored = today.filter(
    (r): r is CalibrationRun & { overall: number } =>
      typeof r.overall === "number",
  );
  const avgScoreToday =
    todayScored.length === 0
      ? null
      : todayScored.reduce((sum, r) => sum + r.overall, 0) / todayScored.length;

  // Highest cost (any time window — operator wants outliers visible).
  const costRuns = runs.filter(
    (r): r is CalibrationRun & { estimatedCostUsd: number } =>
      typeof r.estimatedCostUsd === "number",
  );
  const highestCost = costRuns.length
    ? costRuns.reduce((max, r) =>
        r.estimatedCostUsd > max.estimatedCostUsd ? r : max,
      )
    : null;

  const runtimeRuns = runs.filter(
    (r): r is CalibrationRun & { workerRuntimeMs: number } =>
      typeof r.workerRuntimeMs === "number",
  );
  const highestRuntime = runtimeRuns.length
    ? runtimeRuns.reduce((max, r) =>
        r.workerRuntimeMs > max.workerRuntimeMs ? r : max,
      )
    : null;

  // Penalty leader — across scored runs, find the rubric category
  // with the LOWEST average score-to-max ratio. That's the bottleneck
  // the operator should consider when interpreting scores.
  const scored = runs.filter(
    (r): r is CalibrationRun & { overall: number } =>
      typeof r.overall === "number",
  );
  let mostCommonPenaltyCategory: OperatorIntelligence["mostCommonPenaltyCategory"] =
    null;
  if (scored.length > 0) {
    const categoryKeys = scored[0]?.categories.map((c) => ({
      key: c.key,
      label: c.short,
      max: c.max,
    })) ?? [];
    let worst: { label: string; avgRatio: number } | null = null;
    for (const cat of categoryKeys) {
      const ratios = scored
        .map((r) => r.categories.find((c) => c.key === cat.key)?.score ?? null)
        .filter((v): v is number => typeof v === "number")
        .map((v) => v / cat.max);
      if (ratios.length === 0) continue;
      const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
      if (!worst || avgRatio < worst.avgRatio) {
        worst = { label: cat.label, avgRatio };
      }
    }
    mostCommonPenaltyCategory = worst;
  }

  const totalRetries = runs.reduce((s, r) => s + r.retryCount, 0);

  return {
    avgScoreToday,
    highestCost: highestCost
      ? {
          value: highestCost.estimatedCostUsd,
          runId: highestCost.id,
          url: highestCost.url,
        }
      : null,
    highestRuntime: highestRuntime
      ? {
          value: highestRuntime.workerRuntimeMs,
          runId: highestRuntime.id,
          url: highestRuntime.url,
        }
      : null,
    mostCommonPenaltyCategory,
    totalRetries,
  };
}

function OperatorIntelligenceBlock({
  intel,
}: {
  intel: OperatorIntelligence;
}) {
  const lines: string[] = [];
  if (intel.avgScoreToday !== null) {
    lines.push(
      `Average overall score today: ${intel.avgScoreToday.toFixed(1)}`,
    );
  }
  if (intel.mostCommonPenaltyCategory) {
    lines.push(
      `Most common penalty category: ${intel.mostCommonPenaltyCategory.label} (avg ${(intel.mostCommonPenaltyCategory.avgRatio * 100).toFixed(0)}% of max)`,
    );
  }
  if (intel.highestCost) {
    lines.push(
      `Highest cost: $${intel.highestCost.value.toFixed(4)} — ${hostFromUrl(intel.highestCost.url)}`,
    );
  }
  if (intel.highestRuntime) {
    lines.push(
      `Highest runtime: ${formatShortRuntime(intel.highestRuntime.value)} — ${hostFromUrl(intel.highestRuntime.url)}`,
    );
  }
  if (intel.totalRetries > 0) {
    lines.push(`Retry attempts across all runs: ${intel.totalRetries}`);
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.015] p-4 text-xs leading-relaxed text-white/75">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/55">
        Operator intelligence
      </p>
      <ul className="mt-2 space-y-1">
        {lines.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Failure intelligence — operator-facing breakdown of failure
// modes + retry pressure. Reads only the existing runs[] array;
// no extra fetches.
// ────────────────────────────────────────────────────────────

type FailureIntel = {
  failedTotal: number;
  failedToday: number;
  retriesToday: number;
  byReason: Array<{ reason: string; count: number }>;
  topReason: { reason: string; count: number } | null;
};

function computeFailureIntelligence(runs: CalibrationRun[]): FailureIntel {
  const startOfTodayUtc = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const today = runs.filter((r) => {
    const created = Date.parse(r.createdAt);
    return Number.isFinite(created) && created >= startOfTodayUtc;
  });
  const todayFailed = today.filter((r) => r.reportStatus === "failed");
  const allFailed = runs.filter((r) => r.reportStatus === "failed");
  const retriesToday = today.reduce((sum, r) => sum + r.retryCount, 0);

  // Count failure reasons across ALL failed rows (broader window for
  // pattern detection). The "today" count above is for the operator's
  // immediate situational awareness.
  const reasonCounts = new Map<string, number>();
  for (const r of allFailed) {
    const reason = r.failureReason ?? "unspecified";
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const byReason = [...reasonCounts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    failedTotal: allFailed.length,
    failedToday: todayFailed.length,
    retriesToday,
    byReason,
    topReason: byReason[0] ?? null,
  };
}

function FailureIntelligenceBlock({ intel }: { intel: FailureIntel }) {
  // Hide entirely when there's nothing to surface — keeps the
  // dashboard quiet on clean days.
  if (intel.failedTotal === 0 && intel.retriesToday === 0) return null;

  // Targeted counts for the failure reasons the operator cares
  // about most. Other reasons accumulate under "Other" so the
  // operator sees them but they don't bloat the strip.
  const knownReasons = new Set([
    "timeout",
    "fetch_failed",
    "generation_failed",
  ]);
  const knownCount = (reason: string) =>
    intel.byReason.find((r) => r.reason === reason)?.count ?? 0;
  const otherCount = intel.byReason
    .filter((r) => !knownReasons.has(r.reason))
    .reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="rounded-lg border border-red-400/20 bg-red-500/[0.04] p-5 shadow-card backdrop-blur-sm">
      <p className="section-eyebrow text-red-200/85">Failure intelligence</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
        <TodayTile
          label="Failed today"
          value={String(intel.failedToday)}
          tone={intel.failedToday > 0 ? "bad" : "muted"}
        />
        <TodayTile
          label="Retries today"
          value={String(intel.retriesToday)}
          tone={intel.retriesToday > 0 ? "info" : "muted"}
        />
        <TodayTile
          label="Timeouts (all)"
          value={String(knownCount("timeout"))}
          tone={knownCount("timeout") > 0 ? "bad" : "muted"}
        />
        <TodayTile
          label="Fetch failed (all)"
          value={String(knownCount("fetch_failed"))}
          tone={knownCount("fetch_failed") > 0 ? "bad" : "muted"}
        />
        <TodayTile
          label="Generation failed (all)"
          value={String(knownCount("generation_failed"))}
          tone={knownCount("generation_failed") > 0 ? "bad" : "muted"}
        />
      </div>
      {intel.topReason ? (
        <p className="mt-3 text-xs text-white/65">
          <span className="text-white/85">
            Most common failure reason:
          </span>{" "}
          <span className="font-mono text-red-200/85">
            {intel.topReason.reason.replace(/_/g, " ")}
          </span>{" "}
          ({intel.topReason.count}{" "}
          {intel.topReason.count === 1 ? "occurrence" : "occurrences"})
          {otherCount > 0 ? ` · ${otherCount} other` : ""}
        </p>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Top expensive audits — the 5 highest-cost rows in the window.
// ────────────────────────────────────────────────────────────

type ExpensiveRow = {
  id: string;
  url: string;
  businessName: string;
  estimatedCostUsd: number;
  inputTokens: number | null;
  outputTokens: number | null;
  workerRuntimeMs: number | null;
  modelUsed: string | null;
};

function computeTopExpensive(
  runs: CalibrationRun[],
  limit: number,
): ExpensiveRow[] {
  return runs
    .filter(
      (r): r is CalibrationRun & { estimatedCostUsd: number } =>
        typeof r.estimatedCostUsd === "number",
    )
    .sort((a, b) => b.estimatedCostUsd - a.estimatedCostUsd)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      url: r.url,
      businessName: r.businessName,
      estimatedCostUsd: r.estimatedCostUsd,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      workerRuntimeMs: r.workerRuntimeMs,
      modelUsed: r.modelUsed,
    }));
}

function TopExpensiveAuditsBlock({ rows }: { rows: ExpensiveRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300/20 bg-amber-300/[0.04] p-5 shadow-card backdrop-blur-sm">
      <p className="section-eyebrow text-amber-200/85">
        Top expensive audits
      </p>
      <p className="mt-1 text-[11px] text-white/55">
        Highest-cost rows. Outliers usually indicate JS-heavy
        homepages, max-tokens cap saturation, or retries.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.16em] text-white/45">
              <th className="px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Business · Host</th>
              <th className="px-2 py-2 font-semibold text-right">Cost</th>
              <th className="px-2 py-2 font-semibold text-right">
                Tokens (in / out)
              </th>
              <th className="px-2 py-2 font-semibold text-right">Runtime</th>
              <th className="px-2 py-2 font-semibold">Model</th>
              <th className="px-2 py-2 font-semibold">Report</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} className="border-t border-white/5 align-top">
                <td className="px-2 py-2 text-white/45">{i + 1}</td>
                <td className="px-2 py-2">
                  <div className="font-semibold text-white">
                    {row.businessName}
                  </div>
                  <div className="text-[10px] text-white/40">
                    {hostFromUrl(row.url)}
                  </div>
                </td>
                <td className="px-2 py-2 text-right font-mono">
                  <CostCell cost={row.estimatedCostUsd} />
                </td>
                <td className="px-2 py-2 text-right font-mono text-white/80">
                  {(row.inputTokens ?? 0).toLocaleString()} /{" "}
                  {(row.outputTokens ?? 0).toLocaleString()}
                </td>
                <td className="px-2 py-2 text-right font-mono text-white/80">
                  {formatShortRuntime(row.workerRuntimeMs)}
                </td>
                <td className="px-2 py-2 font-mono text-white/65">
                  {formatShortModel(row.modelUsed)}
                </td>
                <td className="px-2 py-2">
                  <a
                    href={`/report/${encodeURIComponent(row.id)}/print`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent hover:underline"
                  >
                    Open ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Operator guidance — static heuristics for interpreting cost
// outliers. No data; just a shared mental model. Stays the same
// across audits unless the cost model changes meaningfully.
// ────────────────────────────────────────────────────────────

const OPERATOR_GUIDANCE: ReadonlyArray<string> = [
  "Large JS-heavy homepages increase input token usage — the web_search tool pulls more content into context.",
  "Retries multiply cost. A row with retryCount > 0 was billed for every attempt, not just the final one.",
  "Long output reports usually correlate with higher spend. Look for outputTokens near 8,000 (the max-tokens cap).",
  "Most audits should land in the $0.05–$0.15 range. Audits over $0.15 are worth investigating individually.",
  "Failed-audit token spend is logged via [geo-cost] lines but not persisted on the row — check Railway logs for the actual waste.",
];

function OperatorGuidanceBlock() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
      <p className="section-eyebrow">Operator guidance</p>
      <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-white/65">
        {OPERATOR_GUIDANCE.map((line, i) => (
          <li key={i} className="flex items-start gap-2">
            <span
              aria-hidden
              className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent"
            />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CalibrationIntelligenceBlock({
  summary,
}: {
  summary: ReturnType<typeof summarizeCalibration>;
}) {
  // Empty state — don't add another card to the page until at least
  // one operator has tagged a row. Keeps the dashboard quiet.
  if (summary.taggedCount === 0) return null;
  return (
    <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-4 text-xs leading-relaxed text-white/85">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">
        Calibration intelligence
        <span className="ml-2 font-normal normal-case tracking-normal text-white/45">
          (operator memory, n={summary.taggedCount})
        </span>
      </p>
      <ul className="mt-2 space-y-1">
        <li className="flex items-start gap-2">
          <span aria-hidden className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
          <span>
            <strong className="text-white">Tagged audits:</strong>{" "}
            {summary.taggedCount} (over-scored {summary.overScoredCount} ·
            under-scored {summary.underScoredCount})
          </span>
        </li>
        {summary.avgConfidenceLevel !== null ? (
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-white">Average operator confidence:</strong>{" "}
              {formatAvgConfidence(summary.avgConfidenceLevel)}
            </span>
          </li>
        ) : null}
        {summary.overScoredByIndustry.length > 0 ? (
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-white">Most commonly over-scored industries:</strong>{" "}
              {summary.overScoredByIndustry
                .slice(0, 3)
                .map((r) => `${r.industry} (${r.count})`)
                .join(" · ")}
            </span>
          </li>
        ) : null}
        {summary.underScoredByIndustry.length > 0 ? (
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-white">Most commonly under-scored industries:</strong>{" "}
              {summary.underScoredByIndustry
                .slice(0, 3)
                .map((r) => `${r.industry} (${r.count})`)
                .join(" · ")}
            </span>
          </li>
        ) : null}
        {summary.benchmarkTagCounts.length > 0 ? (
          <li className="flex items-start gap-2">
            <span aria-hidden className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent" />
            <span>
              <strong className="text-white">Benchmark examples:</strong>{" "}
              {summary.benchmarkTagCounts
                .map((r) => `${r.label} (${r.count})`)
                .join(" · ")}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function CostCell({ cost }: { cost: number }) {
  const tone = costTone(cost);
  const colorClass =
    tone === "low"
      ? "text-emerald-300"
      : tone === "medium"
        ? "text-amber-200"
        : tone === "high"
          ? "text-red-300"
          : "text-white/85";
  return <span className={`${colorClass}`}>${cost.toFixed(4)}</span>;
}

function formatShortRuntime(ms: number | null): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = Math.round(seconds - minutes * 60);
  return `${minutes}m ${rem}s`;
}

function formatShortModel(modelId: string | null): string {
  if (!modelId) return "—";
  const id = modelId.toLowerCase();
  if (id.includes("haiku")) return "haiku";
  if (id.includes("opus")) return "opus";
  if (id.includes("sonnet")) return "sonnet";
  return modelId;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}
