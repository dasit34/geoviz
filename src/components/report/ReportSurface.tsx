import {
  AuditReportContent,
  type AuditReportContext,
} from "@/components/AuditReportContent";
import { ReportDocument } from "@/components/report/ReportDocument";
import { buildReportModelFromRender } from "@/lib/report/report-model";
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
  deterministicScore = null,
  context,
}: {
  orderId: string;
  businessLabel: string;
  websiteUrl: string;
  reportMarkdown: string;
  reportGeneratedAt: Date | null;
  deterministicScore?: unknown;
  context?: AuditReportContext;
}) {
  const model = buildReportModelFromRender({
    orderId,
    businessLabel,
    websiteUrl,
    reportMarkdown,
    reportGeneratedAt,
    deterministicScore,
    context: context
      ? {
          percentileCopy: context.percentileCopy,
          cohortCellValue: context.cohortCellValue,
          confidenceLabel: context.confidenceLabel,
          confidenceReason: context.confidenceReason,
          aiValidations: context.aiValidations,
          nameInconsistency: context.nameInconsistency,
        }
      : null,
  });

  // Use the new fixed-template design whenever the deterministic engine
  // gave us real structured content (buckets/diagnostics/fixes). Legacy
  // markdown-only audits fall back to the previous renderer.
  const hasDeterministicContent =
    !!model &&
    (model.buckets.length > 0 ||
      model.diagnostics.length > 0 ||
      model.fixes.length > 0);

  if (model && hasDeterministicContent) {
    return (
      <div className="report-host bg-ink-950 text-white">
        <div className="container-page py-14 md:py-20">
          <ReportDocument model={model} />
        </div>
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
