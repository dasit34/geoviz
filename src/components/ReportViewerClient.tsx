"use client";

import { useState } from "react";
import { type AuditReportContext } from "@/components/AuditReportContent";
import { ReportSurface } from "@/components/report/ReportSurface";
import "@/app/report/[id]/print/print.css";

/**
 * Admin-facing report preview shell.
 *
 * Phase D — was a parallel re-implementation of the report (its own
 * score card + strengths + issue list) that omitted the cover,
 * four-model grid, consensus, confidence pills, and identity
 * inconsistency. The operator couldn't see what the customer saw.
 *
 * Now: thin client wrapper that owns the show-raw / show-rendered
 * toggle and renders `<ReportSurface />` directly so the admin
 * preview is byte-for-byte the customer report. Same component tree,
 * same `context` payload, same render output.
 *
 * Keeps the file name and call signature so `AdminReportCard.tsx`
 * still imports `ReportViewerClient`. Removable once any other
 * call sites are migrated.
 */
export function ReportViewerClient({
  markdown,
  orderId,
  businessLabel,
  nameInconsistency = null,
  websiteUrl,
  reportGeneratedAt = null,
  deterministicScore = null,
  reportContext = null,
}: {
  markdown: string;
  orderId?: string;
  businessLabel?: string;
  /** Phase B3 — surfaced on the cover when sources disagree. */
  nameInconsistency?: {
    primary: string;
    alternates: string[];
  } | null;
  /** Required by ReportSurface for the cover meta strip + link. */
  websiteUrl?: string;
  reportGeneratedAt?: Date | null;
  /** When present, drives the canonical-resolver read path. Falls back
   *  to legacy markdown parsing when null (pre-`scoring@1.0.0` rows). */
  deterministicScore?: unknown;
  /** Phase D — full context payload built server-side from the same
   *  `buildReportContext()` helper the PDF route uses. Drives
   *  percentile, confidence, four-model grid, consensus, preflight. */
  reportContext?: unknown;
}) {
  const [showRaw, setShowRaw] = useState(false);

  // Merge the server-built context with the cover identity payload so
  // the operator preview surfaces the same inconsistency pill the
  // customer PDF cover renders.
  const ctxBase = (reportContext ?? undefined) as
    | AuditReportContext
    | undefined;
  const ctxWithIdentity: AuditReportContext | undefined =
    ctxBase
      ? { ...ctxBase, nameInconsistency }
      : nameInconsistency
        ? ({ nameInconsistency } as AuditReportContext)
        : undefined;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">
          {showRaw ? "Raw markdown" : "Rendered report (customer view)"} ·{" "}
          {markdown.length.toLocaleString()} chars
        </p>
        <button
          type="button"
          onClick={() => setShowRaw((v) => !v)}
          className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/80 hover:border-accent/40 hover:text-accent"
        >
          {showRaw ? "Show rendered" : "Show raw markdown"}
        </button>
      </div>

      {showRaw ? (
        <pre className="max-h-[700px] overflow-auto rounded-lg border border-white/10 bg-ink-900/80 p-6 text-xs leading-relaxed text-white/80 whitespace-pre-wrap">
{markdown}
        </pre>
      ) : (
        // -mx-6 -my-6 cancels the parent card padding so the report
        // renders edge-to-edge with the cover bleeding to the card
        // border — matches the PDF page rhythm.
        <div className="-mx-6 -my-6 md:-mx-8 md:-my-8 rounded-lg overflow-hidden">
          <ReportSurface
            orderId={orderId ?? "preview"}
            businessLabel={businessLabel ?? "your business"}
            websiteUrl={websiteUrl ?? ""}
            reportMarkdown={markdown}
            reportGeneratedAt={reportGeneratedAt}
            deterministicScore={deterministicScore}
            context={ctxWithIdentity}
          />
        </div>
      )}
    </div>
  );
}
