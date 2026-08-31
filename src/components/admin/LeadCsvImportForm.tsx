"use client";

import { useEffect, useState } from "react";

function authedFetch(adminKey: string, path: string, init?: RequestInit) {
  const url = path.includes("?")
    ? `${path}&key=${encodeURIComponent(adminKey)}`
    : `${path}?key=${encodeURIComponent(adminKey)}`;
  return fetch(url, init);
}

type ImportSummary = {
  rowsParsed: number;
  imported: number;
  matched: number;
  addedToList: number;
  errors: { line: number; message: string }[];
};

export function LeadCsvImportForm({ adminKey }: { adminKey: string }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvText, setCsvText] = useState<string | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [leadListId, setLeadListId] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authedFetch(adminKey, "/api/admin/leads/lists")
      .then((res) => res.json())
      .then((data) => setLists(data.lists ?? []))
      .catch(() => {});
  }, [adminKey]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSummary(null);
    setError(null);
    if (!file) {
      setFileName(null);
      setCsvText(null);
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result ?? ""));
    reader.readAsText(file);
  }

  async function submit() {
    if (!csvText) return;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const res = await authedFetch(adminKey, "/api/admin/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: csvText, leadListId: leadListId || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setSummary(data);
      } else {
        setError(data.error ?? "Import failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <p className="mb-4 text-sm text-white/70">
        Upload a CSV with a header row. Recognized columns: Business Name
        (required), Website, Category, City, State, Address, Phone, Contact
        Name, Contact Title, Contact Email, Rating, Review Count, Notes.
        Rows are deduplicated against existing leads by domain, phone, or
        name+address — the same rules used by discovery.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          className="input-field max-w-sm text-sm"
        />
        {lists.length > 0 ? (
          <select
            value={leadListId}
            onChange={(e) => setLeadListId(e.target.value)}
            className="input-field w-auto text-sm"
          >
            <option value="">Don&rsquo;t add to a list</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>Add all to: {l.name}</option>
            ))}
          </select>
        ) : null}
        <button
          onClick={submit}
          disabled={busy || !csvText}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {fileName ? <p className="mt-2 text-xs text-white/50">Selected: {fileName}</p> : null}

      {error ? (
        <div className="mt-4 rounded-md border border-severity-critical/40 bg-severity-critical/10 px-4 py-2 text-sm text-severity-critical">
          {error}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4 rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
          <p className="text-white/80">
            Parsed {summary.rowsParsed} row{summary.rowsParsed === 1 ? "" : "s"} —{" "}
            {summary.imported} new, {summary.matched} matched to existing leads
            {leadListId ? `, ${summary.addedToList} added to list` : ""}.
          </p>
          {summary.errors.length > 0 ? (
            <div className="mt-2">
              <p className="text-white/60">{summary.errors.length} row error(s):</p>
              <ul className="mt-1 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs text-white/50">
                {summary.errors.slice(0, 50).map((e, i) => (
                  <li key={i}>Line {e.line}: {e.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
