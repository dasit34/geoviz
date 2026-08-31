"use client";

import { useState } from "react";

// Phase 1 ships one provider option. Listed explicitly (not
// hard-coded into the fetch call/labels elsewhere) so adding a second
// provider later is a one-line addition to this array, not a UI
// rewrite — the admin picks a provider, the UI never assumes one.
const PROVIDER_OPTIONS = [{ value: "google_places", label: "Google Places" }];

type DiscoverResponse = {
  requested: number;
  resultCount: number;
  imported: number;
  matched: number;
  providerRequestCount: number;
  providerError: string | null;
};

export function LeadDiscoveryForm({ adminKey }: { adminKey: string }) {
  const [provider, setProvider] = useState(PROVIDER_OPTIONS[0].value);
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [radiusMiles, setRadiusMiles] = useState("");
  const [limit, setLimit] = useState("50");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DiscoverResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/leads/discover?key=${encodeURIComponent(adminKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider,
            category,
            city,
            state: state || undefined,
            radiusMiles: radiusMiles ? Number(radiusMiles) : undefined,
            limit: Number(limit),
          }),
        },
      );
      const data = await res.json();
      if (res.ok) setResult(data);
      else setError(data.error ?? "Discovery search failed.");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card max-w-2xl">
      <form onSubmit={onSubmit} className="grid gap-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
            Provider
          </label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="input-field w-full"
          >
            {PROVIDER_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
              Industry / category
            </label>
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="HVAC"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
              City
            </label>
            <input
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Toledo"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
              State (optional)
            </label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="Ohio"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
              Radius, miles (optional)
            </label>
            <input
              type="number"
              min={1}
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(e.target.value)}
              placeholder="50"
              className="input-field w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
              Number of businesses requested
            </label>
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="input-field w-full"
            />
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-white/55">
          This runs a real, paid discovery-provider search — roughly
          one provider request per 20 businesses requested. Results
          may not reach the exact requested count in a sparse
          category/area. A daily request cap protects against runaway
          spend; see <code>LEAD_DISCOVERY_MAX_REQUESTS_PER_DAY</code>.
        </div>

        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-fit text-sm disabled:opacity-50"
        >
          {busy ? "Searching…" : "Run Search"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-md border border-severity-critical/30 bg-severity-critical/10 px-4 py-2 text-sm text-severity-critical">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-md border border-white/10 bg-white/[0.02] p-4 text-sm text-white/75">
          <p>
            Requested <strong>{result.requested}</strong>, provider
            returned <strong>{result.resultCount}</strong>.
          </p>
          <p className="mt-1">
            <strong>{result.imported}</strong> new lead(s) created,{" "}
            <strong>{result.matched}</strong> matched an existing lead
            (cross-provider dedup — no duplicate rows created).
          </p>
          <p className="mt-1 text-white/50">
            Provider requests used: {result.providerRequestCount}
          </p>
          {result.providerError ? (
            <p className="mt-2 text-severity-warning">
              Provider reported an error partway through:{" "}
              {result.providerError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
