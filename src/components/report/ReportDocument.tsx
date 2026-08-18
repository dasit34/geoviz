import type {
  ReportModel,
  ReportModelBucket,
  ReportModelCategory,
  ReportModelProvider,
  ReportModelEvidence,
  ReportModelDiagnostic,
  ReportModelFix,
  ReadinessFactor,
  EvidenceStatus,
  DiagnosticConfidence,
  Tone,
} from "@/lib/report/report-model";
import type { IssueSeverity } from "@/lib/scoring/types";
import { swapTechnicalTerms } from "@/lib/parse-report";
import { ReportCtaCard } from "@/components/ReportCtaCard";
import { ReAuditCtaCard } from "@/components/ReAuditCtaCard";
import { ProviderMark } from "@/components/report/BrandMarks";
import { GeoVizMark } from "@/components/brand/GeoVizMark";

/**
 * ReportDocument — the single production report template, rebuilt to the
 * approved Figma spec (`public/references/geoviz-report-template.pdf`).
 *
 * 8 pages: dark-navy Cover (P1) + CTA (P8); light interior (P2–P7).
 * Premium, spacious, customer-facing. Consumes ONE deterministic
 * `ReportModel` — no scoring/data logic here, pure presentation. Same
 * component drives admin preview and the PDF (parity by construction).
 */
export function ReportDocument({ model }: { model: ReportModel }) {
  const m = model;
  const reportId = m.meta.reportId;
  const hasReadiness = m.readiness.length > 0;

  // Ordered manifest of every physical page this template renders. The
  // "n" badge in each header is derived from this array's position, not
  // hand-maintained per component — inserting, removing, or (as with
  // "readiness" below) conditionally skipping a page automatically
  // renumbers every page after it, instead of requiring a manual sweep
  // of hardcoded literals across every Page* component.
  type PageId =
    | "cover"
    | "briefing"
    | "cross-model"
    | "evidence"
    | "diagnostics"
    | "readiness"
    | "issues"
    | "fixes"
    | "action";
  const pageIds: PageId[] = [
    "cover",
    "briefing",
    "cross-model",
    "evidence",
    "diagnostics",
    ...(hasReadiness ? (["readiness"] as const) : []),
    "issues",
    "fixes",
    "action",
  ];
  const n = (id: PageId): string =>
    String(pageIds.indexOf(id) + 1).padStart(2, "0");

  return (
    <article className="rd">
      <CoverPage model={m} n={n("cover")} />
      <ExecutivePage model={m} reportId={reportId} n={n("briefing")} />
      <AIIntelligencePage model={m} reportId={reportId} n={n("cross-model")} />
      <EvidencePage model={m} reportId={reportId} n={n("evidence")} />
      <DiagnosticsPage model={m} reportId={reportId} n={n("diagnostics")} />
      {hasReadiness ? (
        <ReadinessPage model={m} reportId={reportId} n={n("readiness")} />
      ) : null}
      <IssuesPage model={m} reportId={reportId} n={n("issues")} />
      <FixesPage model={m} reportId={reportId} n={n("fixes")} />
      <ActionPage model={m} reportId={reportId} n={n("action")} />
    </article>
  );
}

// ── Shared chrome ───────────────────────────────────────────────────
function Logo({ dark, strap }: { dark?: boolean; strap?: boolean }) {
  return (
    <span className={`rd-logo${dark ? " rd-logo-dark" : ""}`}>
      <span className="rd-logo-tile">
        <GeoVizMark size={22} className="rd-logo-mark" />
      </span>
      <span className="rd-logo-text">
        <span className="rd-logo-word">
          GeoViz<span className="rd-logo-ai">.ai</span>
        </span>
        {strap ? <span className="rd-logo-strap">AI VISIBILITY</span> : null}
      </span>
    </span>
  );
}

/** Header band for the light interior pages. */
function PageHead({ context, n }: { context: string; n: string }) {
  return (
    <header className="rd-head">
      <Logo strap />
      <span className="rd-head-context">{context}</span>
      <span className="rd-head-num">{n}</span>
    </header>
  );
}

function Page({
  variant,
  children,
}: {
  variant: "dark" | "light";
  children: React.ReactNode;
}) {
  return <section className={`rd-page rd-page-${variant}`}>{children}</section>;
}

// ── P1 · Cover ──────────────────────────────────────────────────────
function CoverPage({ model, n }: { model: ReportModel; n: string }) {
  const m = model;
  const overall = typeof m.score.overall === "number" ? m.score.overall : null;
  const gap =
    m.diagnostics[0]?.title ??
    m.executive.weakestSignal ??
    "Identity and trust signals need strengthening for AI recommendation.";
  return (
    <Page variant="dark">
      <header className="rd-head rd-head-cover">
        <Logo dark />
        <span className="rd-head-num">{n}</span>
      </header>

      <p className="rd-cover-eyebrow">AI VISIBILITY INTELLIGENCE REPORT</p>

      <div className="rd-cover-panel">
        <h2 className="rd-cover-biz">{m.meta.businessName}</h2>
        {m.meta.nameAlternates.length > 0 ? (
          <p className="rd-cover-alt">
            Also referenced as <span>{m.meta.nameAlternates.join(", ")}</span>
          </p>
        ) : null}
        <p className="rd-cover-url">{prettyUrl(m.meta.website)}</p>
        <div className="rd-cover-scorerow">
          <span className="rd-score">
            <span className={`rd-score-num rd-v-${m.score.tone}`}>
              {overall === null ? "—" : overall}
            </span>
            <span className="rd-score-max"> / 100</span>
          </span>
          <span className={`rd-band-pill rd-band-${m.score.tone}`}>
            {m.score.band}
          </span>
        </div>
        <p className="rd-cover-percentile">
          {swapTechnicalTerms(m.score.percentileCopy ?? bandContextLine(m.score.band))}
        </p>
        {m.buckets.length > 0 ? (
          <div className="rd-buckets">
            {m.buckets.map((b) => (
              <BucketCell key={b.key} bucket={b} />
            ))}
          </div>
        ) : null}
      </div>

      <p className="rd-cover-gap">
        <span className="rd-cover-gap-label">Primary gap:</span> {gap}
      </p>

      <dl className="rd-cover-foot">
        <CoverFootCell k="Generated" v={fmtDate(m.meta.generatedAt)} />
        <CoverFootCell k="Report ID" v={m.meta.reportId} />
        <CoverFootCell
          k="Review status"
          v={m.meta.reviewed ? "Human Reviewed" : "Automated Audit"}
        />
      </dl>
    </Page>
  );
}

function BucketCell({ bucket }: { bucket: ReportModelBucket }) {
  const b = bucket;
  return (
    <div className="rd-bucket">
      <span className="rd-bucket-k">{b.label}</span>
      <span className={`rd-bucket-v rd-v-${b.tone}`}>{b.pct}%</span>
    </div>
  );
}

function CoverFootCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rd-cover-foot-cell">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

// ── P2 · Executive Summary ──────────────────────────────────────────
function ExecutivePage({
  model,
  reportId,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  const cm = m.crossModel;
  const overall = typeof m.score.overall === "number" ? String(m.score.overall) : "—";
  const conf = m.score.confidenceLabel
    ? m.score.confidenceLabel.replace(/^Audit completeness:\s*/i, "")
    : "—";
  const issue = m.diagnostics[0];
  const hasBullets = m.executive.summaryBullets.length > 0;
  const BASELINE_SIGNALS = ["crawl access", "content extraction"];
  const isBaseline = BASELINE_SIGNALS.some((s) =>
    m.executive.strongestLabel.toLowerCase().includes(s),
  );
  return (
    <Page variant="light">
      <PageHead context="BRIEFING" n={n} />
      <h1 className="rd-title">Executive Summary</h1>
      <p className="rd-sub">
        The bottom line — what AI systems currently understand about{" "}
        {m.meta.businessName}.
      </p>

      <div className="rd-stat-row">
        {m.hasProviders ? (
          <Stat
            accent="amber"
            k="Live AI Recommendations"
            v={`${cm.recommendedCount} of 4`}
            note={cm.recommendedCopy}
          />
        ) : (
          <Stat accent="amber" k="Overall" v={overall} note={m.score.band} />
        )}
        <Stat
          accent="blue"
          k="Data coverage"
          v={conf}
          note={m.meta.reviewed ? "Human reviewed" : "Audit complete"}
        />
        <Stat
          accent="green"
          k="Strongest signal"
          v={m.executive.strongestLabel}
          note={isBaseline ? "Baseline — not a differentiator" : "Highest-scoring area"}
        />
      </div>

      {hasBullets ? (
        <>
          <p className="rd-exec-label">INTELLIGENCE SUMMARY</p>
          <ul className="rd-exec-list">
            {m.executive.summaryBullets.map((bullet, i) => (
              <li key={i} className="rd-exec-item">
                <span className="rd-exec-dot" />
                <span className="rd-exec-text">{bullet}</span>
              </li>
            ))}
          </ul>
          {m.executive.weakestSignal ? (
            <div className="rd-exec-gap">
              <span className="rd-exec-gap-label">WIDEST GAP</span>
              {m.executive.weakestSignal}
            </div>
          ) : null}
        </>
      ) : null}

      {issue ? (
        <Callout kind="issue" label="Top issue" title={issue.title} body={issue.whyItHurts} />
      ) : null}
    </Page>
  );
}

function Stat({
  accent,
  k,
  v,
  note,
}: {
  accent: "amber" | "blue" | "green";
  k: string;
  v: string;
  note: string;
}) {
  return (
    <div className={`rd-stat rd-stat-${accent}`}>
      <span className="rd-stat-k">{k}</span>
      <span className="rd-stat-v">{v}</span>
      <span className="rd-stat-note">{note}</span>
    </div>
  );
}

/** Join display names into readable prose: ["A"]→"A", ["A","B"]→"A and B",
 *  ["A","B","C"]→"A, B, and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function Callout({
  kind,
  label,
  title,
  body,
}: {
  kind: "issue" | "fix";
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rd-callout">
      <span className={`rd-callout-pill rd-callout-pill-${kind}`}>{label}</span>
      <h3 className="rd-callout-title">{title}</h3>
      <p className="rd-callout-body">{body}</p>
    </div>
  );
}

// ── P3 · AI Intelligence ────────────────────────────────────────────
function AIIntelligencePage({
  model,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  const cm = m.crossModel;
  return (
    <Page variant="light">
      <PageHead context="CROSS-MODEL AI INTELLIGENCE" n={n} />
      <h1 className="rd-title">AI Intelligence</h1>
      <p className="rd-sub rd-cm-sub">
        How ChatGPT, Claude, Gemini, and Perplexity answered when a customer
        asked who to choose — what they understood, who they recommended, who
        they named instead, and the sources they trusted.
      </p>
      <p className="rd-note rd-ai-legend">
        Three distinct signals, not one: <strong>understood</strong> means the
        model correctly identifies what this business is and does;{" "}
        <strong>mentioned</strong> means it named this business at all when
        answering; <strong>recommended</strong> means it would actually
        suggest this business to a customer today. A business can be
        understood and mentioned without ever being recommended.
      </p>

      {!m.hasProviders ? (
        <p className="rd-note rd-prov-note">
          AI models were not tested for this audit. This section populates once a
          cross-model check has run.
        </p>
      ) : (
        <>
          <div className="rd-stat-row">
            <Stat
              accent="blue"
              k="Consensus"
              v={cm.consensusLabel ?? `${cm.recognizedCount}/4 understood`}
              note={
                cm.consensusAgreement
                  ? `${cm.consensusAgreement} agreement across models`
                  : "across the four tested models"
              }
            />
            <Stat
              accent="amber"
              k="Mentioned"
              v={`${cm.mentionedCount} of 4`}
              note="named your business in their answer"
            />
            <Stat
              accent={cm.recommendedCount === 0 ? "amber" : cm.recommendedCount >= 3 ? "green" : "blue"}
              k="Recommended"
              v={`${cm.recommendedCount} of 4`}
              note={
                cm.recommendedCount === 0
                  ? "no AI would suggest you to a customer"
                  : "would suggest it to a customer today"
              }
            />
          </div>

          {cm.recommendedCount === 0 && cm.mentionedCount > 0 ? (
            <Callout
              kind="issue"
              label="KEY FINDING"
              title={`AI systems know who ${m.meta.businessName} is — but none of them recommend you.`}
              body={`${cm.mentionedCount} of 4 AI models named your business when asked. Zero of 4 would recommend you to a customer today. Being found is not the same as being chosen — and the gap between those two is what this report addresses.`}
            />
          ) : null}

          <table className="rd-matrix">
            <thead>
              <tr>
                <th>Model</th>
                <th>Verdict</th>
                <th>Understands</th>
                <th>Rec. Confidence</th>
                <th>Names you</th>
                <th>Top entity named</th>
                <th>Sources</th>
              </tr>
            </thead>
            <tbody>
              {m.providers.map((p) => (
                <ModelMatrixRow
                  key={p.provider}
                  provider={p}
                  businessName={m.meta.businessName}
                />
              ))}
            </tbody>
          </table>

          {cm.topCitedDomains.length > 0 ? (
            <div className="rd-sources">
              <span className="rd-sources-label">SOURCES AI RELIED ON</span>
              <div className="rd-chips">
                {cm.topCitedDomains.slice(0, 4).map((d) => (
                  <span key={d} className="rd-chip">{d}</span>
                ))}
              </div>
            </div>
          ) : null}

          {cm.entityNameVariants && cm.entityNameVariants.length >= 2 ? (
            <Callout
              kind="issue"
              label="ENTITY NAME CONSISTENCY"
              title={`AI recognized this business in ${cm.mentionedCount} of 4 answers, but used inconsistent name variants.`}
              body={`Models referred to the business as ${joinNames(cm.entityNameVariants)}. AI can identify the business, but the entity name should be standardized so AI systems recognize one consistent brand.${
                cm.recommendedCount < cm.mentionedCount
                  ? " AI systems recognized the business, but did not confidently recommend it."
                  : ""
              }`}
            />
          ) : cm.topCompetitor || (cm.competitorsTied && cm.competitorsTied.length > 0) ? (
            <Callout
              kind="issue"
              label="COMPETITIVE DISPLACEMENT"
              title={
                cm.topCompetitor
                  ? `${cm.topCompetitor.name} appears in ${cm.topCompetitor.count} of 4 AI answers`
                  : cm.competitorsTied!.length === 2
                    ? `${cm.competitorsTied![0]} and ${cm.competitorsTied![1]} appeared most often across the AI answers`
                    : "Competitors were named across the AI answers"
              }
              body={`Your business is named in ${cm.mentionedCount} of 4. When customers ask AI who to choose, the businesses AI names — not just the ones that rank — win the introduction.`}
            />
          ) : null}

          {cm.recommendedCount === 0 && cm.mainSkipReason ? (
            <Callout
              kind="issue"
              label="WHY AI DIDN'T RECOMMEND YOU"
              title={cm.mainSkipReason}
              body="This is the primary signal holding back a recommendation across all four AI systems tested. The fixes on pages 6 and 7 address this directly."
            />
          ) : cm.bottleneckDimension && cm.strongestDimension ? (
            <p className="rd-note rd-prov-note">
              Across models, your {cm.strongestDimension.label} reads clearly, but{" "}
              {cm.bottleneckDimension.label} is the weakest shared signal — and
              it&rsquo;s what holds back a confident recommendation.
            </p>
          ) : (
            <p className="rd-note rd-prov-note">
              These results reflect a single point-in-time test. AI answers shift
              as your business signals — and the web around you — change.
            </p>
          )}
        </>
      )}
    </Page>
  );
}

function ModelMatrixRow({
  provider,
  businessName,
}: {
  provider: ReportModelProvider;
  businessName: string;
}) {
  const p = provider;
  if (p.verdict === "UNAVAILABLE") {
    return (
      <tr className="rd-matrix-unavail">
        <td className="rd-matrix-model">
          <ProviderMark provider={p.provider} size={15} />
          {p.display}
        </td>
        <td colSpan={6} className="rd-matrix-na">
          Unavailable for this audit.
        </td>
      </tr>
    );
  }
  const conf = p.recommendationReadiness;
  const confTone =
    conf === "high" ? "ok" : conf === "medium" ? "warn" : conf === "low" ? "bad" : "muted";
  const vp = verdictPill(p.verdict);
  return (
    <tr>
      <td className="rd-matrix-model">
        <ProviderMark provider={p.provider} size={15} />
        {p.display}
      </td>
      <td>
        <span className={`rd-pill rd-pill-${vp.tone}`}>{vp.label}</span>
      </td>
      <td className={`rd-matrix-num rd-v-${understandingTone(p.understandingScore)}`}>
        {p.understandingScore ?? "—"}
      </td>
      <td className={`rd-v-${confTone}`}>{conf ? conf.toUpperCase() : "—"}</td>
      <td className={`rd-v-${p.mentioned ? "ok" : "muted"}`}>
        {p.mentioned ? "Yes" : "No"}
      </td>
      <td className="rd-matrix-comp">
        {p.mentioned ? businessName : (p.competitors[0] ?? "—")}
      </td>
      <td className="rd-matrix-num">{p.citationDomains.length || "—"}</td>
    </tr>
  );
}

// ── P4 · Evidence Reviewed ──────────────────────────────────────────
function EvidencePage({
  model,
  reportId,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="AUDIT EVIDENCE" n={n} />

      {m.customerQuestions.length > 0 ? (
        <>
          <h1 className="rd-title">Customer Questions Tested</h1>
          <p className="rd-sub">
            The buyer-intent questions we tested across AI systems for{" "}
            {m.meta.businessName}.
          </p>
          <ul className="rd-questions-list">
            {m.customerQuestions.slice(0, 5).map((q) => (
              <li key={q} className="rd-questions-item">
                {q}
              </li>
            ))}
          </ul>
          <p className="rd-questions-foot">
            These questions test whether AI systems can identify, understand,
            trust, and recommend the business in real buying situations.
          </p>
          <div className="rd-page-divider" />
        </>
      ) : null}

      <p className="rd-title-sub">EVIDENCE REVIEWED · WHAT AI HAD TO READ</p>
      <h2 className="rd-ev-title">Signal Inventory</h2>
      <p className="rd-sub">
        {m.hasEvidence
          ? "The signals GeoViz inspected on your site before scoring — this is what makes the audit defensible."
          : "This audit predates the structured-input inventory. New audits capture the signals inspected before scoring."}
      </p>
      <div className="rd-ev">
        {m.evidence.map((e) => (
          <EvidenceRow key={e.label} row={e} />
        ))}
      </div>
    </Page>
  );
}

function EvidenceRow({ row }: { row: ReportModelEvidence }) {
  return (
    <div className="rd-ev-row">
      <div className="rd-ev-text">
        <span className="rd-ev-label">{row.label}</span>
        <span className="rd-ev-desc">{row.descriptor}</span>
      </div>
      <Pill {...evidencePill(row.status)} />
    </div>
  );
}

// ── P5 · Visibility Diagnostics ─────────────────────────────────────
// Deliberately holds only the six-category bar list + score-interpretation
// card. The composite readiness factors used to live here too (as
// <ReadinessGrid>), but that block is ~200px of genuinely unavoidable
// content (see ReadinessPage below) that pushed this page's total well
// past one printable A4 area regardless of spacing — it now gets its
// own page instead of being crammed in. See "readiness" in the pageIds
// manifest in ReportDocument() for how the page numbering adjusts.
function DiagnosticsPage({
  model,
  reportId,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="WHERE THE SCORE COMES FROM" n={n} />
      <h1 className="rd-title">Visibility Diagnostics</h1>
      <p className="rd-sub">
        The six signals AI systems use to decide whether to identify and
        recommend your business. These diagnostic scores measure the
        strength of individual website signals — they are not direct AI
        recommendation scores.
      </p>
      <div className="rd-bars">
        {m.categories.map((c) => (
          <Bar key={c.key} category={c} />
        ))}
      </div>
      <p className="rd-note rd-bars-note">
        Crawl Access and Content Extraction show that AI systems can reach and
        parse the site. They do not mean the business is verified, trusted, or
        likely to be recommended.
      </p>
      <div className="rd-interp">
        <h3 className="rd-interp-title">Score interpretation</h3>
        <p className="rd-interp-body">{m.scoreInterpretation}</p>
        {m.scoreNote ? (
          <p className="rd-interp-note">{m.scoreNote}</p>
        ) : null}
      </div>
    </Page>
  );
}

// ── P6 · Recommendation Readiness ───────────────────────────────────
// Split out of DiagnosticsPage (see comment above). Only rendered when
// m.readiness has entries — see the hasReadiness check in
// ReportDocument(), which also removes this id from the page-number
// manifest so numbering never skips a value when it's absent.
function ReadinessPage({
  model,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="RECOMMENDATION READINESS" n={n} />
      <h1 className="rd-title">AI Recommendation Readiness</h1>
      <p className="rd-sub">
        Composite signals estimating whether AI systems have enough verified
        structure and trust evidence to surface and recommend this business.
      </p>
      {m.recommendationReadiness ? (
        <div className="rd-bar">
          <div className="rd-bar-top">
            <div className="rd-bar-label-col">
              <span className="rd-bar-label">AI Recommendation Readiness</span>
            </div>
            <span className={`rd-bar-val rd-v-${m.recommendationReadiness.tone}`}>
              {m.recommendationReadiness.score}
            </span>
          </div>
          <div className="rd-bar-track">
            <div
              className={`rd-bar-fill rd-fill-${m.recommendationReadiness.tone}`}
              style={{
                width: `${Math.max(0, Math.min(100, Math.round(m.recommendationReadiness.score)))}%`,
              }}
            />
          </div>
        </div>
      ) : null}
      <p className="rd-note">
        This score measures whether your website has the identity, trust, and
        content signals AI systems typically need. It is separate from how
        many tested AI models currently recommend your business.
      </p>
      <p className="rd-note">
        Recommendation Readiness estimates how prepared your website is to
        earn AI recommendations. It is not the same as the number of AI
        models that currently recommend your business.
      </p>
      <ReadinessGrid readiness={m.readiness} />
    </Page>
  );
}

function Bar({ category }: { category: ReportModelCategory }) {
  const pct = category.score ?? 0;
  return (
    <div className="rd-bar">
      <div className="rd-bar-top">
        <div className="rd-bar-label-col">
          <div className="rd-bar-label-row">
            <span className="rd-bar-label">{category.label}</span>
            {category.weight ? (
              <span className="rd-bar-weight">[{category.weight}%]</span>
            ) : null}
          </div>
          {category.tooltip ? (
            <p className="rd-bar-tip">{category.tooltip}</p>
          ) : null}
        </div>
        <span className={`rd-bar-val rd-v-${category.tone}`}>
          {category.score === null ? "—" : category.score}
        </span>
      </div>
      <div className="rd-bar-track">
        <div
          className={`rd-bar-fill rd-fill-${category.tone}`}
          style={{ width: `${Math.max(0, Math.min(100, Math.round(pct)))}%` }}
        />
      </div>
    </div>
  );
}

function ReadinessGrid({ readiness }: { readiness: ReadinessFactor[] }) {
  const items = readiness.slice(0, 4);
  return (
    <div className="rd-readiness-grid">
      {items.map((r) => (
        <div key={r.key} className="rd-readiness-card">
          <span className="rd-readiness-card-k">{r.label}</span>
          <span className={`rd-readiness-card-v rd-v-${r.tone}`}>
            {r.score ?? "—"}
          </span>
          {r.basis ? (
            <span className="rd-readiness-card-basis">{r.basis}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

// ── P6 · Top Issues ─────────────────────────────────────────────────
function IssuesPage({
  model,
  reportId,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="CRITICAL VISIBILITY GAPS" n={n} />
      <h1 className="rd-title">Top Issues</h1>
      <p className="rd-sub">
        The few issues that most directly affect whether AI systems recommend
        this business.
      </p>
      <div className="rd-issues rd-issues-v2">
        {m.diagnostics.map((d) => (
          <IssueCard key={d.rank} diag={d} />
        ))}
      </div>
    </Page>
  );
}

function IssueCard({ diag }: { diag: ReportModelDiagnostic }) {
  const d = diag;
  const sevTone = severityTone(d.severity);
  return (
    <div className="rd-issue rd-issue-v2">
      <div className="rd-issue-head">
        <span className={`rd-issue-rank rd-v-${sevTone}`}>#{d.rank}</span>
        <span className="rd-issue-title">{swapTechnicalTerms(d.title)}</span>
        <Pill {...severityPill(d.severity)} />
        <Pill {...confidencePill(d.confidence)} />
      </div>
      {d.problem ? (
        <div className="rd-issue-problem">
          <span className="rd-issue-problem-k">WHAT WAS FOUND</span>
          <p className="rd-issue-problem-v">{d.problem}</p>
        </div>
      ) : null}
      <div>
        <span className="rd-issue-impact-k">WHY IT MATTERS</span>
        <p className="rd-issue-impact-v">{d.whyItHurts}</p>
      </div>
    </div>
  );
}

// ── P7 · Priority Fix Plan ──────────────────────────────────────────
function FixesPage({
  model,
  reportId,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="WHAT TO FIX FIRST" n={n} />
      <h1 className="rd-title">Priority Fix Plan</h1>
      <p className="rd-sub">
        Each fix connects directly to business impact and the GeoViz Foundation
        Fix.
      </p>
      <div className="rd-fixes rd-fixes-v2">
        {m.fixes.map((f) => (
          <FixCard key={f.rank} fix={f} />
        ))}
      </div>
      <div className="rd-impl">
        <span className="rd-impl-title">Implementation path</span>
        <span className="rd-impl-body">
          All {m.fixes.length} fixes above are addressed as a single Foundation
          Fix engagement — one scope, done in 3–5 business days. When complete,
          AI systems can confirm who {m.meta.businessName} is, where you operate,
          and why to recommend you.
        </span>
      </div>
    </Page>
  );
}

function FixCard({ fix }: { fix: ReportModelFix }) {
  const f = fix;
  return (
    <div className="rd-fix">
      <span className="rd-fix-num">{String(f.rank).padStart(2, "0")}</span>
      <div className="rd-fix-body">
        <h3 className="rd-fix-title">{swapTechnicalTerms(f.issue)}</h3>
        <span className="rd-fix-exact-label">Exact fix</span>
        <p className="rd-fix-action">{f.action}</p>
        <div className="rd-fix-meta">
          {f.impact === "high" && (
            <span className="rd-fix-pill rd-fix-pill-high">HIGH IMPACT</span>
          )}
          {f.impact === "medium" && (
            <span className="rd-fix-pill rd-fix-pill-medium">MEDIUM IMPACT</span>
          )}
          {f.impact === "low" && (
            <span className="rd-fix-pill rd-fix-pill-low">LOW IMPACT</span>
          )}
          {f.difficulty === "Easy" && (
            <span className="rd-fix-pill rd-fix-pill-easy">EASY</span>
          )}
          {f.difficulty === "Moderate" && (
            <span className="rd-fix-pill rd-fix-pill-moderate">MODERATE</span>
          )}
          {f.difficulty === "Technical" && (
            <span className="rd-fix-pill rd-fix-pill-technical">TECHNICAL</span>
          )}
          {f.foundationFix && (
            <span className="rd-fix-pill rd-fix-pill-foundation">
              ■ Foundation Fix
            </span>
          )}
        </div>
        {f.unlocks.length > 0 ? (
          <div className="rd-fix-unlocks">
            <span className="rd-fix-unlocks-k">UNLOCKS</span>
            <div className="rd-chips">
              {f.unlocks.slice(0, 3).map((u) => (
                <span key={u} className="rd-chip">{u}</span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── P8 · Strategic Action Plan + Foundation Fix CTA ─────────────────
function ActionPage({
  model,
  n,
}: {
  model: ReportModel;
  reportId: string;
  n: string;
}) {
  const m = model;
  return (
    <Page variant="dark">
      <header className="rd-head rd-head-cover">
        <Logo dark />
        <span className="rd-head-num">{n}</span>
      </header>
      <p className="rd-cta-eyebrow">Foundation Fix</p>
      <h1 className="rd-action-title">Strategic Action Plan</h1>

      {m.score.percentileCopy ? (
        <p className="rd-action-percentile">{swapTechnicalTerms(m.score.percentileCopy)}</p>
      ) : null}

      <div className="rd-outcome-card">
        <span className="rd-outcome-label">Projected outcome</span>
        <p className="rd-outcome-body">{m.businessImpact}</p>
        {(m.score.band === "Needs Work" || m.score.band === "At Risk") ? (
          <p className="rd-outcome-note">
            Businesses that resolve these foundational issues generally
            improve their AI visibility and recommendation readiness. Actual
            results depend on competition, industry, website quality, and
            external AI signals.
          </p>
        ) : null}
      </div>

      <div className="rd-next-steps">
        <p className="rd-next-steps-label">What Happens Next</p>
        <ol className="rd-next-steps-list">
          <li className="rd-next-steps-item">
            <span className="rd-next-steps-num">1</span>Review your audit findings.
          </li>
          <li className="rd-next-steps-item">
            <span className="rd-next-steps-num">2</span>Approve your Foundation Fix.
          </li>
          <li className="rd-next-steps-item">
            <span className="rd-next-steps-num">3</span>GeoViz implements the recommended improvements.
          </li>
          <li className="rd-next-steps-item">
            <span className="rd-next-steps-num">4</span>Receive a verification audit.
          </li>
          <li className="rd-next-steps-item">
            <span className="rd-next-steps-num">5</span>Track your AI visibility improvements over time.
          </li>
        </ol>
      </div>

      <ReportCtaCard orderId={m.meta.orderId} businessLabel={m.meta.businessName} fixCount={m.fixes.length} />

      {m.meta.reviewed ? <ReAuditCtaCard orderId={m.meta.orderId} /> : null}
    </Page>
  );
}

// ── Pills ───────────────────────────────────────────────────────────
function Pill({ label, tone }: { label: string; tone: Tone }) {
  return <span className={`rd-pill rd-pill-${tone}`}>{label}</span>;
}

function verdictPill(v: ReportModelProvider["verdict"]): { label: string; tone: Tone } {
  if (v === "YES") return { label: "YES", tone: "ok" };
  if (v === "PARTIAL") return { label: "PARTIAL", tone: "warn" };
  if (v === "NO") return { label: "NO", tone: "bad" };
  return { label: "UNAVAILABLE", tone: "muted" };
}

function evidencePill(s: EvidenceStatus): { label: string; tone: Tone } {
  if (s === "pass") return { label: "PASS", tone: "ok" };
  if (s === "warn") return { label: "WARN", tone: "warn" };
  if (s === "fail") return { label: "FAIL", tone: "bad" };
  if (s === "unconfirmed") return { label: "NOT CONFIRMED", tone: "muted" };
  // "na" = signal not included in this audit scope
  return { label: "NOT TESTED", tone: "muted" };
}

function confidencePill(c: DiagnosticConfidence): { label: string; tone: Tone } {
  // Confidence describes how much evidence backs this finding — never the
  // score itself. Muted/neutral tones on purpose: this is a trust signal,
  // not a severity signal, and must not visually compete with the
  // severity pill it sits next to.
  if (c === "high") return { label: "HIGH CONFIDENCE", tone: "ok" };
  if (c === "medium") return { label: "MEDIUM CONFIDENCE", tone: "muted" };
  return { label: "LOW CONFIDENCE", tone: "muted" };
}

function severityPill(s: IssueSeverity): { label: string; tone: Tone } {
  if (s === "critical") return { label: "CRITICAL", tone: "bad" };
  if (s === "warning") return { label: "HIGH", tone: "warn" };
  return { label: "ADVISORY", tone: "muted" };
}

// ── Helpers ─────────────────────────────────────────────────────────
function severityTone(s: IssueSeverity): Tone {
  return s === "critical" ? "bad" : s === "warning" ? "warn" : "muted";
}

function understandingTone(score: number | null): Tone {
  if (score === null) return "muted";
  return score >= 70 ? "ok" : score >= 40 ? "warn" : "bad";
}

function bandContextLine(band: string): string {
  if (band === "Invisible") return "AI systems cannot find or identify your business.";
  if (band === "At Risk") return "AI systems struggle to verify who your business is.";
  if (band === "Needs Work") return "AI systems find you, but are not recommending you to customers.";
  if (band === "Competitive") return "AI systems are beginning to recommend your business.";
  if (band === "AI-Ready") return "AI systems confidently recognize and recommend your business.";
  return "AI systems find you, but are not recommending you to customers.";
}

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
