"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * CalibrationLearningLoopPanel — new sections for the Calibration
 * Engine (learning loop), bolted onto the existing /admin/calibration
 * cockpit. Self-contained polling component, mirrors
 * OperatorInsightsPanel.tsx's pattern.
 *
 * Renders a simple disabled state when
 * GEO_MODULE_CALIBRATION_ENGINE_ENABLED isn't "true" — the API route
 * returns `{ enabled: false }` (not an error) in that case.
 */

const POLL_INTERVAL_MS = 60_000;

type BatchHistoryRow = {
  batchNumber: number;
  batchSize: number;
  computedAt: string;
  avgScore: number | null;
  medianScore: number | null;
  avgRuntimeMs: number | null;
  avgCostUsd: number | null;
  modelAgreementPct: number | null;
  failureCount: number;
  needsReviewCount: number;
  reportPath: string | null;
};

type RecommendationRow = {
  recommendationId: string;
  industry: string | null;
  timesGenerated: number;
  avgScore: number | null;
  avgConfidence: number | null;
};

type IndustryRow = {
  industry: string;
  auditCount: number;
  avgScore: number | null;
  medianScore: number | null;
  bestScore: number | null;
  worstScore: number | null;
};

type ReviewQueueRow = {
  auditOrderId: string;
  websiteUrl: string;
  businessName: string | null;
  reasons: string[];
  snapshotAt: string;
};

type ChainEntry = {
  auditOrderId: string;
  createdAt: string;
  overallScore: number | null;
};

type ChainDelta = {
  fromAuditOrderId: string;
  toAuditOrderId: string;
  overallDelta: number | null;
  elapsedMs: number;
};

type LearningLoopResponse =
  | { enabled: false }
  | {
      enabled: true;
      batchHistory: BatchHistoryRow[];
      recommendationLeaderboard: RecommendationRow[];
      industryLeaderboard: IndustryRow[];
      reviewQueue: ReviewQueueRow[];
      latestObservations: string[];
      beforeAfter: { websiteUrl: string; chain: ChainEntry[]; deltas: ChainDelta[] } | null;
    };

export function CalibrationLearningLoopPanel({ adminKey }: { adminKey: string }) {
  const [data, setData] = useState<LearningLoopResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [urlQuery, setUrlQuery] = useState("");
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(
    async (websiteUrl?: string) => {
      try {
        const qs = new URLSearchParams({ key: adminKey });
        if (websiteUrl) qs.set("websiteUrl", websiteUrl);
        const res = await fetch(`/api/admin/calibration/learning-loop?${qs.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          setError(`API ${res.status} ${res.statusText}`);
          return;
        }
        const body = (await res.json()) as LearningLoopResponse;
        setData(body);
        setError(null);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [adminKey],
  );

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [load]);

  const resolveReview = useCallback(
    async (auditSnapshotId: string) => {
      setResolving(auditSnapshotId);
      try {
        await fetch(`/api/admin/calibration/learning-loop?key=${encodeURIComponent(adminKey)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ auditSnapshotId }),
        });
        await load();
      } finally {
        setResolving(null);
      }
    },
    [adminKey, load],
  );

  if (loading && !data) {
    return (
      <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
        <p className="section-eyebrow">Calibration Engine</p>
        <p className="mt-3 text-sm text-white/45">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
        <p className="section-eyebrow">Calibration Engine</p>
        <p className="mt-3 text-sm text-severity-critical">Error: {error}</p>
      </div>
    );
  }

  if (!data || !data.enabled) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-5">
        <p className="section-eyebrow">Calibration Engine</p>
        <p className="mt-2 text-sm text-white/55">
          Disabled (GEO_MODULE_CALIBRATION_ENGINE_ENABLED is not &quot;true&quot;). Run{" "}
          <code>npm run calibration:batch</code> after enabling the flag to start the learning
          loop.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Learning-loop observations */}
      <div className="rounded-lg border border-accent/20 bg-accent/[0.04] p-5">
        <p className="section-eyebrow text-accent">Learning-loop observations</p>
        <p className="mt-1 text-[11px] text-white/55">
          Deterministic, evidence-only findings from the latest batch. No LLM synthesis.
        </p>
        {data.latestObservations.length === 0 ? (
          <p className="mt-3 text-sm text-white/45">Insufficient data (no batch computed yet).</p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-white/85">
            {data.latestObservations.map((obs, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-accent"
                />
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Batch history */}
      <div className="card">
        <p className="section-eyebrow">Batch history</p>
        <h3 className="h3 mt-2">{data.batchHistory.length} batches computed</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-[0.16em] text-white/45">
                <th className="px-2 py-2 font-semibold">Batch</th>
                <th className="px-2 py-2 font-semibold text-right">Size</th>
                <th className="px-2 py-2 font-semibold text-right">Avg score</th>
                <th className="px-2 py-2 font-semibold text-right">Agreement</th>
                <th className="px-2 py-2 font-semibold text-right">Runtime</th>
                <th className="px-2 py-2 font-semibold text-right">Cost</th>
                <th className="px-2 py-2 font-semibold text-right">Review</th>
                <th className="px-2 py-2 font-semibold">Report</th>
              </tr>
            </thead>
            <tbody>
              {data.batchHistory.length === 0 ? (
                <tr>
                  <td className="px-2 py-6 text-center text-white/45" colSpan={8}>
                    No batches yet — accumulate {`>= GEO_CALIBRATION_BATCH_SIZE`} audits and run{" "}
                    <code>npm run calibration:batch</code>.
                  </td>
                </tr>
              ) : (
                data.batchHistory.map((b) => (
                  <tr key={b.batchNumber} className="border-t border-white/5">
                    <td className="px-2 py-2 font-mono">#{b.batchNumber}</td>
                    <td className="px-2 py-2 text-right font-mono">{b.batchSize}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {b.avgScore === null ? "—" : b.avgScore.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {b.modelAgreementPct === null ? "—" : `${b.modelAgreementPct.toFixed(0)}%`}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {b.avgRuntimeMs === null ? "—" : `${Math.round(b.avgRuntimeMs / 1000)}s`}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">
                      {b.avgCostUsd === null ? "—" : `$${b.avgCostUsd.toFixed(4)}`}
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{b.needsReviewCount}</td>
                    <td className="px-2 py-2 text-xs text-white/45">{b.reportPath ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recommendation + industry leaderboards */}
      <div className="grid gap-5 md:grid-cols-2">
        <div className="card">
          <p className="section-eyebrow">Recommendation frequency</p>
          <ul className="mt-4 space-y-2 text-sm">
            {data.recommendationLeaderboard.length === 0 ? (
              <li className="text-white/45">No data yet.</li>
            ) : (
              data.recommendationLeaderboard
                .filter((r) => r.industry === null)
                .slice(0, 10)
                .map((r) => (
                  <li key={r.recommendationId} className="flex items-baseline justify-between">
                    <span className="font-mono text-xs text-white/80">{r.recommendationId}</span>
                    <span className="font-mono text-white/60">{r.timesGenerated}</span>
                  </li>
                ))
            )}
          </ul>
        </div>
        <div className="card">
          <p className="section-eyebrow">Industry leaderboard</p>
          <ul className="mt-4 space-y-2 text-sm">
            {data.industryLeaderboard.length === 0 ? (
              <li className="text-white/45">No data yet.</li>
            ) : (
              data.industryLeaderboard.map((r) => (
                <li key={r.industry} className="flex items-baseline justify-between">
                  <span className="text-white/80">{r.industry}</span>
                  <span className="font-mono text-white/60">
                    {r.avgScore === null ? "—" : r.avgScore.toFixed(1)} · n={r.auditCount}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Manual review queue */}
      <div className="card">
        <p className="section-eyebrow">Manual review queue</p>
        <h3 className="h3 mt-2">{data.reviewQueue.length} unresolved</h3>
        <ul className="mt-4 space-y-3">
          {data.reviewQueue.length === 0 ? (
            <li className="text-sm text-white/45">Nothing flagged.</li>
          ) : (
            data.reviewQueue.map((r) => (
              <li
                key={r.auditOrderId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-white/[0.08] bg-white/[0.02] p-3"
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {r.businessName ?? r.websiteUrl}
                  </p>
                  <p className="text-xs text-white/45">{r.reasons.join(", ")}</p>
                </div>
                <button
                  type="button"
                  className="btn-ghost px-3 py-1.5 text-xs"
                  disabled={resolving === r.auditOrderId}
                  onClick={() => resolveReview(r.auditOrderId)}
                >
                  {resolving === r.auditOrderId ? "Resolving…" : "Mark resolved"}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      {/* Before/after lookup */}
      <div className="card">
        <p className="section-eyebrow">Before / after</p>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(urlQuery.trim() || undefined);
          }}
        >
          <input
            type="text"
            className="input-field flex-1 font-mono text-sm"
            placeholder="https://example.com"
            value={urlQuery}
            onChange={(e) => setUrlQuery(e.target.value)}
          />
          <button type="submit" className="btn-ghost px-4 py-2 text-xs">
            Look up
          </button>
        </form>
        {data.beforeAfter ? (
          data.beforeAfter.deltas.length === 0 ? (
            <p className="mt-3 text-sm text-white/45">
              Only one audit on record for {data.beforeAfter.websiteUrl} — no delta yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {data.beforeAfter.deltas.map((d) => (
                <li key={`${d.fromAuditOrderId}-${d.toAuditOrderId}`} className="text-white/80">
                  {d.overallDelta === null
                    ? "—"
                    : d.overallDelta > 0
                      ? `+${d.overallDelta}`
                      : d.overallDelta}{" "}
                  over {Math.round(d.elapsedMs / (1000 * 60 * 60 * 24))} days
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>
    </div>
  );
}
