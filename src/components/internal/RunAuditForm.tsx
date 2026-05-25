"use client";

import { useState } from "react";

type Mode = "single" | "bulk";

type CalibrationResponse = {
  queued?: number;
  created?: Array<{ id: string; url: string }>;
  skipped?: number;
  skippedDetail?: Array<{ url: string; reason: string }>;
  error?: string;
};

export function RunAuditForm({ adminKey }: { adminKey: string }) {
  const [mode, setMode] = useState<Mode>("single");
  const [singleUrl, setSingleUrl] = useState("");
  const [expected, setExpected] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [industry, setIndustry] = useState("");
  const [benchmarkTag, setBenchmarkTag] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CalibrationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function parseBulk(): string[] {
    return bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 50);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const urls =
      mode === "single"
        ? singleUrl.trim()
          ? [singleUrl.trim()]
          : []
        : parseBulk();

    if (urls.length === 0) {
      setError("Provide at least one URL.");
      setLoading(false);
      return;
    }

    const expectedByUrl: Record<string, number> = {};
    if (mode === "single" && expected.trim()) {
      const n = Number(expected);
      if (!Number.isNaN(n)) expectedByUrl[urls[0]] = n;
    }

    try {
      const res = await fetch("/api/admin/calibration", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminKey,
        },
        body: JSON.stringify({
          urls,
          expectedByUrl,
          industry: industry.trim() || null,
          benchmarkTag: benchmarkTag.trim() || null,
        }),
      });
      const json = (await res.json()) as CalibrationResponse;
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
      } else {
        setResult(json);
        if (mode === "single") setSingleUrl("");
        else setBulkText("");
        setExpected("");
      }
    } catch (err) {
      const e = err as Error;
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card p-6">
      <div className="mb-5 flex gap-2">
        <button
          type="button"
          onClick={() => setMode("single")}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            mode === "single"
              ? "bg-accent text-ink-950"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          Single URL
        </button>
        <button
          type="button"
          onClick={() => setMode("bulk")}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            mode === "bulk"
              ? "bg-accent text-ink-950"
              : "bg-white/5 text-white/70 hover:bg-white/10"
          }`}
        >
          Bulk (up to 50)
        </button>
      </div>

      {mode === "single" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="md:col-span-2 block">
            <span className="text-xs uppercase tracking-wide text-white/50">
              Website URL
            </span>
            <input
              type="url"
              required
              autoFocus
              placeholder="https://example.com"
              value={singleUrl}
              onChange={(e) => setSingleUrl(e.target.value)}
              className="input-field mt-1.5 w-full"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-white/50">
              Expected score (optional)
            </span>
            <input
              type="number"
              min={0}
              max={100}
              placeholder="65"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              className="input-field mt-1.5 w-full"
            />
          </label>
        </div>
      ) : (
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/50">
            URLs · one per line (max 50)
          </span>
          <textarea
            required
            rows={8}
            placeholder={"https://example.com\nhttps://another-site.com"}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="input-field mt-1.5 w-full font-mono text-sm"
          />
          <span className="mt-1 block text-xs text-white/50">
            Parsed: {parseBulk().length} URL(s)
          </span>
        </label>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/50">
            Industry tag (optional)
          </span>
          <input
            type="text"
            placeholder="hvac, roofing, lawyer…"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="input-field mt-1.5 w-full"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-white/50">
            Benchmark tag (optional)
          </span>
          <input
            type="text"
            placeholder="elite, average, weak…"
            value={benchmarkTag}
            onChange={(e) => setBenchmarkTag(e.target.value)}
            className="input-field mt-1.5 w-full"
          />
        </label>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Queueing…" : "Queue audit"}
        </button>
        {error && (
          <span className="text-sm text-severity-critical">{error}</span>
        )}
      </div>

      {result && (
        <div className="mt-6 rounded-md border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-medium text-emerald-300">
            Queued {result.queued ?? 0} · created{" "}
            {result.created?.length ?? 0} · skipped {result.skipped ?? 0}
          </p>
          {result.created && result.created.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-white/70">
              {result.created.map((c) => (
                <li key={c.id} className="font-mono">
                  {c.url} <span className="text-white/40">→ {c.id}</span>
                </li>
              ))}
            </ul>
          )}
          {result.skippedDetail && result.skippedDetail.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-severity-warning">
              {result.skippedDetail.map((s, i) => (
                <li key={`${s.url}-${i}`} className="font-mono">
                  {s.url} — {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
