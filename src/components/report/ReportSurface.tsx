import {
  AuditReportContent,
  type AuditReportContext,
} from "@/components/AuditReportContent";
import { ReportDocument } from "@/components/report/ReportDocument";
import { ReportFailedState } from "@/components/report/ReportFailedState";
import { buildReportModelFromRender } from "@/lib/report/report-model";
import { normalizeReportModel } from "@/lib/report/reportDataNormalizer";
import "@/components/report/report-document.css";

/**
 * ReportSurface — the single entry point every report surface (PDF
 * print page, admin preview, public sample) renders. Drop-in
 * replacement for `<AuditReportContent />` with the SAME props.
 *
 * Builds the deterministic `ReportModel` and renders the new fixed-
 * template `ReportDocument` (technical-intelligence design). For legacy
 * audits that predate the deterministic scoring engine — where there's
 * no `deterministicScore` to drive buckets/diagnostics/fixes — it
 * fail-softs to the previous `AuditReportContent` markdown renderer so
 * old reports still render.
 *
 * One renderer + one model → admin preview and PDF are identical by
 * construction.
 */
export function ReportSurface({
  orderId,
  businessLabel,
  websiteUrl,
  reportMarkdown,
  reportGeneratedAt,
  reviewed = false,
  deterministicScore = null,
  context,
}: {
  orderId: string;
  businessLabel: string;
  websiteUrl: string;
  reportMarkdown: string;
  reportGeneratedAt: Date | null;
  /** True only when an operator approved this report (reviewStatus === "approved"). */
  reviewed?: boolean;
  deterministicScore?: unknown;
  context?: AuditReportContext;
}) {
  // Building/normalizing the report model is deterministic but not
  // provably total — a sufficiently malformed report (edge case the
  // parser doesn't already null-out gracefully) can throw deep inside
  // this call. Never let that propagate into an unbranded framework
  // 500: log full diagnostic detail server-side for operator review,
  // and render the same safe ReportFailedState the "failed" audit
  // status already uses.
  let rawModel: ReturnType<typeof buildReportModelFromRender>;
  let model: ReturnType<typeof normalizeReportModel> | null;
  try {
    rawModel = buildReportModelFromRender({
      orderId,
      businessLabel,
      websiteUrl,
      reportMarkdown,
      reportGeneratedAt,
      reviewed,
      deterministicScore,
      context: context
        ? {
            percentileCopy: context.percentileCopy,
            cohortCellValue: context.cohortCellValue,
            confidenceLabel: context.confidenceLabel,
            confidenceReason: context.confidenceReason,
            aiValidations: context.aiValidations,
            nameInconsistency: context.nameInconsistency,
            preflightSignals: context.preflightSignals,
            industryNormalized: context.industryNormalized,
          }
        : null,
    });
    model = rawModel ? normalizeReportModel(rawModel) : null;
  } catch (err) {
    console.error("[report-render] failed to build/normalize report model", {
      orderId,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return <ReportFailedState orderId={orderId} />;
  }

  // Use the new fixed-template design whenever the deterministic engine
  // gave us real structured content (buckets/diagnostics/fixes). Legacy
  // markdown-only audits fall back to the previous renderer.
  const hasDeterministicContent =
    !!model &&
    (model.buckets.length > 0 ||
      model.diagnostics.length > 0 ||
      model.fixes.length > 0);

  if (model && hasDeterministicContent) {
    // The report template paints its own per-page light/dark surfaces; the
    // host is a neutral mat so the pages read as sheets on screen.
    return (
      <div className="report-host rd-host">
        <ReportDocument model={model} />
      </div>
    );
  }

  return (
    <AuditReportContent
      orderId={orderId}
      businessLabel={businessLabel}
      websiteUrl={websiteUrl}
      reportMarkdown={reportMarkdown}
      reportGeneratedAt={reportGeneratedAt}
      deterministicScore={deterministicScore}
      context={context}
    />
  );
}
