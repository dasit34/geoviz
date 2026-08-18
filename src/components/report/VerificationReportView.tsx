import type { AuditComparisonResult, ComparisonClassification } from "@/lib/audit-comparison/types";
import { ReAuditCtaCard } from "@/components/ReAuditCtaCard";

/**
 * Re-Audit / Verification Audit customer view — deliberately concise,
 * not a fork of the 9-page `ReportDocument`. Reuses `report-document`/
 * `print.css` tokens (`.report-section-card`, `.pill`, `.section-eyebrow`)
 * for visual consistency, but its own layout: score header, improved /
 * resolved / still-needs-work lists, AI recommendation change with the
 * model-variability caveat, category/query-consistency notice, cohort
 * position (never a delta). Every number comes from `comparison` —
 * nothing here is hardcoded.
 */
export function VerificationReportView({
  businessLabel,
  websiteUrl,
  comparison,
  currentOrderId,
  previousOrderId,
  reAuditEligible = false,
}: {
  businessLabel: string;
  websiteUrl: string;
  comparison: AuditComparisonResult;
  currentOrderId: string;
  previousOrderId: string;
  /** True only when THIS (current, re-audit) order has cleared review — mirrors the reviewStatus === "approved" gate used on /report/[id]/print. */
  reAuditEligible?: boolean;
}) {
  const { siteTechnical, liveModel, queryConsistency, cohort, availability } = comparison;
  const overall = siteTechnical?.overall;

  return (
    <section className="relative">
      <div className="absolute inset-0 -z-10 bg-radial-orange opacity-60" />
      <div className="container-page py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <span className="pill">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Verification Audit
          </span>
          <h1 className="h1 mt-5">{businessLabel}</h1>
          <p className="muted mt-2 text-sm">{websiteUrl}</p>

          {/* Score header — the literal Previous/Current/Change block. */}
          {overall ? (
            <div className="report-section-card mt-8">
              <div className="grid grid-cols-3 gap-4 text-center">
                <ScoreStat label="Previous Score" value={overall.previous} />
                <ScoreStat label="Current Score" value={overall.current} />
                <ScoreStat
                  label="Change"
                  value={overall.delta}
                  signed
                  tone={toneFor(overall.classification)}
                />
              </div>
            </div>
          ) : (
            <UnavailableNotice text="The prior audit predates deterministic scoring, so an overall score comparison isn't available." />
          )}

          {/* Site / technical — zero model variability. */}
          {siteTechnical ? (
            <>
              <DeltaListSection
                title="Improved"
                entries={[...siteTechnical.dimensions, ...siteTechnical.diagnostics].filter(
                  (d) => d.classification === "IMPROVED",
                )}
              />
              <IssueListSection
                title="Resolved / Partially Resolved"
                entries={[...siteTechnical.issues.resolved, ...siteTechnical.issues.partiallyResolved]}
              />
              <IssueListSection
                title="Still Needs Work"
                entries={siteTechnical.issues.unchanged}
              />
              {siteTechnical.issues.new.length > 0 ? (
                <IssueListSection title="New Since Last Audit" entries={siteTechnical.issues.new} />
              ) : null}
              <DeltaListSection
                title="Declined"
                entries={[...siteTechnical.dimensions, ...siteTechnical.diagnostics].filter(
                  (d) => d.classification === "DECLINED",
                )}
                muted
              />
            </>
          ) : (
            <UnavailableNotice text="Site/technical comparison unavailable — the prior audit has no stored diagnostic data." />
          )}

          {/* Live AI model movement — explicitly separated, with the variability caveat. */}
          <div className="report-section-card mt-6">
            <div className="report-section-card-header">
              <p className="section-eyebrow">AI Recommendation Change</p>
            </div>
            <p className="muted mt-2 text-sm leading-relaxed">
              Your website signals are evaluated deterministically and
              never vary between runs. Live AI model answers below can —
              the same question asked twice can get a different answer
              even with no site changes at all. Treat this section as a
              directional read, not a lab-clean before/after.
            </p>
            {liveModel ? (
              <>
                <p className="mt-4 text-sm text-white/80">
                  <strong>Previous:</strong> {liveModel.recommendedCount.previous} of{" "}
                  {liveModel.recommendedCount.totalProviders} AI systems recommended you.{" "}
                  <strong>Current:</strong> {liveModel.recommendedCount.current} of{" "}
                  {liveModel.recommendedCount.totalProviders}.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-white/50">
                      <tr>
                        <th className="py-1.5 pr-3">Model</th>
                        <th className="py-1.5 pr-3">Mentioned</th>
                        <th className="py-1.5 pr-3">Recommended</th>
                        <th className="py-1.5 pr-3">Understanding</th>
                        <th className="py-1.5">Comparable?</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liveModel.providers.map((p) => (
                        <tr key={p.provider} className="border-t border-white/[0.06]">
                          <td className="py-1.5 pr-3 font-medium">{p.display}</td>
                          <td className="py-1.5 pr-3">
                            {p.comparable
                              ? boolCell(p.mentioned.previous, p.mentioned.current)
                              : "—"}
                          </td>
                          <td className="py-1.5 pr-3">
                            {p.comparable
                              ? boolCell(p.recommended.previous, p.recommended.current)
                              : "—"}
                          </td>
                          <td className="py-1.5 pr-3">
                            {p.comparable
                              ? `${p.understandingScore.previous ?? "—"} → ${p.understandingScore.current ?? "—"}`
                              : "—"}
                          </td>
                          <td className="py-1.5 text-white/60">
                            {p.comparable ? "Yes" : `No${p.notComparableReason ? ` — ${p.notComparableReason}` : ""}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {(liveModel.competitors.newlyAppearing.length > 0 ||
                  liveModel.competitors.noLongerAppearing.length > 0) && (
                  <div className="mt-4 text-sm">
                    {liveModel.competitors.newlyAppearing.length > 0 ? (
                      <p className="text-white/70">
                        <strong>New competitors named:</strong>{" "}
                        {liveModel.competitors.newlyAppearing.join(", ")}
                      </p>
                    ) : null}
                    {liveModel.competitors.noLongerAppearing.length > 0 ? (
                      <p className="mt-1 text-white/70">
                        <strong>No longer named:</strong>{" "}
                        {liveModel.competitors.noLongerAppearing.join(", ")}
                      </p>
                    ) : null}
                  </div>
                )}
              </>
            ) : (
              <p className="muted mt-3 text-sm">
                No AI model data available for one or both audits.
              </p>
            )}
          </div>

          {/* Query / category consistency notice. */}
          {!queryConsistency.categoryConsistent ? (
            <UnavailableNotice text={`Category changed between audits ("${queryConsistency.previousCategory ?? "unknown"}" → "${queryConsistency.currentCategory ?? "unknown"}") — treat the AI recommendation comparison above as directional, not apples-to-apples.`} />
          ) : null}

          {/* Cohort — never a delta. */}
          {cohort.current ? (
            <div className="report-section-card mt-6">
              <div className="report-section-card-header">
                <p className="section-eyebrow">{cohort.current.label}</p>
              </div>
              <p className="mt-2 text-sm text-white/75">{cohort.current.copy}</p>
              {cohort.previous ? (
                <p className="mt-1 text-sm text-white/50">
                  Previous score would rank: {cohort.previous.copy}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-white/40">{cohort.note}</p>
            </div>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={`/report/${currentOrderId}/print`} className="btn-ghost text-sm">
              View Full Current Report
            </a>
            <a href={`/report/${previousOrderId}/print`} className="btn-ghost text-sm">
              View Previous Audit ↗
            </a>
            <a
              href={`/api/report/${currentOrderId}/verification-pdf`}
              className="btn-primary text-sm"
            >
              Download Verification PDF
            </a>
          </div>

          {!availability.siteTechnicalAvailable || !availability.liveModelAvailable ? (
            <p className="mt-6 text-xs text-white/40">
              Some sections above are marked unavailable rather than
              estimated — the prior audit didn't persist that data.
            </p>
          ) : null}

          {reAuditEligible ? (
            <div className="mt-10">
              <ReAuditCtaCard orderId={currentOrderId} />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function ScoreStat({
  label,
  value,
  signed,
  tone,
}: {
  label: string;
  value: number | null;
  signed?: boolean;
  tone?: string;
}) {
  const display =
    value === null ? "—" : signed && value > 0 ? `+${value}` : String(value);
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className={`mt-1 font-mono text-3xl font-semibold ${tone ?? "text-white"}`}>{display}</p>
    </div>
  );
}

function toneFor(c: ComparisonClassification): string {
  if (c === "IMPROVED") return "text-severity-info";
  if (c === "DECLINED") return "text-severity-critical";
  return "text-white/70";
}

function DeltaListSection({
  title,
  entries,
  muted,
}: {
  title: string;
  entries: { label: string; previous: number | null; current: number | null }[];
  muted?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="report-section-card mt-6">
      <div className="report-section-card-header">
        <p className={`section-eyebrow ${muted ? "text-severity-critical" : ""}`}>{title}</p>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {entries.map((e) => (
          <li key={e.label} className="flex justify-between text-white/80">
            <span>{e.label}</span>
            <span className="font-mono text-white/60">
              {e.previous ?? "—"} → {e.current ?? "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IssueListSection({
  title,
  entries,
}: {
  title: string;
  entries: { id: string; message: string }[];
}) {
  if (entries.length === 0) return null;
  return (
    <div className="report-section-card mt-6">
      <div className="report-section-card-header">
        <p className="section-eyebrow">{title}</p>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-4 text-sm text-white/80">
        {entries.map((e) => (
          <li key={e.id}>{e.message}</li>
        ))}
      </ul>
    </div>
  );
}

function UnavailableNotice({ text }: { text: string }) {
  return (
    <div className="mt-6 rounded-md border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/55">
      {text}
    </div>
  );
}

function boolCell(previous: boolean | null, current: boolean | null): string {
  const p = previous === null ? "—" : previous ? "Yes" : "No";
  const c = current === null ? "—" : current ? "Yes" : "No";
  return `${p} → ${c}`;
}
