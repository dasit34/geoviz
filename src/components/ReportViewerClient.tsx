"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  parseReportScoreBreakdown,
  splitReportLayout,
} from "@/lib/parse-report";
import { ReportScoreCard } from "./ReportScoreCard";
import { ReportCtaCard } from "./ReportCtaCard";

/**
 * Admin-facing report preview. Shares the same styled blocks as the
 * customer-facing print page (ReportScoreCard, ReportCtaCard) so the
 * dashboard preview matches what the customer sees in their email
 * link and PDF. Toggle to raw markdown when triaging audit output.
 */
export function ReportViewerClient({
  markdown,
  orderId,
  businessLabel,
}: {
  markdown: string;
  orderId?: string;
  businessLabel?: string;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const score = parseReportScoreBreakdown(markdown);
  const layout = splitReportLayout(markdown);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <p className="text-xs uppercase tracking-[0.2em] text-white/50">
          {showRaw ? "Raw markdown" : "Rendered report"} ·{" "}
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
        <pre className="max-h-[700px] overflow-auto rounded-xl border border-white/10 bg-ink-900/80 p-6 text-xs leading-relaxed text-white/80 whitespace-pre-wrap">
{markdown}
        </pre>
      ) : (
        <div className="report-rendered">
          <ReportScoreCard score={score} />
          <article className="report-prose">
            <ReactMarkdown>{layout.before}</ReactMarkdown>
          </article>
          {layout.hasCta ? (
            <ReportCtaCard
              orderId={orderId ?? "preview"}
              businessLabel={businessLabel ?? "your business"}
            />
          ) : null}
          {layout.after.trim() ? (
            <article className="report-prose">
              <ReactMarkdown>{layout.after}</ReactMarkdown>
            </article>
          ) : null}
        </div>
      )}
    </div>
  );
}
