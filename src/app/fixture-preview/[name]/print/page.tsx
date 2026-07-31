/**
 * Dev-only fixture preview print page.
 *
 * Renders a snapshot fixture directly through the full report pipeline
 * (buildReportModel → normalizeReportModel → ReportDocument) without
 * a database lookup. Used for screenshot verification of the template
 * contract. Never reachable in production.
 */
import { notFound } from "next/navigation";
import { buildReportModel } from "@/lib/report/report-model";
import { normalizeReportModel } from "@/lib/report/reportDataNormalizer";
import { ReportDocument } from "@/components/report/ReportDocument";
import "@/components/report/report-document.css";
import "@/app/report/[id]/print/print.css";

import { PERFECT_AUDIT_INPUT } from "@/lib/report/__tests__/snapshots/perfect-audit";
import { AVERAGE_AUDIT_INPUT } from "@/lib/report/__tests__/snapshots/average-audit";
import { BROKEN_CATEGORY_AUDIT_INPUT } from "@/lib/report/__tests__/snapshots/broken-category-audit";
import { FAILED_MODEL_AUDIT_INPUT } from "@/lib/report/__tests__/snapshots/failed-model-audit";
import { MISSING_SCHEMA_AUDIT_INPUT } from "@/lib/report/__tests__/snapshots/missing-schema-audit";
import { MISSING_REVIEWS_AUDIT_INPUT } from "@/lib/report/__tests__/snapshots/missing-reviews-audit";
import { RECOMMENDATION_READINESS_CONTRADICTION_INPUT } from "@/lib/report/__tests__/snapshots/recommendation-readiness-contradiction";

const FIXTURES: Record<string, typeof PERFECT_AUDIT_INPUT> = {
  "perfect-audit": PERFECT_AUDIT_INPUT,
  "average-audit": AVERAGE_AUDIT_INPUT,
  "broken-category-audit": BROKEN_CATEGORY_AUDIT_INPUT,
  "failed-model-audit": FAILED_MODEL_AUDIT_INPUT,
  "missing-schema-audit": MISSING_SCHEMA_AUDIT_INPUT,
  "missing-reviews-audit": MISSING_REVIEWS_AUDIT_INPUT,
  "recommendation-readiness-contradiction": RECOMMENDATION_READINESS_CONTRADICTION_INPUT,
};

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
};

export function generateStaticParams() {
  return Object.keys(FIXTURES).map((name) => ({ name }));
}

export default function FixturePreviewPrintPage({
  params,
}: {
  params: { name: string };
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const input = FIXTURES[params.name];
  if (!input) notFound();

  const rawModel = buildReportModel(input);
  if (!rawModel) notFound();
  const model = normalizeReportModel(rawModel);

  return (
    <div className="report-host rd-host">
      <ReportDocument model={model} />
    </div>
  );
}
