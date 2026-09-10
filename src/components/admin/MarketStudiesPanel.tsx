"use client";

import { useCallback, useEffect, useState } from "react";

type Counts = {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
};
type ScoreStats = {
  avg: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
};
type StudyRow = {
  id: string;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  status: string;
  createdAt: string;
  counts: Counts;
  scoreStats: ScoreStats;
};

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

function n(v: number | null): string {
  return v == null ? "—" : String(v);
}

export function MarketStudiesPanel({
  adminKey,
  initialStudies,
}: {
  adminKey: string;
  initialStudies: StudyRow[];
}) {
  const [studies, setStudies] = useState<StudyRow[]>(initialStudies);

  const anyInFlight = studies.some(
    (s) => s.counts.queued > 0 || s.counts.running > 0,
  );

  const refresh = useCallback(() => {
    authedFetch(adminKey, "/api/admin/market-studies")
      .then((r) => r.json())
      .then((d: { studies?: StudyRow[] }) => {
        if (d.studies) setStudies(d.studies);
      })
      .catch(() => undefined);
  }, [adminKey]);

  useEffect(() => {
    if (!anyInFlight) return;
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [anyInFlight, refresh]);

  if (studies.length === 0) {
    return (
      <div className="rounded-md border border-white/10 bg-ink-900/60 p-8 text-center text-sm text-white/50">
        No market studies yet. Select leads on the Leads page and choose
        &ldquo;Run GeoViz Audits&rdquo; to start one.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/50">
          <tr>
            <th className="px-3 py-2">Study</th>
            <th className="px-3 py-2">Category / Location</th>
            <th className="px-3 py-2">Selected</th>
            <th className="px-3 py-2">Queued</th>
            <th className="px-3 py-2">Running</th>
            <th className="px-3 py-2">Done</th>
            <th className="px-3 py-2">Failed</th>
            <th className="px-3 py-2">Skipped</th>
            <th className="px-3 py-2">Avg</th>
            <th className="px-3 py-2">Median</th>
            <th className="px-3 py-2">Min</th>
            <th className="px-3 py-2">Max</th>
          </tr>
        </thead>
        <tbody>
          {studies.map((s) => (
            <tr key={s.id} className="border-b border-white/5 align-top">
              <td className="px-3 py-2 font-medium text-white/90">
                <a
                  href={`/admin/market-studies/${s.id}?key=${encodeURIComponent(adminKey)}`}
                  className="hover:text-accent hover:underline"
                >
                  {s.name}
                </a>
                {s.status === "archived" ? (
                  <span className="ml-2 text-[10px] uppercase text-white/40">
                    archived
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-white/60">
                {[s.category, [s.city, s.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </td>
              <td className="px-3 py-2 text-white/70">{s.counts.total}</td>
              <td className="px-3 py-2 text-white/70">{s.counts.queued}</td>
              <td className="px-3 py-2 text-white/70">{s.counts.running}</td>
              <td className="px-3 py-2 text-severity-info">
                {s.counts.completed}
              </td>
              <td className="px-3 py-2 text-severity-critical">
                {s.counts.failed}
              </td>
              <td className="px-3 py-2 text-white/50">{s.counts.skipped}</td>
              <td className="px-3 py-2 font-mono text-white/80">
                {n(s.scoreStats.avg)}
              </td>
              <td className="px-3 py-2 font-mono text-white/60">
                {n(s.scoreStats.median)}
              </td>
              <td className="px-3 py-2 font-mono text-white/60">
                {n(s.scoreStats.min)}
              </td>
              <td className="px-3 py-2 font-mono text-white/60">
                {n(s.scoreStats.max)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
