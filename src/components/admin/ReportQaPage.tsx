"use client";

import { useState, useEffect, useCallback } from "react";
import type { BatchSummary } from "@/app/api/admin/report-qa/batches/route";

// ── Types ─────────────────────────────────────────────────────────────────────

type HtmlStatus = "unchecked" | "checking" | "pass" | "fail";
type PdfStatus = "unchecked" | "generating" | "pass" | "fail";
type ReviewStatus = "pending" | "approved" | "needs_changes";
type Filter =
  | "all"
  | "unreviewed"
  | "needs_fix"
  | "failed_html"
  | "failed_pdf"
  | "failed_audit";

type QaEntry = {
  orderId: string;
  url: string;
  businessName: string | null;
  status: string;
  score: number | null;
  band: string | null;
  reportUrl: string;
  printUrl: string;
  pdfUrl: string;
  reportGeneratedAt: string | null;
  modelFailures: number;
  malformedTextDetected: boolean;
  validationIssues: string[];
  error: string | null;
  // client-side validation
  htmlStatus: HtmlStatus;
  pdfStatus: PdfStatus;
  pageCount: number | null;
  htmlIssues: string[];
  categoryFallbackDetected: boolean;
  // review state
  reviewStatus: ReviewStatus;
  adminNotes: string | null;
  noteDraft: string;
  saving: boolean;
};

// TODO: Report versioning (post-launch)
// - Add `reportTemplateVersion String?` to AuditOrder (e.g. from package.json semver).
// - Add `reportHtmlSnapshotAt DateTime?` to mark the timestamp of the last QA pass.
// - Store PDF snapshots to Vercel Blob: `report-snapshots/{orderId}/{timestamp}.pdf`.
// - Compare page at /admin/report-qa/compare?a={snapshotId}&b={snapshotId}.

// EXTENSION POINT: Audit drift monitoring — store checklist snapshots keyed by
// {orderId}:{isoDate} in AuditIntelligence.calibrationNotes to detect template regressions.
// EXTENSION POINT: Before/After comparison — capture pre-regen { pageCount, htmlIssues }
// snapshot before each re-check; surface diff inline after re-check completes.
// EXTENSION POINT: Monitoring subscriptions — POST /api/admin/report-qa/subscribe
// { batchId, alertOn: ["html_fail","pdf_fail","score_change"] } → MonitoringSubscription table.

// ── Checklist ─────────────────────────────────────────────────────────────────

const CHECKLIST_ITEMS = [
  "Cover page loads and looks professional",
  "Business name and URL are correct",
  "Overall score is believable for this site",
  "Score breakdown adds up to overall score",
  "Platform analysis section is complete",
  "Recommendations are specific, not generic",
  "No duplicate recommendation items",
  "No broken formatting or layout issues",
  "Charts and visual elements render correctly",
  "HTML report renders in browser without errors",
  "Print view (Ctrl+P) looks correct",
  "PDF page breaks are clean and logical",
  "GeoViz branding is consistent throughout",
  "Report feels worth the $97 paid",
] as const;

type PatternSummary = {
  totalIssues: number;
  topIssues: string[];
  categoryFallbackCount: number;
  outlierLow: string[];
  outlierHigh: string[];
  missingPageCount: number;
};

type ReadinessLevel = "ready" | "minor_issues" | "not_ready";
type ReadinessResult = { level: ReadinessLevel; label: string; reasons: string[] };

// ── Validation helpers ────────────────────────────────────────────────────────

// These patterns mirror the FORBIDDEN_QA list in recover-batch/route.ts.
// Validation is read-only: fetches existing rendered HTML — no LLM calls, no new records.
const FORBIDDEN_QA: Array<[RegExp, string]> = [
  [/json-?ld\s+block/i, "json-ld block"],
  [/\blocalbusiness\b/i, "LocalBusiness jargon"],
  [/\bnap\s+consistency\b/i, "NAP consistency jargon"],
  [/no response captured/i, "internal error string"],
  [/fields?\s+missing:.*\bgeo\b/i, "raw field 'geo'"],
  [/fields?\s+missing:.*\bopeninghours\b/i, "raw field 'openingHours'"],
  [/\bundefined\b/, "literal 'undefined'"],
  [/\[object\s*Object\]/i, "[object Object]"],
  [/best and /i, "broken question template"],
  [/best or /i, "broken question template"],
];

const CATEGORY_FALLBACKS = [
  "Who are the best businesses in this category",
  "Can you recommend a reliable provider like",
  "What should I look for when choosing a business in this category",
];

type HtmlValidationResult = {
  pageCount: number;
  htmlIssues: string[];
  categoryFallbackDetected: boolean;
};

async function validateReportHtml(
  orderId: string,
): Promise<HtmlValidationResult> {
  const empty: HtmlValidationResult = {
    pageCount: 0,
    htmlIssues: [],
    categoryFallbackDetected: false,
  };
  try {
    const res = await fetch(`/report/${orderId}/print`);
    if (!res.ok) {
      return { ...empty, htmlIssues: [`HTTP ${res.status}`] };
    }
    const html = await res.text();
    const pageCount = (html.match(/<section[^>]*\brd-page\b/g) ?? []).length;
    const htmlIssues: string[] = [];
    if (pageCount !== 8) {
      htmlIssues.push(`expected 8 pages, got ${pageCount}`);
    }
    for (const [re, label] of FORBIDDEN_QA) {
      if (re.test(html)) htmlIssues.push(label);
    }
    const categoryFallbackDetected = CATEGORY_FALLBACKS.some((pat) =>
      html.includes(pat),
    );
    return { pageCount, htmlIssues, categoryFallbackDetected };
  } catch (err) {
    return {
      ...empty,
      htmlIssues: [err instanceof Error ? err.message : "fetch error"],
    };
  }
}

// ── CSV export ────────────────────────────────────────────────────────────────

function buildCsv(entries: QaEntry[]): string {
  const headers = [
    "URL",
    "Business",
    "Score",
    "Band",
    "Report Status",
    "HTML Status",
    "Pages",
    "PDF Status",
    "Review Status",
    "HTML Issues",
    "Model Failures",
    "Category Fallback",
    "Admin Notes",
    "Error",
  ];
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = entries.map((e) =>
    [
      e.url,
      e.businessName ?? "",
      e.score ?? "",
      e.band ?? "",
      e.status,
      e.htmlStatus,
      e.pageCount ?? "",
      e.pdfStatus,
      e.reviewStatus,
      e.htmlIssues.join("; "),
      e.modelFailures,
      e.categoryFallbackDetected ? "yes" : "no",
      e.adminNotes ?? "",
      e.error ?? "",
    ]
      .map(escape)
      .join(","),
  );
  return [headers.map(escape).join(","), ...rows].join("\n");
}

// ── Checklist + pattern helpers ───────────────────────────────────────────────

function clKey(orderId: string) {
  return `geoviz:qa-cl:${orderId}`;
}

function loadChecklist(orderId: string): boolean[] {
  try {
    const raw = localStorage.getItem(clKey(orderId));
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length === CHECKLIST_ITEMS.length
      ) {
        return parsed as boolean[];
      }
    }
  } catch {}
  return Array(CHECKLIST_ITEMS.length).fill(false) as boolean[];
}

function saveChecklist(orderId: string, items: boolean[]): void {
  try {
    localStorage.setItem(clKey(orderId), JSON.stringify(items));
  } catch {}
}

function detectPatterns(entries: QaEntry[]): PatternSummary {
  const counts: Record<string, number> = {};
  let catFallback = 0;
  let missingPages = 0;
  const low: string[] = [];
  const high: string[] = [];

  for (const e of entries) {
    if (e.status !== "generated") continue;
    for (const iss of [...e.validationIssues, ...e.htmlIssues]) {
      counts[iss] = (counts[iss] ?? 0) + 1;
    }
    if (e.categoryFallbackDetected) catFallback++;
    if (e.score !== null && e.score < 20) low.push(e.url);
    if (e.score !== null && e.score > 80) high.push(e.url);
    if (
      e.htmlStatus !== "unchecked" &&
      e.pageCount !== null &&
      e.pageCount !== 8
    ) {
      missingPages++;
    }
  }

  const topIssues = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([iss, n]) => `${iss} (×${n})`);

  return {
    totalIssues: Object.values(counts).reduce((a, b) => a + b, 0),
    topIssues,
    categoryFallbackCount: catFallback,
    outlierLow: low,
    outlierHigh: high,
    missingPageCount: missingPages,
  };
}

function computeReadiness(
  generated: number,
  reviewed: number,
  needsFix: number,
  htmlFail: number,
  pdfFail: number,
  auditFailed: number,
): ReadinessResult {
  if (generated === 0) {
    return {
      level: "not_ready",
      label: "🔴 Not Ready",
      reasons: ["No generated reports"],
    };
  }
  const reasons: string[] = [];
  if (htmlFail > 0) reasons.push(`${htmlFail} HTML failure${htmlFail > 1 ? "s" : ""}`);
  if (pdfFail > 0) reasons.push(`${pdfFail} PDF failure${pdfFail > 1 ? "s" : ""}`);
  if (auditFailed > 0) reasons.push(`${auditFailed} audit failure${auditFailed > 1 ? "s" : ""}`);
  if (needsFix > 0) reasons.push(`${needsFix} need${needsFix > 1 ? "" : "s"} fix`);
  const unrev = generated - reviewed;
  if (unrev > 0) reasons.push(`${unrev}/${generated} unreviewed`);

  const critical = htmlFail + pdfFail + auditFailed;
  const level: ReadinessLevel =
    critical > 0
      ? "not_ready"
      : needsFix > 0 || reviewed < generated
        ? "minor_issues"
        : "ready";
  const label =
    level === "ready"
      ? "🟢 Ready to Launch"
      : level === "minor_issues"
        ? "🟡 Minor Issues"
        : "🔴 Not Ready";
  return { level, label, reasons };
}

// ── Badges ────────────────────────────────────────────────────────────────────

function htmlBadge(s: HtmlStatus, pageCount: number | null) {
  if (s === "unchecked")
    return (
      <span className="pill bg-white/5 text-white/40 text-[10px]">—</span>
    );
  if (s === "checking")
    return (
      <span className="pill bg-white/10 text-white/60 text-[10px]">
        checking…
      </span>
    );
  if (s === "pass")
    return (
      <span className="pill bg-emerald-500/15 text-emerald-300 text-[10px]">
        ✓ {pageCount ?? "?"}p
      </span>
    );
  return (
    <span className="pill bg-severity-critical/15 text-severity-critical text-[10px]">
      ✗ {pageCount ?? "?"}p
    </span>
  );
}

function pdfBadge(s: PdfStatus) {
  if (s === "unchecked")
    return (
      <span className="pill bg-white/5 text-white/40 text-[10px]">—</span>
    );
  if (s === "generating")
    return (
      <span className="pill bg-white/10 text-white/60 text-[10px]">gen…</span>
    );
  if (s === "pass")
    return (
      <span className="pill bg-emerald-500/15 text-emerald-300 text-[10px]">
        ✓
      </span>
    );
  return (
    <span className="pill bg-severity-critical/15 text-severity-critical text-[10px]">
      ✗
    </span>
  );
}

function reviewBadge(s: ReviewStatus) {
  if (s === "approved")
    return (
      <span className="pill bg-emerald-500/15 text-emerald-300 text-[10px]">
        Reviewed
      </span>
    );
  if (s === "needs_changes")
    return (
      <span className="pill bg-severity-warning/15 text-severity-warning text-[10px]">
        Needs Fix
      </span>
    );
  return (
    <span className="pill bg-white/5 text-white/40 text-[10px]">
      Unreviewed
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ReportQaPage({ adminKey }: { adminKey: string }) {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(true);
  const [batchesError, setBatchesError] = useState<string | null>(null);

  const [selectedBatchId, setSelectedBatchId] = useState<
    string | null | undefined
  >(undefined); // undefined = no batch selected; null = legacy virtual batch
  const [entries, setEntries] = useState<QaEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  const [filter, setFilter] = useState<Filter>("all");
  const [recheckRunning, setRecheckRunning] = useState(false);
  const [pdfRunning, setPdfRunning] = useState(false);
  const [showRecheckConfirm, setShowRecheckConfirm] = useState(false);

  // QA dashboard state
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<Record<string, boolean[]>>({});
  const [patterns, setPatterns] = useState<PatternSummary | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState<
    "html" | null
  >(null);
  const [lastRegeneratedAt, setLastRegeneratedAt] = useState<string | null>(
    null,
  );

  // ── Load batch list ──────────────────────────────────────────────────────

  useEffect(() => {
    setBatchesLoading(true);
    fetch(`/api/admin/report-qa/batches?key=${adminKey}`, {
      headers: { "x-admin-secret": adminKey },
    })
      .then((r) => r.json())
      .then((d: { batches?: BatchSummary[]; error?: string }) => {
        if (d.error) {
          setBatchesError(d.error);
        } else {
          setBatches(d.batches ?? []);
        }
      })
      .catch((e: unknown) => {
        setBatchesError(e instanceof Error ? e.message : "Network error");
      })
      .finally(() => setBatchesLoading(false));
  }, [adminKey]);

  // ── Load batch detail ────────────────────────────────────────────────────

  const loadBatch = useCallback(
    async (batchId: string | null) => {
      setSelectedBatchId(batchId);
      setEntries([]);
      setEntriesError(null);
      setFilter("all");
      setPatterns(null);
      setEntriesLoading(true);

      try {
        const url =
          batchId != null
            ? `/api/internal/recover-batch?key=${adminKey}&batchId=${batchId}`
            : `/api/internal/recover-batch?key=${adminKey}`;
        const res = await fetch(url, {
          headers: { "x-admin-secret": adminKey },
        });
        const data = (await res.json()) as {
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
            reviewStatus?: string;
            adminNotes?: string | null;
            createdAt?: string;
          }>;
          error?: string;
        };
        if (!res.ok || data.error) {
          setEntriesError(data.error ?? `HTTP ${res.status}`);
          return;
        }
        if (!data.results?.length) {
          setEntriesError("No audits found for this batch.");
          return;
        }

        const loaded: QaEntry[] = data.results.map((r) => ({
          ...r,
          printUrl: `${r.reportUrl}/print`,
          pdfUrl: `/api/report/${r.orderId}/pdf`,
          reportGeneratedAt: null,
          htmlStatus: "unchecked",
          pdfStatus: "unchecked",
          pageCount: null,
          htmlIssues: [],
          categoryFallbackDetected: false,
          reviewStatus: (r.reviewStatus ?? "pending") as ReviewStatus,
          adminNotes: r.adminNotes ?? null,
          noteDraft: r.adminNotes ?? "",
          saving: false,
        }));
        setEntries(loaded);
      } catch (err) {
        setEntriesError(err instanceof Error ? err.message : "Network error");
      } finally {
        setEntriesLoading(false);
      }
    },
    [adminKey],
  );

  // ── Re-check (HTML + PDF) ────────────────────────────────────────────────

  async function handleRecheck() {
    setShowRecheckConfirm(false);
    setRecheckRunning(true);
    const start = Date.now();

    const generated = entries.filter((e) => e.status === "generated");

    // Reset HTML status.
    setEntries((prev) =>
      prev.map((e) =>
        e.status === "generated"
          ? { ...e, htmlStatus: "checking", pdfStatus: "unchecked" }
          : e,
      ),
    );

    // HTML validation — concurrent.
    await Promise.all(
      generated.map(async (entry) => {
        const result = await validateReportHtml(entry.orderId);
        setEntries((prev) =>
          prev.map((e) =>
            e.orderId === entry.orderId
              ? {
                  ...e,
                  htmlStatus:
                    result.htmlIssues.length === 0 ? "pass" : "fail",
                  pageCount: result.pageCount,
                  htmlIssues: result.htmlIssues,
                  categoryFallbackDetected: result.categoryFallbackDetected,
                }
              : e,
          ),
        );
      }),
    );

    // PDF check — max 2 concurrent.
    await runPdfChecks(generated.map((e) => e.orderId));

    // Trigger pattern detection and log the summary.
    setEntries((snapshot) => {
      setPatterns(detectPatterns(snapshot));
      const htmlPass = snapshot.filter((e) => e.htmlStatus === "pass").length;
      const htmlFail = snapshot.filter((e) => e.htmlStatus === "fail").length;
      const pdfPass = snapshot.filter((e) => e.pdfStatus === "pass").length;
      const pdfFail = snapshot.filter((e) => e.pdfStatus === "fail").length;
      void fetch(`/api/admin/report-qa/recheck-log?key=${adminKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminKey,
        },
        body: JSON.stringify({
          batchId: selectedBatchId ?? null,
          total: generated.length,
          htmlPass,
          htmlFail,
          pdfPass,
          pdfFail,
          durationMs: Date.now() - start,
        }),
      }).catch(() => {}); // Fire-and-forget — don't block UI.
      return snapshot;
    });

    setLastRegeneratedAt(new Date().toISOString());
    setRecheckRunning(false);
  }

  // ── HTML-only re-check ───────────────────────────────────────────────────

  async function handleRegenHtml() {
    setShowRegenConfirm(null);
    setRecheckRunning(true);
    const start = Date.now();
    const gen = entries.filter((e) => e.status === "generated");

    setEntries((prev) =>
      prev.map((e) =>
        e.status === "generated" ? { ...e, htmlStatus: "checking" } : e,
      ),
    );

    await Promise.all(
      gen.map(async (entry) => {
        const result = await validateReportHtml(entry.orderId);
        setEntries((prev) =>
          prev.map((e) =>
            e.orderId === entry.orderId
              ? {
                  ...e,
                  htmlStatus:
                    result.htmlIssues.length === 0 ? "pass" : "fail",
                  pageCount: result.pageCount,
                  htmlIssues: result.htmlIssues,
                  categoryFallbackDetected: result.categoryFallbackDetected,
                }
              : e,
          ),
        );
      }),
    );

    setLastRegeneratedAt(new Date().toISOString());
    setRecheckRunning(false);
    setEntries((snap) => {
      setPatterns(detectPatterns(snap));
      return snap;
    });

    void fetch(`/api/admin/report-qa/recheck-log?key=${adminKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": adminKey,
      },
      body: JSON.stringify({
        batchId: selectedBatchId ?? null,
        total: gen.length,
        htmlPass: 0,
        htmlFail: 0,
        pdfPass: 0,
        pdfFail: 0,
        durationMs: Date.now() - start,
      }),
    }).catch(() => {});
  }

  // ── PDF-only check ───────────────────────────────────────────────────────

  async function runPdfChecks(orderIds: string[]) {
    setPdfRunning(true);
    // Max 2 concurrent PDF generations (Puppeteer is resource-heavy).
    const CONCURRENCY = 2;
    for (let i = 0; i < orderIds.length; i += CONCURRENCY) {
      const batch = orderIds.slice(i, i + CONCURRENCY);
      setEntries((prev) =>
        prev.map((e) =>
          batch.includes(e.orderId) ? { ...e, pdfStatus: "generating" } : e,
        ),
      );
      await Promise.all(
        batch.map(async (orderId) => {
          try {
            const res = await fetch(`/api/report/${orderId}/pdf`);
            setEntries((prev) =>
              prev.map((e) =>
                e.orderId === orderId
                  ? { ...e, pdfStatus: res.ok ? "pass" : "fail" }
                  : e,
              ),
            );
          } catch {
            setEntries((prev) =>
              prev.map((e) =>
                e.orderId === orderId ? { ...e, pdfStatus: "fail" } : e,
              ),
            );
          }
        }),
      );
    }
    setPdfRunning(false);
  }

  async function handlePdfOnly() {
    const generated = entries.filter((e) => e.status === "generated");
    await runPdfChecks(generated.map((e) => e.orderId));
  }

  // ── Review ───────────────────────────────────────────────────────────────

  async function saveReview(
    orderId: string,
    reviewStatus: ReviewStatus,
    adminNotes: string,
  ) {
    setEntries((prev) =>
      prev.map((e) => (e.orderId === orderId ? { ...e, saving: true } : e)),
    );
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-secret": adminKey,
        },
        body: JSON.stringify({ reviewStatus, adminNotes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEntries((prev) =>
        prev.map((e) =>
          e.orderId === orderId
            ? {
                ...e,
                reviewStatus,
                adminNotes: adminNotes || null,
                noteDraft: adminNotes,
                saving: false,
              }
            : e,
        ),
      );
    } catch {
      setEntries((prev) =>
        prev.map((e) => (e.orderId === orderId ? { ...e, saving: false } : e)),
      );
    }
  }

  // ── Export CSV ───────────────────────────────────────────────────────────

  function handleExportCsv() {
    const csv = buildCsv(filteredEntries);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-qa-${selectedBatchId ?? "legacy"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Checklist helpers ────────────────────────────────────────────────────

  function getChecklist(orderId: string): boolean[] {
    return checklists[orderId] ?? loadChecklist(orderId);
  }

  function toggleChecklistItem(orderId: string, idx: number) {
    const current = getChecklist(orderId);
    const next = current.map((v, i) => (i === idx ? !v : v));
    setChecklists((prev) => ({ ...prev, [orderId]: next }));
    saveChecklist(orderId, next);
  }

  // ── Overlay navigation ───────────────────────────────────────────────────

  const generatedEntries = entries.filter((e) => e.status === "generated");

  function openFocused(orderId: string) {
    setFocusedOrderId(orderId);
    if (!checklists[orderId]) {
      setChecklists((prev) => ({
        ...prev,
        [orderId]: loadChecklist(orderId),
      }));
    }
  }

  function navFocused(dir: "prev" | "next") {
    if (!focusedOrderId) return;
    const idx = generatedEntries.findIndex((e) => e.orderId === focusedOrderId);
    const next = dir === "prev" ? idx - 1 : idx + 1;
    if (next >= 0 && next < generatedEntries.length) {
      openFocused(generatedEntries[next].orderId);
    }
  }

  // ── Open all PDFs ────────────────────────────────────────────────────────

  function handleOpenAllPdfs() {
    generatedEntries.forEach((e, i) => {
      setTimeout(() => window.open(e.pdfUrl, "_blank"), i * 150);
    });
  }

  // ── Export QA Summary ────────────────────────────────────────────────────

  function handleExportQaSummary() {
    const lines = [
      "GeoViz Report QA Summary",
      `Batch: ${selectedBatchId ?? "Legacy"}`,
      `Exported: ${new Date().toISOString()}`,
      lastRegeneratedAt ? `Last Re-check: ${lastRegeneratedAt}` : "",
      "",
      "URL,Score,Band,HTML,PDF,Review,Checklist,Issues",
      ...entries.map((e) => {
        const cl = getChecklist(e.orderId);
        const done = cl.filter(Boolean).length;
        return [
          e.url,
          e.score ?? "",
          e.band ?? "",
          e.htmlStatus,
          e.pdfStatus,
          e.reviewStatus,
          `${done}/${CHECKLIST_ITEMS.length}`,
          [...e.validationIssues, ...e.htmlIssues].join("; "),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",");
      }),
      ...(patterns
        ? [
            "",
            "# Pattern Summary",
            `Total issues: ${patterns.totalIssues}`,
            `Category fallbacks: ${patterns.categoryFallbackCount}`,
            `Wrong page count: ${patterns.missingPageCount}`,
            "Top issues:",
            ...patterns.topIssues.map((i) => `  - ${i}`),
          ]
        : []),
    ];
    const blob = new Blob([lines.filter(Boolean).join("\n")], {
      type: "text/plain;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qa-summary-${selectedBatchId ?? "legacy"}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Filtering ────────────────────────────────────────────────────────────

  const filteredEntries = entries.filter((e) => {
    if (filter === "unreviewed") return e.reviewStatus === "pending";
    if (filter === "needs_fix") return e.reviewStatus === "needs_changes";
    if (filter === "failed_html") return e.htmlStatus === "fail";
    if (filter === "failed_pdf") return e.pdfStatus === "fail";
    if (filter === "failed_audit") return e.status === "failed";
    return true;
  });

  // ── KPI counts ───────────────────────────────────────────────────────────

  const generated = entries.filter((e) => e.status === "generated").length;
  const failed = entries.filter((e) => e.status === "failed").length;
  const reviewed = entries.filter((e) => e.reviewStatus === "approved").length;
  const needsFix = entries.filter(
    (e) => e.reviewStatus === "needs_changes",
  ).length;
  const unreviewed = entries.filter(
    (e) => e.reviewStatus === "pending" && e.status === "generated",
  ).length;
  const htmlFail = entries.filter((e) => e.htmlStatus === "fail").length;
  const pdfFail = entries.filter((e) => e.pdfStatus === "fail").length;

  // Extended KPI stats
  const passed = entries.filter(
    (e) =>
      e.reviewStatus === "approved" &&
      e.htmlStatus === "pass" &&
      e.pdfStatus === "pass",
  ).length;
  const dataIssues = entries.filter(
    (e) => e.malformedTextDetected || e.validationIssues.length > 0,
  ).length;
  const templateIssues = entries.filter(
    (e) => e.htmlIssues.length > 0 || e.categoryFallbackDetected,
  ).length;
  const scores = entries
    .filter((e) => e.score !== null)
    .map((e) => e.score!);
  const avgScore =
    scores.length
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : null;
  const highScore = scores.length ? Math.max(...scores) : null;
  const lowScore = scores.length ? Math.min(...scores) : null;
  const readiness = computeReadiness(
    generated,
    reviewed,
    needsFix,
    htmlFail,
    pdfFail,
    failed,
  );

  // ── Focused entry ────────────────────────────────────────────────────────

  const focusedEntry = focusedOrderId
    ? (entries.find((e) => e.orderId === focusedOrderId) ?? null)
    : null;
  const focusedIdx = focusedOrderId
    ? generatedEntries.findIndex((e) => e.orderId === focusedOrderId)
    : -1;

  // ── Render ───────────────────────────────────────────────────────────────

  const batchSelected = selectedBatchId !== undefined;

  return (
    <div className="space-y-6">
      {/* ── Audit Safety ── */}
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
          Audit Safety
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-8">
          <SafetyMetric label="LLM Calls" value="0" />
          <SafetyMetric label="New Audit Orders" value="0" />
          <SafetyMetric label="Worker Jobs" value="0" />
          <span className="self-center text-xs text-white/40">
            All actions re-render from stored{" "}
            <code className="pill bg-white/5 text-[10px]">reportMarkdown</code>{" "}
            only
          </span>
        </div>
      </div>

      {/* ── Batch list ── */}
      {!batchSelected && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="h3">Calibration Batches</h2>
            <button
              onClick={() => void loadBatch(null)}
              className="btn-ghost text-sm"
            >
              Recover Last 25 Completed
            </button>
          </div>

          {batchesLoading && (
            <p className="muted text-sm">Loading batches…</p>
          )}
          {batchesError && (
            <p className="text-sm text-severity-critical">{batchesError}</p>
          )}

          {!batchesLoading && !batchesError && batches.length === 0 && (
            <p className="muted text-sm">
              No calibration batches found. Run a Launch QA batch first.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {batches.map((b) => (
              <button
                key={b.batchId ?? "__legacy__"}
                onClick={() => void loadBatch(b.batchId)}
                className="card card-hover w-full text-left"
              >
                <p className="font-mono text-xs text-white/50 truncate">
                  {b.label}
                </p>
                <p className="mt-1 text-xs text-white/40">
                  {new Date(b.createdAt).toLocaleString()}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Chip label="Total" value={b.total} />
                  <Chip
                    label="Generated"
                    value={b.generated}
                    tone={b.generated === b.total ? "ok" : "warn"}
                  />
                  {b.failed > 0 && (
                    <Chip label="Failed" value={b.failed} tone="err" />
                  )}
                  {b.reviewed > 0 && (
                    <Chip label="Reviewed" value={b.reviewed} tone="ok" />
                  )}
                  {b.needsFix > 0 && (
                    <Chip label="Needs Fix" value={b.needsFix} tone="warn" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Batch detail ── */}
      {batchSelected && (
        <section className="space-y-4">
          {/* Launch Readiness */}
          {entries.length > 0 && (
            <div
              className={`rounded-md border px-4 py-3 text-sm ${
                readiness.level === "ready"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : readiness.level === "minor_issues"
                    ? "border-amber-400/30 bg-amber-400/5"
                    : "border-red-500/30 bg-red-500/5"
              }`}
            >
              <p className="font-semibold">{readiness.label}</p>
              {readiness.reasons.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-3">
                  {readiness.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-white/60">
                      • {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Pattern Summary — appears after a re-check */}
          {patterns && patterns.totalIssues > 0 && (
            <div className="rounded-md border border-white/10 bg-white/[0.02] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Batch Pattern Detection
              </p>
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-white/40">Total issues</p>
                  <p className="mono-data text-white/80">
                    {patterns.totalIssues}
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Category fallbacks</p>
                  <p className="mono-data text-white/80">
                    {patterns.categoryFallbackCount}
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Wrong page count</p>
                  <p className="mono-data text-white/80">
                    {patterns.missingPageCount}
                  </p>
                </div>
                <div>
                  <p className="text-white/40">Outlier scores</p>
                  <p className="mono-data text-white/80">
                    {patterns.outlierLow.length} low /{" "}
                    {patterns.outlierHigh.length} high
                  </p>
                </div>
              </div>
              {patterns.topIssues.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {patterns.topIssues.map((iss, i) => (
                    <span
                      key={i}
                      className="pill bg-severity-warning/10 text-severity-warning text-[10px]"
                    >
                      {iss}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-white/10 bg-white/[0.02] px-4 py-3">
            <button
              onClick={() => setSelectedBatchId(undefined)}
              className="text-sm text-white/50 hover:text-white"
            >
              ← Batches
            </button>
            <span className="text-white/20">|</span>
            <span className="font-mono text-xs text-white/30">
              {selectedBatchId ?? "Legacy batch"}
            </span>
            <span className="text-white/20">|</span>

            <button
              onClick={() => {
                entries
                  .filter((e) => e.status === "generated")
                  .forEach((e, i) => {
                    setTimeout(
                      () => window.open(e.printUrl, "_blank"),
                      i * 150,
                    );
                  });
              }}
              disabled={generated === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Open All HTML ({generated})
            </button>

            <button
              onClick={handleOpenAllPdfs}
              disabled={generated === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Open All PDFs ({generated})
            </button>

            <button
              onClick={() => setShowRegenConfirm("html")}
              disabled={recheckRunning || generated === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Regen HTML
            </button>

            <button
              onClick={() => setShowRecheckConfirm(true)}
              disabled={recheckRunning || generated === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              {recheckRunning ? "Running…" : "Regen Both"}
            </button>

            <button
              onClick={() => void handlePdfOnly()}
              disabled={pdfRunning || generated === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              {pdfRunning ? "Generating…" : "Regenerate PDFs"}
            </button>

            <button
              onClick={handleExportCsv}
              disabled={entries.length === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Export CSV
            </button>

            <button
              onClick={handleExportQaSummary}
              disabled={entries.length === 0}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              Export QA Summary
            </button>
          </div>

          {/* Regen HTML confirmation modal */}
          {showRegenConfirm === "html" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <div className="card w-full max-w-md space-y-4 p-6">
                <h3 className="h3">Confirm HTML Re-render</h3>
                <p className="text-sm text-white/70">
                  Re-fetches HTML for{" "}
                  <span className="font-semibold text-white">{generated}</span>{" "}
                  reports. PDFs are unchanged.
                </p>
                <ul className="space-y-1 text-sm">
                  <SafetyItem label="LLM calls" value="0" ok />
                  <SafetyItem label="New AuditOrder records" value="0" ok />
                  <SafetyItem label="PDF regeneration" value="skipped" ok />
                </ul>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowRegenConfirm(null)}
                    className="btn-ghost text-sm flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleRegenHtml()}
                    className="btn-primary text-sm flex-1"
                  >
                    Confirm HTML Only
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Re-check (both) confirmation modal */}
          {showRecheckConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
              <div className="card w-full max-w-md space-y-4 p-6">
                <h3 className="h3">Confirm Re-check</h3>
                <p className="text-sm text-white/70">
                  Will re-render HTML and regenerate PDFs for{" "}
                  <span className="font-semibold text-white">{generated}</span>{" "}
                  reports.
                </p>
                <ul className="space-y-1 text-sm">
                  <SafetyItem label="LLM calls" value="0" ok />
                  <SafetyItem label="New AuditOrder records" value="0" ok />
                  <SafetyItem
                    label="PDFs"
                    value="regenerated from stored reportMarkdown"
                    ok
                  />
                </ul>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowRecheckConfirm(false)}
                    className="btn-ghost text-sm flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleRecheck()}
                    className="btn-primary text-sm flex-1"
                  >
                    Confirm Re-check
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading / error */}
          {entriesLoading && (
            <p className="muted py-8 text-center text-sm">Loading batch…</p>
          )}
          {entriesError && (
            <p className="py-4 text-sm text-severity-critical">
              {entriesError}
            </p>
          )}

          {!entriesLoading && entries.length > 0 && (
            <>
              {/* KPI row — 11 stats */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11">
                {(
                  [
                    { label: "Total", value: entries.length, tone: "" },
                    {
                      label: "Generated",
                      value: generated,
                      tone:
                        generated === entries.length
                          ? "text-emerald-300"
                          : "text-severity-warning",
                    },
                    {
                      label: "Failed",
                      value: failed,
                      tone:
                        failed > 0
                          ? "text-severity-critical"
                          : "text-white/40",
                    },
                    {
                      label: "Reviewed",
                      value: reviewed,
                      tone:
                        reviewed > 0 ? "text-emerald-300" : "text-white/40",
                    },
                    {
                      label: "Passed",
                      value: passed,
                      tone: passed > 0 ? "text-emerald-300" : "text-white/40",
                    },
                    {
                      label: "Needs Fix",
                      value: needsFix,
                      tone:
                        needsFix > 0
                          ? "text-severity-warning"
                          : "text-white/40",
                    },
                    {
                      label: "Data Issues",
                      value: dataIssues,
                      tone:
                        dataIssues > 0
                          ? "text-severity-warning"
                          : "text-white/40",
                    },
                    {
                      label: "Tmpl Issues",
                      value: templateIssues,
                      tone:
                        templateIssues > 0
                          ? "text-severity-warning"
                          : "text-white/40",
                    },
                    { label: "Avg Score", value: avgScore ?? "—", tone: "" },
                    { label: "High", value: highScore ?? "—", tone: "" },
                    { label: "Low", value: lowScore ?? "—", tone: "" },
                  ] as Array<{ label: string; value: number | string; tone: string }>
                ).map((k) => (
                  <div
                    key={k.label}
                    className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-3"
                  >
                    <p className="text-xs uppercase tracking-wide text-white/40">
                      {k.label}
                    </p>
                    <p
                      className={`mono-data mt-1 text-xl font-semibold ${k.tone}`}
                    >
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Filter chips */}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "All"],
                    ["unreviewed", `Unreviewed (${unreviewed})`],
                    ["needs_fix", `Needs Fix (${needsFix})`],
                    ["failed_html", `Failed HTML (${htmlFail})`],
                    ["failed_pdf", `Failed PDF (${pdfFail})`],
                    ["failed_audit", `Failed Audit (${failed})`],
                  ] as Array<[Filter, string]>
                ).map(([f, label]) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`pill text-xs transition-colors ${
                      filter === f
                        ? "bg-accent/20 text-accent"
                        : "bg-white/5 text-white/50 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Results table */}
              <div className="overflow-x-auto rounded-md border border-white/10">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/10 bg-white/5 text-xs uppercase tracking-wide text-white/50">
                    <tr>
                      <th className="px-3 py-3 text-left">Business / URL</th>
                      <th className="px-3 py-3 text-left">Score</th>
                      <th className="px-3 py-3 text-center">HTML</th>
                      <th className="px-3 py-3 text-center">PDF</th>
                      <th className="px-3 py-3 text-center">Review</th>
                      <th className="px-3 py-3 text-center">Checklist</th>
                      <th className="px-3 py-3 text-left">Issues</th>
                      <th className="px-3 py-3 text-left min-w-[220px]">
                        Note
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredEntries.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-3 py-8 text-center text-sm text-white/40"
                        >
                          No reports match this filter.
                        </td>
                      </tr>
                    )}
                    {filteredEntries.map((e) => (
                      <tr
                        key={e.orderId}
                        className={
                          e.reviewStatus === "needs_changes"
                            ? "bg-severity-warning/5"
                            : e.htmlStatus === "fail" || e.pdfStatus === "fail"
                              ? "bg-severity-critical/5"
                              : ""
                        }
                      >
                        {/* Business / URL */}
                        <td className="px-3 py-3">
                          <div className="max-w-[220px]">
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
                              <span className="block truncate font-mono text-xs text-white/50">
                                {e.url}
                              </span>
                            )}
                            {e.businessName && (
                              <span className="mt-0.5 block truncate text-xs text-white/40">
                                {e.businessName.replace(/^\[CAL\]\s*/, "")}
                              </span>
                            )}
                            <span className="mt-1 block text-[10px] text-white/20">
                              {e.status}
                            </span>
                          </div>
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

                        {/* HTML */}
                        <td className="px-3 py-3 text-center">
                          {htmlBadge(e.htmlStatus, e.pageCount)}
                        </td>

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

                        {/* Review */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center gap-1.5">
                            {reviewBadge(e.reviewStatus)}
                            {e.status === "generated" && (
                              <select
                                value={e.reviewStatus}
                                disabled={e.saving}
                                onChange={(ev) => {
                                  const next = ev.target
                                    .value as ReviewStatus;
                                  void saveReview(
                                    e.orderId,
                                    next,
                                    e.noteDraft,
                                  );
                                }}
                                className="input-field py-0.5 text-[10px] max-w-[100px]"
                              >
                                <option value="pending">Unreviewed</option>
                                <option value="approved">Reviewed ✓</option>
                                <option value="needs_changes">
                                  Needs Fix ✗
                                </option>
                              </select>
                            )}
                            {e.saving && (
                              <span className="text-[10px] text-white/40">
                                saving…
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Checklist */}
                        <td className="px-3 py-3 text-center">
                          {e.status === "generated" ? (
                            (() => {
                              const cl = getChecklist(e.orderId);
                              const done = cl.filter(Boolean).length;
                              const complete =
                                done === CHECKLIST_ITEMS.length;
                              return (
                                <button
                                  onClick={() => openFocused(e.orderId)}
                                  className={`pill cursor-pointer text-[10px] hover:bg-white/10 ${
                                    complete
                                      ? "bg-emerald-500/15 text-emerald-300"
                                      : done > 0
                                        ? "bg-accent/10 text-accent"
                                        : "bg-white/5 text-white/40"
                                  }`}
                                >
                                  {done}/{CHECKLIST_ITEMS.length}
                                  {complete ? " ✓" : ""}
                                </button>
                              );
                            })()
                          ) : (
                            <span className="text-white/20">—</span>
                          )}
                        </td>

                        {/* Issues */}
                        <td className="max-w-[180px] px-3 py-3">
                          {[
                            ...e.validationIssues,
                            ...e.htmlIssues,
                            ...(e.categoryFallbackDetected
                              ? ["category fallback"]
                              : []),
                          ].map((iss, i) => (
                            <p
                              key={i}
                              className="text-xs text-severity-warning"
                            >
                              {iss}
                            </p>
                          ))}
                          {e.error && (
                            <p className="truncate text-xs text-severity-critical">
                              {e.error}
                            </p>
                          )}
                        </td>

                        {/* Note */}
                        <td className="px-3 py-3">
                          <textarea
                            value={e.noteDraft}
                            rows={2}
                            placeholder="Admin note…"
                            disabled={e.saving || e.status !== "generated"}
                            onChange={(ev) => {
                              const draft = ev.target.value;
                              setEntries((prev) =>
                                prev.map((ent) =>
                                  ent.orderId === e.orderId
                                    ? { ...ent, noteDraft: draft }
                                    : ent,
                                ),
                              );
                            }}
                            onBlur={() => {
                              if (e.noteDraft !== (e.adminNotes ?? "")) {
                                void saveReview(
                                  e.orderId,
                                  e.reviewStatus,
                                  e.noteDraft,
                                );
                              }
                            }}
                            className="input-field w-full text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ── Focused report overlay ── */}
      {focusedEntry && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/80 px-4 py-8">
          <div className="card w-full max-w-2xl space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-white/40">
                  {focusedEntry.url}
                </p>
                <p className="mt-1 text-sm text-white/70">
                  {focusedEntry.businessName?.replace(/^\[CAL\]\s*/, "") ?? "—"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {focusedEntry.score !== null && (
                    <span className="mono-data text-lg font-semibold">
                      {focusedEntry.score}
                    </span>
                  )}
                  {focusedEntry.band && (
                    <span className="pill bg-white/5 text-xs">
                      {focusedEntry.band}
                    </span>
                  )}
                  {reviewBadge(focusedEntry.reviewStatus)}
                </div>
              </div>
              <button
                onClick={() => setFocusedOrderId(null)}
                className="shrink-0 text-xl text-white/40 hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Quick links */}
            <div className="flex flex-wrap gap-2 text-xs">
              <a
                href={focusedEntry.printUrl}
                target="_blank"
                rel="noreferrer"
                className="pill bg-white/5 hover:bg-white/10"
              >
                Open HTML ↗
              </a>
              <a
                href={focusedEntry.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="pill bg-white/5 hover:bg-white/10"
              >
                Open PDF ↗
              </a>
              <span className="pill bg-white/5 text-white/30">
                {htmlBadge(focusedEntry.htmlStatus, focusedEntry.pageCount)}
              </span>
              <span className="pill bg-white/5 text-white/30">
                {pdfBadge(focusedEntry.pdfStatus)}
              </span>
            </div>

            {/* Checklist + Notes */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                  Checklist —{" "}
                  {getChecklist(focusedEntry.orderId).filter(Boolean).length}/
                  {CHECKLIST_ITEMS.length}
                </p>
                <ul className="space-y-2">
                  {CHECKLIST_ITEMS.map((item, i) => (
                    <li key={i}>
                      <label className="flex cursor-pointer items-start gap-2 text-xs text-white/70 hover:text-white">
                        <input
                          type="checkbox"
                          checked={
                            getChecklist(focusedEntry.orderId)[i] ?? false
                          }
                          onChange={() =>
                            toggleChecklistItem(focusedEntry.orderId, i)
                          }
                          className="mt-0.5 accent-accent"
                        />
                        {item}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                  Notes
                </p>
                <textarea
                  value={focusedEntry.noteDraft}
                  rows={9}
                  placeholder="Admin note…"
                  disabled={focusedEntry.saving}
                  onChange={(ev) => {
                    const draft = ev.target.value;
                    setEntries((prev) =>
                      prev.map((en) =>
                        en.orderId === focusedEntry.orderId
                          ? { ...en, noteDraft: draft }
                          : en,
                      ),
                    );
                  }}
                  onBlur={() => {
                    if (
                      focusedEntry.noteDraft !==
                      (focusedEntry.adminNotes ?? "")
                    ) {
                      void saveReview(
                        focusedEntry.orderId,
                        focusedEntry.reviewStatus,
                        focusedEntry.noteDraft,
                      );
                    }
                  }}
                  className="input-field w-full text-xs"
                />
                {focusedEntry.saving && (
                  <p className="mt-1 text-[10px] text-white/40">saving…</p>
                )}
              </div>
            </div>

            {/* Quick review actions */}
            <div className="flex gap-2">
              <button
                onClick={() =>
                  void saveReview(
                    focusedEntry.orderId,
                    "approved",
                    focusedEntry.noteDraft,
                  )
                }
                disabled={
                  focusedEntry.saving ||
                  focusedEntry.reviewStatus === "approved"
                }
                className="btn-ghost flex-1 text-sm disabled:opacity-40"
              >
                Mark Pass ✓
              </button>
              <button
                onClick={() =>
                  void saveReview(
                    focusedEntry.orderId,
                    "needs_changes",
                    focusedEntry.noteDraft,
                  )
                }
                disabled={
                  focusedEntry.saving ||
                  focusedEntry.reviewStatus === "needs_changes"
                }
                className="btn-ghost flex-1 text-sm disabled:opacity-40"
              >
                Mark Needs Fix ✗
              </button>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between border-t border-white/10 pt-3">
              <button
                onClick={() => navFocused("prev")}
                disabled={focusedIdx <= 0}
                className="btn-ghost text-sm disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-xs text-white/30">
                {focusedIdx + 1} / {generatedEntries.length}
              </span>
              <button
                onClick={() => navFocused("next")}
                disabled={focusedIdx >= generatedEntries.length - 1}
                className="btn-ghost text-sm disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn" | "err" | "";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-300"
      : tone === "warn"
        ? "text-severity-warning"
        : tone === "err"
          ? "text-severity-critical"
          : "text-white/60";
  return (
    <span className="pill bg-white/5 text-xs">
      {label}:{" "}
      <span className={`font-semibold ${toneClass}`}>{value}</span>
    </span>
  );
}

function SafetyItem({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <li className="flex items-center gap-2 text-xs text-white/70">
      <span className={ok ? "text-emerald-400" : "text-severity-critical"}>
        {ok ? "✓" : "✗"}
      </span>
      <span className="text-white/50">{label}:</span>
      <span>{value}</span>
    </li>
  );
}

function SafetyMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs text-white/40">{label}</p>
      <p className="mono-data text-2xl font-semibold text-emerald-300">
        {value}
      </p>
    </div>
  );
}
