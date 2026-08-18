import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { prisma } from "@/lib/db";
import { buildAuditComparison } from "@/lib/audit-comparison/buildAuditComparison";
import { LinkReAuditButton } from "@/components/admin/LinkReAuditButton";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Audit Comparison · Admin · GeoViz",
  robots: { index: false, follow: false },
};

const INTELLIGENCE_SELECT = {
  deterministicScore: true,
  aiValidations: true,
  overallScore: true,
  industryCategoryNormalized: true,
  industryTaxonomyVersion: true,
} as const;

/**
 * Admin manual-review view for a Re-Audit / Verification comparison —
 * full detail (every delta, query-consistency detail, raw evidence
 * links) so an operator can review before the customer sees the
 * concise version at `/report/[id]/verification`. Doesn't touch
 * `reviewStatus`/approval — that stays exactly as it is on the
 * existing per-order review flow; this page is additional context.
 */
export default async function AdminAuditComparisonPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { key?: string | string[] };
}) {
  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  const rawKey = searchParams?.key;
  const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  if (!ADMIN_SECRET || key !== ADMIN_SECRET) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <h1 className="h2">Unauthorized</h1>
          <p className="muted mt-3 max-w-xl">
            This page requires an admin key. Append{" "}
            <code className="rounded bg-white/10 px-1.5 py-0.5">?key=…</code>{" "}
            to the URL.
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  const current = await prisma.auditOrder.findUnique({
    where: { id: params.id },
    include: { intelligence: { select: INTELLIGENCE_SELECT } },
  });

  if (!current) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <h1 className="h2">Order not found</h1>
        </section>
        <Footer />
      </main>
    );
  }

  const businessLabel = current.businessName?.trim() || current.websiteUrl;

  if (!current.previousAuditOrderId) {
    return (
      <main>
        <Header />
        <section className="container-page py-12 md:py-16">
          <p className="section-eyebrow">Internal · Audit comparison</p>
          <h1 className="h2 mt-3">{businessLabel}</h1>
          <p className="muted mt-3 max-w-xl">
            This order isn&rsquo;t linked to a previous audit yet.
            Automatic detection runs at checkout — if this business
            genuinely has an earlier completed audit that wasn&rsquo;t
            picked up, link it manually below.
          </p>
          <div className="mt-6">
            <LinkReAuditButton adminKey={key!} orderId={current.id} />
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  const previous = await prisma.auditOrder.findUnique({
    where: { id: current.previousAuditOrderId },
    include: { intelligence: { select: INTELLIGENCE_SELECT } },
  });

  if (!previous?.intelligence || !current.intelligence) {
    return (
      <main>
        <Header />
        <section className="container-page py-24">
          <h1 className="h2">Comparison unavailable</h1>
          <p className="muted mt-3 max-w-xl">
            One or both linked orders are missing intelligence data —
            nothing to compare.
          </p>
        </section>
        <Footer />
      </main>
    );
  }

  const comparison = await buildAuditComparison(
    {
      auditOrderId: previous.id,
      createdAt: previous.createdAt,
      industryCategoryNormalized: previous.intelligence.industryCategoryNormalized,
      industryTaxonomyVersion: previous.intelligence.industryTaxonomyVersion,
      deterministicScore: previous.intelligence.deterministicScore,
      aiValidations: previous.intelligence.aiValidations,
    },
    {
      auditOrderId: current.id,
      createdAt: current.createdAt,
      industryCategoryNormalized: current.intelligence.industryCategoryNormalized,
      industryTaxonomyVersion: current.intelligence.industryTaxonomyVersion,
      deterministicScore: current.intelligence.deterministicScore,
      aiValidations: current.intelligence.aiValidations,
    },
  );

  return (
    <main>
      <Header />
      <section className="container-page py-12 md:py-16">
        <p className="section-eyebrow">Internal · Audit comparison</p>
        <h1 className="h2 mt-3">{businessLabel}</h1>
        <p className="muted mt-2 text-sm">
          Engine {comparison.engineVersion} · Previous{" "}
          {comparison.previousCreatedAt.toISOString().slice(0, 10)} → Current{" "}
          {comparison.currentCreatedAt.toISOString().slice(0, 10)}
        </p>
        <p className="mt-3 text-xs text-white/55">
          <a href={`/admin/trace/${previous.id}?key=${encodeURIComponent(key!)}`} className="text-accent hover:underline">
            Previous audit raw evidence ↗
          </a>
          {" · "}
          <a href={`/admin/trace/${current.id}?key=${encodeURIComponent(key!)}`} className="text-accent hover:underline">
            Current audit raw evidence ↗
          </a>
          {" · "}
          <a
            href={`/report/${current.id}/verification?key=${encodeURIComponent(key!)}`}
            className="text-accent hover:underline"
          >
            Preview customer view ↗
          </a>
        </p>

        {/* Query consistency — surfaced prominently for manual review. */}
        <div className="card mt-6">
          <p className="text-sm font-semibold text-white/85">Query Consistency</p>
          <p className="mt-1 text-sm text-white/70">
            Category: {comparison.queryConsistency.previousCategory ?? "—"} →{" "}
            {comparison.queryConsistency.currentCategory ?? "—"}{" "}
            {comparison.queryConsistency.categoryConsistent ? (
              <span className="text-severity-info">(consistent)</span>
            ) : (
              <span className="text-severity-critical">(CHANGED)</span>
            )}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-white/60">
            {Object.entries(comparison.queryConsistency.perProviderQueryMatch).map(
              ([provider, match]) => (
                <li key={provider}>
                  {provider}:{" "}
                  {match === null ? "unknown" : match ? "same query" : "QUERY CHANGED"}
                </li>
              ),
            )}
          </ul>
        </div>

        {/* Score overview. */}
        {comparison.siteTechnical ? (
          <div className="card mt-6">
            <p className="text-sm font-semibold text-white/85">Overall Score</p>
            <p className="mt-1 font-mono text-xl text-white">
              {comparison.siteTechnical.overall.previous} →{" "}
              {comparison.siteTechnical.overall.current} (
              {comparison.siteTechnical.overall.delta !== null && comparison.siteTechnical.overall.delta > 0 ? "+" : ""}
              {comparison.siteTechnical.overall.delta}) — {comparison.siteTechnical.overall.classification}
            </p>

            <p className="mt-4 text-xs uppercase tracking-wide text-white/40">Dimensions</p>
            <DeltaTable entries={comparison.siteTechnical.dimensions} />

            <p className="mt-4 text-xs uppercase tracking-wide text-white/40">Diagnostics</p>
            <DeltaTable entries={comparison.siteTechnical.diagnostics} />

            <p className="mt-4 text-xs uppercase tracking-wide text-white/40">Readiness</p>
            <DeltaTable entries={comparison.siteTechnical.readiness} />

            <p className="mt-4 text-xs uppercase tracking-wide text-white/40">Issues</p>
            <ul className="mt-2 space-y-1 text-sm text-white/70">
              <li>Resolved: {comparison.siteTechnical.issues.resolved.length}</li>
              <li>Partially resolved: {comparison.siteTechnical.issues.partiallyResolved.length}</li>
              <li>Unchanged (still open): {comparison.siteTechnical.issues.unchanged.length}</li>
              <li>New: {comparison.siteTechnical.issues.new.length}</li>
            </ul>
          </div>
        ) : (
          <p className="muted mt-6">
            Site/technical comparison unavailable — missing deterministic score data.
          </p>
        )}

        {/* Model-level. */}
        {comparison.liveModel ? (
          <div className="card mt-6 overflow-x-auto">
            <p className="text-sm font-semibold text-white/85">Model-Level Comparison</p>
            <table className="mt-3 w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-white/50">
                <tr>
                  <th className="py-1.5 pr-3">Model</th>
                  <th className="py-1.5 pr-3">Comparable</th>
                  <th className="py-1.5 pr-3">Mentioned</th>
                  <th className="py-1.5 pr-3">Recommended</th>
                  <th className="py-1.5 pr-3">Understanding</th>
                  <th className="py-1.5 pr-3">Citations</th>
                  <th className="py-1.5">Top Entity</th>
                </tr>
              </thead>
              <tbody>
                {comparison.liveModel.providers.map((p) => (
                  <tr key={p.provider} className="border-t border-white/[0.06]">
                    <td className="py-1.5 pr-3 font-medium">{p.display}</td>
                    <td className="py-1.5 pr-3">
                      {p.comparable ? "Yes" : `No${p.notComparableReason ? ` (${p.notComparableReason})` : ""}`}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.mentioned.previous === null ? "—" : String(p.mentioned.previous)} →{" "}
                      {p.mentioned.current === null ? "—" : String(p.mentioned.current)}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.recommended.previous === null ? "—" : String(p.recommended.previous)} →{" "}
                      {p.recommended.current === null ? "—" : String(p.recommended.current)}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.understandingScore.previous ?? "—"} → {p.understandingScore.current ?? "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.citationCount.previous ?? "—"} → {p.citationCount.current ?? "—"}
                    </td>
                    <td className="py-1.5 text-white/60">{p.current?.topEntityNamed ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-white/70">
              Recommended: {comparison.liveModel.recommendedCount.previous} →{" "}
              {comparison.liveModel.recommendedCount.current} of{" "}
              {comparison.liveModel.recommendedCount.totalProviders}
            </p>
            {comparison.liveModel.competitors.newlyAppearing.length > 0 ? (
              <p className="mt-2 text-sm text-white/70">
                New competitors: {comparison.liveModel.competitors.newlyAppearing.join(", ")}
              </p>
            ) : null}
            {comparison.liveModel.competitors.noLongerAppearing.length > 0 ? (
              <p className="mt-1 text-sm text-white/70">
                No longer appearing: {comparison.liveModel.competitors.noLongerAppearing.join(", ")}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="muted mt-6">No AI validator data available for one or both audits.</p>
        )}

        {/* Cohort. */}
        <div className="card mt-6">
          <p className="text-sm font-semibold text-white/85">Cohort Context</p>
          <p className="mt-1 text-sm text-white/70">
            Previous: {comparison.cohort.previous?.copy ?? "unavailable"}
          </p>
          <p className="mt-1 text-sm text-white/70">
            Current: {comparison.cohort.current?.copy ?? "unavailable"}
          </p>
          <p className="mt-2 text-xs text-white/40">{comparison.cohort.note}</p>
        </div>
      </section>
      <Footer />
    </main>
  );
}

function DeltaTable({
  entries,
}: {
  entries: { key: string; label: string; previous: number | null; current: number | null; delta: number | null; classification: string }[];
}) {
  return (
    <table className="mt-2 w-full text-left text-sm">
      <tbody>
        {entries.map((e) => (
          <tr key={e.key} className="border-t border-white/[0.06]">
            <td className="py-1 pr-3 text-white/70">{e.label}</td>
            <td className="py-1 pr-3 font-mono text-white/60">
              {e.previous ?? "—"} → {e.current ?? "—"}
            </td>
            <td className="py-1 text-xs text-white/50">{e.classification}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
