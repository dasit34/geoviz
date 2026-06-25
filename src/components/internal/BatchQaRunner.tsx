"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = "idle" | "creating" | "polling" | "done";
type PdfStatus = "unchecked" | "generating" | "pass" | "fail";
type HtmlStatus = "unchecked" | "checking" | "pass" | "fail";

type QaEntry = {
  orderId: string;
  url: string;
  businessName: string | null;
  status: string;
  score: number | null;
  band: string | null;
  reportUrl: string;
  printUrl: string;   // /report/{id}/print — Puppeteer surface, QA target
  pdfUrl: string;     // /api/report/{id}/pdf — PDF download link
  // server-side signals (from reportMarkdown)
  modelFailures: number;
  malformedTextDetected: boolean;
  validationIssues: string[];
  error: string | null;
  // client-side PDF check
  pdfStatus: PdfStatus;
  // client-side HTML validation (render check)
  htmlStatus: HtmlStatus;
  pageCount: number | null;
  htmlIssues: string[];
  categoryFallbackDetected: boolean;
};

type CalibrationResponse = {
  created?: Array<{ id: string; url: string }>;
  queued?: number;
  skipped?: number;
  skippedDetail?: Array<{ url: string; reason: string }>;
  batchId?: string;
  error?: string;
};

type PollResponse = {
  results?: Array<{
    orderId: string;
    url: string;
    businessName: string | null;
    status: string;
    score: number | null;
    band: string | null;
    reportUrl: string;
    modelFailures: number;
    malformedTextDetected: boolean;
    validationIssues: string[];
    error: string | null;
  }>;
  error?: string;
};

type HtmlValidationResult = {
  pageCount: number;
  htmlIssues: string[];
  categoryFallbackDetected: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const TERMINAL = new Set(["generated", "failed"]);
const PDF_CONCURRENCY = 2;

// Patterns checked against the fully-rendered HTML (post-normalization).
const FORBIDDEN_RENDERED: Array<[RegExp, string]> = [
  [/json-?ld\s+block/i, "json-ld block in rendered HTML"],
  [/\blocalbusiness\b(?!\s+profile)/i, "LocalBusiness in rendered HTML"],
  [/\bnap\s+consistency\b/i, "NAP consistency in rendered HTML"],
  [/no response captured/i, "internal error string in rendered HTML"],
  [/\bundefined\b/, "literal undefined in rendered HTML"],
];

// Normalizer fallback questions — presence indicates simplifyBusinessType broke.
const FALLBACK_QUESTION_PATTERNS = [
  /Who are the best businesses in this category/i,
  /Can you recommend a reliable provider like/i,
  /What should I look for when choosing a business in this category/i,
];

// ── Batch persistence ─────────────────────────────────────────────────────────

type SavedBatch = {
  timestamp: string;
  urls: string[];
  results: QaEntry[];
  batchId?: string;
};

// Explicitly saved by the operator (persists across New batch).
const STORAGE_KEY = "geoviz:launch-qa:last-batch";
// Auto-saved active session (cleared on New batch; restored on refresh).
const SESSION_KEY = "geoviz:launch-qa:session";

// ── HTML validation ───────────────────────────────────────────────────────────

async function validateReportHtml(orderId: string): Promise<HtmlValidationResult> {
  try {
    const res = await fetch(`/report/${orderId}/print`);
    if (!res.ok) {
      return {
        pageCount: 0,
        htmlIssues: [`print page returned HTTP ${res.status}`],
        categoryFallbackDetected: false,
      };
    }
    const html = await res.text();

    const pageCount = (html.match(/<section[^>]*\brd-page\b/g) ?? []).length;
    const htmlIssues: string[] = [];

    if (pageCount !== 8) {
      htmlIssues.push(`expected 8 pages, got ${pageCount}`);
    }

    for (const [re, label] of FORBIDDEN_RENDERED) {
      if (re.test(html)) htmlIssues.push(label);
    }

    const categoryFallbackDetected = FALLBACK_QUESTION_PATTERNS.some((p) =>
      p.test(html),
    );

    return { pageCount, htmlIssues, categoryFallbackDetected };
  } catch {
    return {
      pageCount: 0,
      htmlIssues: ["fetch to print page failed"],
      categoryFallbackDetected: false,
    };
  }
}

// ── Pill helpers ──────────────────────────────────────────────────────────────

function statusPill(status: string) {
  if (status === "generated") return "pill bg-emerald-500/15 text-emerald-300";
  if (status === "failed")
    return "pill bg-severity-critical/15 text-severity-critical";
  return "pill bg-accent/15 text-accent";
}

function pdfBadge(s: PdfStatus) {
  if (s === "pass")
    return <span className="pill bg-emerald-500/15 text-emerald-300">pass</span>;
  if (s === "fail")
    return (
      <span className="pill bg-severity-critical/15 text-severity-critical">
        fail
      </span>
    );
  if (s === "generating")
    return <span className="pill bg-accent/15 text-accent">gen…</span>;
  return <span className="text-white/30">—</span>;
}

function pagesBadge(entry: QaEntry) {
  if (entry.status !== "generated") return <span className="text-white/30">—</span>;
  if (entry.htmlStatus === "unchecked") return <span className="text-white/30">—</span>;
  if (entry.htmlStatus === "checking")
    return <span className="pill bg-accent/15 text-accent">checking…</span>;
  if (entry.pageCount === 8)
    return <span className="pill bg-emerald-500/15 text-emerald-300">8</span>;
  return (
    <span className="pill bg-severity-critical/15 text-severity-critical">
      {entry.pageCount ?? 0}
    </span>
  );
}

function catFallbackBadge(entry: QaEntry) {
  if (entry.status !== "generated") return <span className="text-white/30">—</span>;
  if (entry.htmlStatus === "unchecked" || entry.htmlStatus === "checking")
    return <span className="text-white/30">—</span>;
  if (entry.categoryFallbackDetected)
    return (
      <span className="pill bg-severity-warning/15 text-severity-warning">yes</span>
    );
  return <span className="pill bg-emerald-500/10 text-emerald-400">none</span>;
}

// ── CSV export ────────────────────────────────────────────────────────────────

function buildCsv(entries: QaEntry[]): string {
  const headers = [
    "URL",
    "Business Name",
    "Status",
    "Score",
    "Band",
    "Report URL",
    "PDF",
    "Pages",
    "Page Issues",
    "Model Failures",
    "Malformed Text",
    "Rendered HTML Issues",
    "Category Fallback",
    "Error",
  ];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = entries.map((e) =>
    [
      e.url,
      e.businessName ?? "",
      e.status,
      e.score ?? "",
      e.band ?? "",
      `${typeof window !== "undefined" ? window.location.origin : ""}${e.reportUrl}`,
      e.pdfStatus,
      e.pageCount ?? "",
      e.htmlIssues.join("; "),
      e.modelFailures,
      e.malformedTextDetected ? "yes" : "no",
      e.validationIssues.join("; "),
      e.categoryFallbackDetected ? "yes" : "no",
      e.error ?? "",
    ]
      .map(escape)
      .join(","),
  );
  return [headers.map(escape).join(","), ...rows].join("\n");
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BatchQaRunner({ adminKey }: { adminKey: string }) {
  const [urlText, setUrlText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [entries, setEntries] = useState<QaEntry[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Array<{ url: string; reason: string }>>(
    [],
  );
  const [pdfRunning, setPdfRunning] = useState(false);
  const [recheckRunning, setRecheckRunning] = useState(false);
  const [savedBatch, setSavedBatch] = useState<SavedBatch | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function parseUrls(): string[] {
    return urlText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 50);
  }

  // ── Poll ────────────────────────────────────────────────────────────────────

  const poll = useCallback(
    async (ids: string[]) => {
      try {
        const res = await fetch(
          `/api/internal/batch-qa?orderIds=${ids.join(",")}&key=${adminKey}`,
          { headers: { "x-admin-secret": adminKey } },
        );
        if (!res.ok) return;
        const data = (await res.json()) as PollResponse;
        if (!data.results) return;

        const toValidate: string[] = [];

        setEntries((prev) => {
          const byId = new Map(data.results!.map((r) => [r.orderId, r]));
          const next = prev.map((e) => {
            const update = byId.get(e.orderId);
            if (!update) return e;

            const newlyGenerated =
              !TERMINAL.has(e.status) && update.status === "generated";

            if (newlyGenerated) {
              toValidate.push(e.orderId);
              return {
                ...e,
                ...update,
                pdfStatus: e.pdfStatus,
                htmlStatus: "checking" as HtmlStatus,
                pageCount: null,
                htmlIssues: [],
                categoryFallbackDetected: false,
              };
            }

            return { ...e, ...update, pdfStatus: e.pdfStatus };
          });

          if (next.every((e) => TERMINAL.has(e.status))) {
            setPhase("done");
          }
          return next;
        });

        for (const orderId of toValidate) {
          validateReportHtml(orderId).then((result) => {
            setEntries((cur) =>
              cur.map((ce) =>
                ce.orderId === orderId
                  ? {
                      ...ce,
                      htmlStatus:
                        result.htmlIssues.length === 0 ? "pass" : "fail",
                      pageCount: result.pageCount,
                      htmlIssues: result.htmlIssues,
                      categoryFallbackDetected: result.categoryFallbackDetected,
                    }
                  : ce,
              ),
            );
          });
        }
      } catch {
        // Network error — keep polling
      }
    },
    [adminKey],
  );

  useEffect(() => {
    if (phase !== "polling") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    const ids = entries.map((e) => e.orderId);
    poll(ids);
    pollRef.current = setInterval(() => poll(ids), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [phase, poll]); // entries excluded — snapshot on polling start

  // ── Persistence ─────────────────────────────────────────────────────────────

  // Restore saved batch + active session on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSavedBatch(JSON.parse(raw) as SavedBatch);
    } catch {}
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const session = JSON.parse(raw) as { entries: QaEntry[]; phase: Phase; batchId?: string };
        if (session.entries?.length > 0) {
          // Back-fill printUrl / pdfUrl for sessions saved before these fields existed.
          const restoredEntries: QaEntry[] = session.entries.map((e: QaEntry) => ({
            ...e,
            printUrl: e.printUrl ?? `${e.reportUrl}/print`,
            pdfUrl: e.pdfUrl ?? `/api/report/${e.orderId}/pdf`,
          }));
          setEntries(restoredEntries);
          if (session.batchId) setActiveBatchId(session.batchId);
          // Resume polling if mid-batch; treat everything else as done.
          const hasActive = session.entries.some((e) => !TERMINAL.has(e.status));
          setPhase(hasActive && session.phase === "polling" ? "polling" : "done");
        }
      }
    } catch {}
  }, []);

  // Auto-save active session whenever entries or phase change.
  useEffect(() => {
    if (entries.length === 0) {
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      return;
    }
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ entries, phase, batchId: activeBatchId }));
    } catch {}
  }, [entries, phase, activeBatchId]);

  // ── Create ──────────────────────────────────────────────────────────────────

  async function submitUrls(urls: string[]) {
    try {
      const res = await fetch("/api/admin/calibration", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-secret": adminKey,
        },
        body: JSON.stringify({ urls }),
      });
      const data = (await res.json()) as CalibrationResponse;
      if (!res.ok || data.error) {
        setCreateError(data.error ?? `HTTP ${res.status}`);
        setPhase("idle");
        return;
      }
      const created = data.created ?? [];
      if (created.length === 0) {
        setCreateError("No orders created — all URLs may have been skipped.");
        setPhase("idle");
        return;
      }
      setSkipped(data.skippedDetail ?? []);
      if (data.batchId) setActiveBatchId(data.batchId);
      const initial: QaEntry[] = created.map(({ id, url }) => ({
        orderId: id,
        url,
        businessName: null,
        status: "queued",
        score: null,
        band: null,
        reportUrl: `/report/${id}`,
        printUrl: `/report/${id}/print`,
        pdfUrl: `/api/report/${id}/pdf`,
        modelFailures: 0,
        malformedTextDetected: false,
        validationIssues: [],
        error: null,
        pdfStatus: "unchecked",
        htmlStatus: "unchecked",
        pageCount: null,
        htmlIssues: [],
        categoryFallbackDetected: false,
      }));
      setEntries(initial);
      setPhase("polling");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setCreateError(msg);
      setPhase("idle");
    }
  }

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const urls = parseUrls();
    if (urls.length === 0) {
      setCreateError("Paste at least one URL.");
      return;
    }
    setPhase("creating");
    setCreateError(null);
    setSkipped([]);
    setEntries([]);
    await submitUrls(urls);
  }

  async function handleRecoverBatch() {
    setCreateError(null);
    try {
      const res = await fetch(
        `/api/internal/recover-batch?key=${adminKey}`,
        { headers: { "x-admin-secret": adminKey } },
      );
      const data = (await res.json()) as { results?: PollResponse["results"]; total?: number; batchId?: string | null; error?: string };
      if (!res.ok || data.error) {
        setCreateError(data.error ?? `HTTP ${res.status}`);
        return;
      }
      if (!data.results?.length) {
        setCreateError("No [CAL] calibration audits found.");
        return;
      }
      const recovered: QaEntry[] = data.results.map((r) => ({
        ...r,
        printUrl: `${r.reportUrl}/print`,
        pdfUrl: `/api/report/${r.orderId}/pdf`,
        pdfStatus: "unchecked" as PdfStatus,
        htmlStatus: "unchecked" as HtmlStatus,
        pageCount: null,
        htmlIssues: [],
        categoryFallbackDetected: false,
      }));
      setEntries(recovered);
      setSkipped([]);
      if (data.batchId) setActiveBatchId(data.batchId);
      setPhase("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      setCreateError(msg);
    }
  }

  async function handleRecheckReports() {
    setRecheckRunning(true);
    const generated = entries.filter((e) => e.status === "generated");

    setEntries((prev) =>
      prev.map((e) =>
        e.status === "generated"
          ? { ...e, htmlStatus: "checking", pageCount: null,
              htmlIssues: [], categoryFallbackDetected: false, pdfStatus: "unchecked" }
          : e,
      ),
    );

    // HTML — concurrent
    await Promise.all(
      generated.map(async (entry) => {
        const result = await validateReportHtml(entry.orderId);
        setEntries((cur) =>
          cur.map((ce) =>
            ce.orderId === entry.orderId
              ? { ...ce,
                  htmlStatus: result.htmlIssues.length === 0 ? "pass" : "fail",
                  pageCount: result.pageCount,
                  htmlIssues: result.htmlIssues,
                  categoryFallbackDetected: result.categoryFallbackDetected,
                }
              : ce,
          ),
        );
      }),
    );

    // PDF — inlined (uses `generated` snapshot, avoids stale `entries` closure)
    setPdfRunning(true);
    for (let i = 0; i < generated.length; i += PDF_CONCURRENCY) {
      const batch = generated.slice(i, i + PDF_CONCURRENCY);
      setEntries((prev) =>
        prev.map((e) =>
          batch.some((b) => b.orderId === e.orderId) ? { ...e, pdfStatus: "generating" } : e,
        ),
      );
      await Promise.all(
        batch.map(async (entry) => {
          const next = await fetch(`/api/report/${entry.orderId}/pdf`)
            .then((r) => (r.ok ? "pass" : "fail"))
            .catch(() => "fail") as PdfStatus;
          setEntries((prev) =>
            prev.map((e) => e.orderId === entry.orderId ? { ...e, pdfStatus: next } : e),
          );
        }),
      );
    }
    setPdfRunning(false);
    setRecheckRunning(false);
  }

  async function handleRerunLastBatch() {
    if (!savedBatch) return;
    setPhase("creating");
    setCreateError(null);
    setSkipped([]);
    setEntries([]);
    setUrlText(savedBatch.urls.join("\n"));
    await submitUrls(savedBatch.urls);
  }

  function handleViewLastResults() {
    if (!savedBatch) return;
    setEntries(savedBatch.results);
    setSkipped([]);
    setPhase("done");
  }

  function handleSaveBatch() {
    const batch: SavedBatch = {
      timestamp: new Date().toISOString(),
      urls: entries.map((e) => e.url),
      results: entries,
      batchId: activeBatchId ?? undefined,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(batch));
      setSavedBatch(batch);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch {
      // storage full or unavailable
    }
  }

  function handleNewBatch() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setPhase("idle");
    setEntries([]);
    setUrlText("");
    setSkipped([]);
    setActiveBatchId(null);
  }

  // ── PDF check (max 2 concurrent) ────────────────────────────────────────────

  async function handleCheckPdfs() {
    setPdfRunning(true);
    const targets = entries.filter(
      (e) => e.status === "generated" && e.pdfStatus === "unchecked",
    );

    for (let i = 0; i < targets.length; i += PDF_CONCURRENCY) {
      const batch = targets.slice(i, i + PDF_CONCURRENCY);
      setEntries((prev) =>
        prev.map((e) =>
          batch.some((b) => b.orderId === e.orderId)
            ? { ...e, pdfStatus: "generating" }
            : e,
        ),
      );
      await Promise.all(
        batch.map(async (entry) => {
          const next = await fetch(`/api/report/${entry.orderId}/pdf`)
            .then((r) => (r.ok ? "pass" : "fail"))
            .catch(() => "fail") as PdfStatus;
          setEntries((prev) =>
            prev.map((e) =>
              e.orderId === entry.orderId ? { ...e, pdfStatus: next } : e,
            ),
          );
        }),
      );
    }

    setPdfRunning(false);
  }

  // ── CSV export ───────────────────────────────────────────────────────────────

  function handleExportCsv() {
    const csv = buildCsv(entries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `geoviz-launch-qa-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Summary stats ────────────────────────────────────────────────────────────

  const completed = entries.filter((e) => e.status === "generated").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const pending = entries.filter((e) => !TERMINAL.has(e.status)).length;
  const scores = entries.filter((e) => e.score !== null).map((e) => e.score!);
  const avgScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const pageFailCount = entries.filter(
    (e) => e.htmlStatus === "fail" && e.pageCount !== 8,
  ).length;
  const malformedCount = entries.filter(
    (e) => e.malformedTextDetected || e.htmlIssues.length > 0,
  ).length;
  const categoryFallbackCount = entries.filter(
    (e) => e.categoryFallbackDetected,
  ).length;
  const modelFailureCount = entries.filter((e) => e.modelFailures > 0).length;
  const pdfFailCount = entries.filter((e) => e.pdfStatus === "fail").length;
  const needsReview = entries.filter(
    (e) =>
      e.status === "failed" ||
      e.pdfStatus === "fail" ||
      (e.htmlStatus === "fail" && e.pageCount !== 8) ||
      e.malformedTextDetected ||
      e.categoryFallbackDetected,
  ).length;
  const uncheckedPdfs = entries.filter(
    (e) => e.status === "generated" && e.pdfStatus === "unchecked",
  ).length;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* URL input form — only when idle or creating */}
      {(phase === "idle" || phase === "creating") && (
        <form onSubmit={handleStart} className="card p-6">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-white/50">
              URLs · one per line (max 50)
            </span>
            <textarea
              required
              rows={10}
              placeholder={"https://example.com\nhttps://another-site.com"}
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              className="input-field mt-1.5 w-full font-mono text-sm"
            />
            <span className="mt-1 block text-xs text-white/50">
              Parsed: {parseUrls().length} URL(s)
            </span>
          </label>
          <div className="mt-5 flex items-center gap-3">
            <button
              type="submit"
              disabled={phase === "creating"}
              className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "creating" ? "Creating orders…" : "Start QA Batch"}
            </button>
            {createError && (
              <p className="text-sm text-severity-critical">{createError}</p>
            )}
          </div>
          <div className="mt-5 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={handleRecoverBatch}
              className="btn-ghost text-sm"
            >
              Recover Last Batch
            </button>
            <p className="mt-1 text-xs text-white/40">
              Loads all existing [CAL] calibration orders — no new audits created, no API spend
            </p>
          </div>
        </form>
      )}

      {/* Persistent toolbar — always visible when there is data or a saved batch */}
      {(entries.length > 0 || savedBatch) && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-white/10 bg-white/[0.02] px-4 py-3">
          {entries.length > 0 && (
            <>
              <button onClick={handleExportCsv} className="btn-ghost text-sm">
                Export CSV
              </button>
              <button onClick={handleSaveBatch} className="btn-ghost text-sm">
                {savedFlash ? "Saved ✓" : "Save Batch"}
              </button>
            </>
          )}
          {savedBatch && (
            <>
              <button
                type="button"
                onClick={handleRerunLastBatch}
                disabled={phase === "creating"}
                className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                ↺ Rerun Last Batch
                <span className="ml-1 text-[10px] text-white/40">(new audits)</span>
              </button>
              <button
                type="button"
                onClick={handleViewLastResults}
                className="btn-ghost text-sm"
              >
                View Last Results
              </button>
            </>
          )}
          {savedBatch && (
            <span className="text-xs text-white/40">
              Saved: {savedBatch.urls.length} URL{savedBatch.urls.length !== 1 ? "s" : ""} ·{" "}
              {new Date(savedBatch.timestamp).toLocaleString()}
            </span>
          )}
          {activeBatchId && (
            <span className="font-mono text-xs text-white/30" title="Batch ID">
              {activeBatchId}
            </span>
          )}
          {phase === "done" && (
            <>
              <span className="text-white/20">|</span>
              <button
                onClick={() => {
                  entries
                    .filter((e) => e.status === "generated")
                    .forEach((e, i) => {
                      setTimeout(() => window.open(e.printUrl, "_blank"), i * 150);
                    });
                }}
                disabled={completed === 0}
                className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                Open All HTML ({completed})
              </button>
              <button
                onClick={handleRecheckReports}
                disabled={recheckRunning || completed === 0}
                className="btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {recheckRunning ? "Re-checking…" : "Re-check Reports"}
              </button>
              <button
                onClick={handleCheckPdfs}
                disabled={pdfRunning || uncheckedPdfs === 0}
                className="btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pdfRunning ? "Generating PDFs…" : "Check PDFs"}
              </button>
              {pdfFailCount > 0 && (
                <span className="text-sm text-severity-critical">
                  {pdfFailCount} PDF failure(s)
                </span>
              )}
              {categoryFallbackCount > 0 && (
                <span className="text-sm text-severity-warning">
                  {categoryFallbackCount} category fallback(s)
                </span>
              )}
              <button
                onClick={handleNewBatch}
                className="text-sm text-white/50 hover:text-white"
              >
                New batch
              </button>
            </>
          )}
        </div>
      )}

      {/* Skipped URLs */}
      {skipped.length > 0 && (
        <div className="mt-4 rounded-md border border-severity-warning/30 bg-severity-warning/10 p-4">
          <p className="mb-2 text-sm font-medium text-severity-warning">
            {skipped.length} URL(s) skipped
          </p>
          <ul className="space-y-1 text-xs text-white/60">
            {skipped.map((s, i) => (
              <li key={i} className="font-mono">
                {s.url} — {s.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live progress + results table */}
      {entries.length > 0 && (
        <div className="mt-6">
          {/* Polling status line */}
          {phase === "polling" && (
            <p className="mb-3 text-sm text-accent">
              Polling · {pending} pending · {completed} done · {failed} failed
            </p>
          )}

          {/* Summary bar (shown when all audits terminal) */}
          {phase === "done" && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              {[
                { label: "Total", value: entries.length, tone: "text-white" },
                { label: "Completed", value: completed, tone: "text-emerald-300" },
                { label: "Failed", value: failed, tone: failed > 0 ? "text-severity-critical" : "text-white/40" },
                { label: "Avg score", value: avgScore !== null ? String(avgScore) : "—", tone: "text-accent" },
                { label: "Model failures", value: modelFailureCount, tone: modelFailureCount > 0 ? "text-severity-warning" : "text-white/40" },
                { label: "Page failures", value: pageFailCount, tone: pageFailCount > 0 ? "text-severity-critical" : "text-white/40" },
                { label: "Malformed text", value: malformedCount, tone: malformedCount > 0 ? "text-severity-warning" : "text-white/40" },
                { label: "Needs review", value: needsReview, tone: needsReview > 0 ? "text-severity-critical" : "text-emerald-300" },
              ].map((kpi) => (
                <div key={kpi.label} className="card p-3">
                  <p className="text-xs uppercase tracking-wide text-white/40">
                    {kpi.label}
                  </p>
                  <p className={`mono-data mt-1 text-xl font-semibold ${kpi.tone}`}>
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Results table */}
          <div className="overflow-x-auto rounded-md border border-white/10">
            <table className="w-full text-sm">
              <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="px-3 py-3 text-left">URL</th>
                  <th className="px-3 py-3 text-left">Status</th>
                  <th className="px-3 py-3 text-left">Score</th>
                  <th className="px-3 py-3 text-center">Pages</th>
                  <th className="px-3 py-3 text-center">PDF</th>
                  <th className="px-3 py-3 text-center">Cat. fallback</th>
                  <th className="px-3 py-3 text-right">Models</th>
                  <th className="px-3 py-3 text-left">Issues / Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {entries.map((e) => {
                  const hasIssue =
                    e.malformedTextDetected ||
                    e.htmlIssues.length > 0 ||
                    e.categoryFallbackDetected ||
                    (e.htmlStatus === "fail" && e.pageCount !== 8) ||
                    e.status === "failed";
                  const allIssues = [
                    ...e.validationIssues,
                    ...e.htmlIssues,
                  ];

                  return (
                    <tr
                      key={e.orderId}
                      className={hasIssue ? "bg-severity-critical/5" : ""}
                    >
                      {/* URL */}
                      <td className="px-3 py-3">
                        <div className="max-w-[200px]">
                          {e.status === "generated" ? (
                            <a
                              href={e.printUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate font-mono text-xs text-accent hover:underline"
                            >
                              {e.url}
                            </a>
                          ) : (
                            <span className="block truncate font-mono text-xs text-white/70">
                              {e.url}
                            </span>
                          )}
                          {e.businessName && (
                            <span className="mt-0.5 block truncate text-xs text-white/40">
                              {e.businessName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3">
                        <span className={statusPill(e.status)}>{e.status}</span>
                      </td>

                      {/* Score */}
                      <td className="px-3 py-3">
                        {e.score !== null ? (
                          <span className="mono-data font-medium">
                            {e.score}
                            {e.band && (
                              <span className="ml-1 text-xs text-white/40">
                                {e.band}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>

                      {/* Pages */}
                      <td className="px-3 py-3 text-center">{pagesBadge(e)}</td>

                      {/* PDF */}
                      <td className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {pdfBadge(e.pdfStatus)}
                          {e.status === "generated" && (
                            <a
                              href={e.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-accent/70 hover:text-accent hover:underline"
                            >
                              ↓ PDF
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Category fallback */}
                      <td className="px-3 py-3 text-center">{catFallbackBadge(e)}</td>

                      {/* Model failures */}
                      <td className="px-3 py-3 text-right">
                        {e.status === "generated" ? (
                          <span
                            className={
                              e.modelFailures > 0
                                ? "font-medium text-severity-warning"
                                : "text-white/40"
                            }
                          >
                            {e.modelFailures > 0 ? e.modelFailures : "0"}
                          </span>
                        ) : (
                          <span className="text-white/30">—</span>
                        )}
                      </td>

                      {/* Issues / Error */}
                      <td className="max-w-[220px] px-3 py-3">
                        {allIssues.length > 0 && (
                          <ul className="space-y-0.5 text-xs text-severity-warning">
                            {allIssues.map((iss, i) => (
                              <li key={i}>{iss}</li>
                            ))}
                          </ul>
                        )}
                        {e.error && (
                          <p className="truncate text-xs text-severity-critical">
                            {e.error}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
