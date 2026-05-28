"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  CalibrationReplayRow,
  CalibrationReplaySummary,
  CategoryDelta,
  ChangedFindings,
  ReplayStatus,
} from "@/lib/calibration/replays";

const POLL_INTERVAL_MS = 30_000;

type ApiResponse = {
  rows: CalibrationReplayRow[];
  summary: CalibrationReplaySummary;
};

type StatusFilter = "all" | ReplayStatus;
type SortColumn = "createdAt" | "delta" | "status" | "runtime";
type SortOrder = "asc" | "desc";

const STATUS_FILTER_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "stable", label: "Stable" },
  { key: "minor_drift", label: "Minor drift" },
  { key: "major_drift", label: "Major drift" },
  { key: "band_moved", label: "Band moved" },
  { key: "hash_mismatch", label: "Hash mismatch" },
  { key: "partial_replay", label: "Partial replay" },
];

const STATUS_LABEL: Record<ReplayStatus, string> = {
  stable: "stable",
  minor_drift: "minor drift",
  major_drift: "major drift",
  band_moved: "band moved",
  hash_mismatch: "hash mismatch",
  partial_replay: "partial replay",
  unreplayable: "unreplayable",
};

function statusColorClass(status: ReplayStatus): string {
  switch (status) {
    case "stable":
      return "text-severity-info";
    case "minor_drift":
      return "text-severity-warning";
    case "band_moved":
      // Intentional: distinct orange (not severity-warning amber) per
      // the design spec — orange = structural band change, amber =
      // small numeric drift. Keep these visually separable.
      return "text-orange-400";
    case "major_drift":
    case "hash_mismatch":
      return "text-severity-critical";
    case "partial_replay":
      return "text-white/45";
    case "unreplayable":
    default:
      return "text-white/30";
  }
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function fmtDelta(d: number | null): string {
  if (d === null) return "—";
  if (d === 0) return "0";
  return d > 0 ? `+${d}` : String(d);
}

function fmtBand(prev: string | null, curr: string | null): string {
  if (!prev && !curr) return "—";
  if (!prev) return `— → ${curr}`;
  if (!curr) return `${prev} → —`;
  if (prev === curr) return `${prev} → —`;
  return `${prev} → ${curr}`;
}

function fmtCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function fmtAgo(ms: number): string {
  if (ms < 1000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function ReplayHistoryPanel({ adminKey }: { adminKey: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [bandChangedOnly, setBandChangedOnly] = useState(false);
  const [sortColumn, setSortColumn] = useState<SortColumn>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/admin/calibration/replays?key=${encodeURIComponent(adminKey)}&limit=200`,
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled)
            setError(`API returned ${res.status} ${res.statusText}`);
          return;
        }
        const body = (await res.json()) as ApiResponse;
        if (!cancelled) {
          setData(body);
          setError(null);
          setLastUpdated(Date.now());
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    // 1-Hz tick so "updated Xs ago" stays current between polls
    const tickInterval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
      clearInterval(tickInterval);
    };
  }, [adminKey]);

  // Client-side filter + sort. The API already supports filtering;
  // we filter client-side too so toggle interactions don't trigger
  // a network round-trip.
  const visibleRows = useMemo(() => {
    if (!data) return [] as CalibrationReplayRow[];
    let rows = data.rows;
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.replayStatus === statusFilter);
    }
    if (bandChangedOnly) {
      rows = rows.filter((r) => r.bandChanged);
    }
    const sorted = [...rows].sort((a, b) => {
      const order = sortOrder === "desc" ? -1 : 1;
      if (sortColumn === "createdAt") {
        return order * a.createdAt.localeCompare(b.createdAt);
      }
      if (sortColumn === "delta") {
        const ad = a.delta ?? Number.NEGATIVE_INFINITY;
        const bd = b.delta ?? Number.NEGATIVE_INFINITY;
        return order * (ad - bd);
      }
      if (sortColumn === "runtime") {
        return order * (a.runtimeMs - b.runtimeMs);
      }
      // status
      return order * a.replayStatus.localeCompare(b.replayStatus);
    });
    return sorted;
  }, [data, statusFilter, bandChangedOnly, sortColumn, sortOrder]);

  const toggleSort = (col: SortColumn) => {
    if (col === sortColumn) {
      setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortOrder("desc");
    }
  };

  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="section-eyebrow">Replay history</p>
          <p className="mt-1 text-xs text-white/45">
            Append-only telemetry from <span className="mono-data">scripts/replay-audits.ts --persist</span>.
            Click a row to expand category deltas. Polls every 30s.
          </p>
        </div>
        {data ? (
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
            {lastUpdated ? (
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-cyan motion-safe:animate-pulseSoft"
              />
            ) : null}
            <span>
              {data.summary.total} replay{data.summary.total === 1 ? "" : "s"}
            </span>
            {lastUpdated ? (
              <span className="text-white/30">
                · updated {fmtAgo(nowTick - lastUpdated)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 text-sm text-severity-critical">Error: {error}</p>
      ) : null}

      {loading && !data ? (
        <p className="mt-3 text-sm text-white/45">Loading…</p>
      ) : data && data.summary.total === 0 ? (
        <p className="mt-3 text-sm text-white/45">
          No replay rows yet. Run{" "}
          <span className="mono-data">npm run replay:audits -- --persist --limit 20</span>{" "}
          to populate.
        </p>
      ) : data ? (
        <>
          {/* ── top stat tiles ─────────────────────────────────── */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
            <Tile label="Total replayed" value={String(data.summary.total)} />
            <Tile
              label="Stable"
              value={`${data.summary.stablePct.toFixed(0)}%`}
              tone="ok"
            />
            <Tile
              label="Drifted"
              value={`${data.summary.driftPct.toFixed(0)}%`}
              tone={data.summary.driftPct > 10 ? "bad" : "info"}
            />
            <Tile
              label="Avg delta"
              value={
                data.summary.avgDelta === null
                  ? "—"
                  : data.summary.avgDelta.toFixed(2)
              }
            />
            <Tile
              label="Max ± delta"
              value={`${data.summary.maxPositiveDelta ?? 0} / ${data.summary.maxNegativeDelta ?? 0}`}
            />
          </div>

          {/* ── filter pills ───────────────────────────────────── */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {STATUS_FILTER_OPTIONS.map((opt) => {
              const count =
                opt.key === "all"
                  ? data.summary.total
                  : data.summary.byStatus[opt.key as ReplayStatus];
              const active = statusFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setStatusFilter(opt.key)}
                  className={`pill ${
                    active
                      ? "border-accent/60 bg-accent/15 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
                  }`}
                >
                  {opt.label}
                  <span className="ml-1 text-white/35">{count}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setBandChangedOnly((v) => !v)}
              className={`pill ${
                bandChangedOnly
                  ? "border-orange-400/60 bg-orange-400/15 text-white"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"
              }`}
            >
              Band changed only
            </button>
          </div>

          {/* ── table ──────────────────────────────────────────── */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.03] text-[10px] uppercase tracking-[0.16em] text-white/50">
                  <th className="px-3 py-2.5">Audit</th>
                  <SortableTh
                    label="When"
                    column="createdAt"
                    active={sortColumn === "createdAt"}
                    order={sortOrder}
                    onClick={toggleSort}
                  />
                  <th className="hidden px-3 py-2.5 md:table-cell">Mode</th>
                  <th className="px-3 py-2.5">Original → Recalc</th>
                  <SortableTh
                    label="Delta"
                    column="delta"
                    active={sortColumn === "delta"}
                    order={sortOrder}
                    onClick={toggleSort}
                  />
                  <th className="px-3 py-2.5">Band</th>
                  <SortableTh
                    label="Status"
                    column="status"
                    active={sortColumn === "status"}
                    order={sortOrder}
                    onClick={toggleSort}
                  />
                  <SortableTh
                    label="Runtime"
                    column="runtime"
                    active={sortColumn === "runtime"}
                    order={sortOrder}
                    onClick={toggleSort}
                    responsiveClass="hidden lg:table-cell"
                  />
                  <th className="px-3 py-2.5" aria-label="Expand" />
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <ReplayRow
                    key={row.id}
                    row={row}
                    expanded={expandedId === row.id}
                    onToggle={() =>
                      setExpandedId(expandedId === row.id ? null : row.id)
                    }
                  />
                ))}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-3 py-6 text-center text-sm text-white/45"
                    >
                      No replays match the current filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────────

type TileTone = "ok" | "bad" | "info";

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: TileTone;
}) {
  const toneClass =
    tone === "ok"
      ? "text-severity-info"
      : tone === "bad"
        ? "text-severity-critical"
        : tone === "info"
          ? "text-cyan"
          : "text-white/90";
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/40">
        {label}
      </p>
      <p className={`mt-1.5 mono-data text-xl font-semibold ${toneClass}`}>
        {value}
      </p>
    </div>
  );
}

function SortableTh({
  label,
  column,
  active,
  order,
  onClick,
  responsiveClass = "",
}: {
  label: string;
  column: SortColumn;
  active: boolean;
  order: SortOrder;
  onClick: (c: SortColumn) => void;
  responsiveClass?: string;
}) {
  return (
    <th className={`px-3 py-2.5 ${responsiveClass}`}>
      <button
        type="button"
        onClick={() => onClick(column)}
        className={`flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] ${
          active ? "text-white" : "text-white/50 hover:text-white/75"
        }`}
      >
        {label}
        {active ? (
          <span aria-hidden className="text-white/65">
            {order === "asc" ? "▲" : "▼"}
          </span>
        ) : null}
      </button>
    </th>
  );
}

function StatusChip({ status }: { status: ReplayStatus }) {
  const color = statusColorClass(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-current px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] ${color}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-current"
      />
      {STATUS_LABEL[status]}
    </span>
  );
}

function ReplayRow({
  row,
  expanded,
  onToggle,
}: {
  row: CalibrationReplayRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer border-b border-white/[0.06] transition-colors hover:bg-white/[0.025]"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5 mono-data text-[12px] text-white/70">
          {shortId(row.auditId)}
        </td>
        <td className="px-3 py-2.5 mono-data text-[11px] text-white/55">
          {fmtCreatedAt(row.createdAt)}
        </td>
        <td className="hidden px-3 py-2.5 text-[12px] text-white/60 md:table-cell">
          {row.replayMode}
        </td>
        <td className="px-3 py-2.5 mono-data text-white/75">
          {row.originalScore ?? "—"} → {row.recalculatedScore ?? "—"}
        </td>
        <td className="px-3 py-2.5 mono-data font-semibold text-white">
          {fmtDelta(row.delta)}
        </td>
        <td className="px-3 py-2.5 text-[12px] text-white/65">
          {fmtBand(row.previousBand, row.currentBand)}
        </td>
        <td className="px-3 py-2.5">
          <StatusChip status={row.replayStatus} />
        </td>
        <td className="hidden px-3 py-2.5 mono-data text-[11px] text-white/55 lg:table-cell">
          {row.runtimeMs}ms
        </td>
        <td className="px-3 py-2.5 text-white/35">{expanded ? "▾" : "▸"}</td>
      </tr>
      {expanded ? (
        <tr className="border-b border-white/[0.06] bg-white/[0.01]">
          <td colSpan={9} className="px-3 py-4">
            <ReplayDrillDown row={row} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

// ─── inline drill-down ───────────────────────────────────────────

function ReplayDrillDown({ row }: { row: CalibrationReplayRow }) {
  const cats: CategoryDelta[] | null = row.categoryDeltas;
  const changed: ChangedFindings | null = row.changedFindings;
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
          Category deltas
        </p>
        {cats && cats.length > 0 ? (
          <ul className="mt-2 space-y-1.5 text-[12px]">
            {cats.map((c) => (
              <li
                key={c.category}
                className="grid grid-cols-[1fr_50px_50px_40px] gap-2 sm:grid-cols-[100px_70px_70px_50px]"
              >
                <span className="text-white/65">{c.category}</span>
                <span className="mono-data text-white/55">{c.original ?? "—"}</span>
                <span className="mono-data text-white/55">→ {c.recalculated ?? "—"}</span>
                <span
                  className={`mono-data ${
                    c.delta === null || c.delta === 0
                      ? "text-white/45"
                      : c.delta > 0
                        ? "text-severity-info"
                        : "text-severity-warning"
                  }`}
                >
                  {fmtDelta(c.delta)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-white/45">
            Category deltas not available for this replay
            {row.replayStatus === "partial_replay" ? " (no replayBundle)" : ""}.
          </p>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
          Changed findings
        </p>
        {changed &&
        (changed.added.length > 0 || changed.removed.length > 0) ? (
          <ul className="mt-2 space-y-1 mono-data text-[12px]">
            {changed.added.map((id) => (
              <li key={`+${id}`} className="text-severity-info">
                + {id}
              </li>
            ))}
            {changed.removed.map((id) => (
              <li key={`-${id}`} className="text-severity-warning">
                − {id}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-white/45">
            No changed findings (top 3 are the same).
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-2 text-[11px] text-white/55 sm:grid-cols-2">
          <div>
            <p className="text-white/35">Scoring version</p>
            <p className="mono-data">{row.scoringVersion ?? "—"}</p>
          </div>
          <div>
            <p className="text-white/35">Hashes match</p>
            <p className="mono-data">
              w:{" "}
              {row.weightHashMatch === null
                ? "—"
                : row.weightHashMatch
                  ? "✓"
                  : "✗"}{" "}
              · c:{" "}
              {row.categoryHashMatch === null
                ? "—"
                : row.categoryHashMatch
                  ? "✓"
                  : "✗"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-white/35">Hash lineage</p>
            <p className="mono-data text-[10px]">
              w: {row.weightHashOriginal ?? "—"} · c: {row.categoryHashOriginal ?? "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
