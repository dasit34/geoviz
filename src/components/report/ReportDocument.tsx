import type {
  ReportModel,
  ReportModelCategory,
  ReportModelProvider,
  ReportModelEvidence,
  ReportModelDiagnostic,
  ReportModelFix,
  ReadinessFactor,
  EvidenceStatus,
  Tone,
} from "@/lib/report/report-model";
import type { IssueSeverity } from "@/lib/scoring/types";
import { ReportCtaCard } from "@/components/ReportCtaCard";
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
  return (
    <article className="rd">
      <CoverPage model={m} />
      <ExecutivePage model={m} reportId={reportId} />
      <AIIntelligencePage model={m} reportId={reportId} />
      <EvidencePage model={m} reportId={reportId} />
      <DiagnosticsPage model={m} reportId={reportId} />
      <IssuesPage model={m} reportId={reportId} />
      <FixesPage model={m} reportId={reportId} />
      <ActionPage model={m} reportId={reportId} />
    </article>
  );
}

// ── Shared chrome ───────────────────────────────────────────────────
function Logo({ dark, strap }: { dark?: boolean; strap?: boolean }) {
  // The real constellation mark (light ring + orange signal) is designed for
  // dark surfaces, so on light pages it sits inside a navy tile (matching the
  // brand favicon) to stay legible. Never a text/placeholder approximation.
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
function CoverPage({ model }: { model: ReportModel }) {
  const m = model;
  const overall = typeof m.score.overall === "number" ? m.score.overall : null;
  // Use the customer-facing issue TITLE, never the raw evidence string
  // (diagnostics[0].problem can fall back to a deterministic reason like
  // "Detected 2 JSON-LD block(s)", which is evidence, not a gap).
  const gap =
    m.diagnostics[0]?.title ??
    m.executive.weakestSignal ??
    "Identity and trust signals need strengthening for AI recommendation.";
  return (
    <Page variant="dark">
      <header className="rd-head rd-head-cover">
        <Logo dark />
        <span className="rd-head-num">01</span>
      </header>

      <div className="rd-cover-hero">
        <p className="rd-cover-eyebrow">AI Visibility Intelligence Report</p>
        <h1 className="rd-cover-title">
          AI Visibility
          <br />
          Intelligence Report
        </h1>
        <p className="rd-cover-sub">
          How clearly AI search tools can understand, trust, and recommend this
          business.
        </p>
      </div>

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

function CoverFootCell({ k, v }: { k: string; v: string }) {
  return (
    <div className="rd-cover-foot-cell">
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

// ── P2 · Executive Summary ──────────────────────────────────────────
function ExecutivePage({ model, reportId }: { model: ReportModel; reportId: string }) {
  const m = model;
  const overall = typeof m.score.overall === "number" ? String(m.score.overall) : "—";
  const conf = m.score.confidenceLabel
    ? m.score.confidenceLabel.replace(/^Audit completeness:\s*/i, "")
    : "—";
  const issue = m.diagnostics[0];
  const fix = m.fixes[0];
  return (
    <Page variant="light">
      <PageHead context="BRIEFING" n="02" />
      <h1 className="rd-title">Executive Summary</h1>
      <p className="rd-sub">
        What AI systems understand about {m.meta.businessName} today — in plain
        business language, before the diagnostics.
      </p>

      <div className="rd-stat-row">
        <Stat accent="amber" k="Overall" v={overall} note={m.score.band} />
        <Stat
          accent="blue"
          k="Audit confidence"
          v={conf}
          note={m.meta.reviewed ? "Human reviewed" : "Automated audit"}
        />
        <Stat
          accent="green"
          k="Strongest signal"
          v={m.executive.strongestLabel}
          note="Highest-scoring area"
        />
      </div>

      {issue ? (
        <Callout kind="issue" label="Top issue" title={issue.title} body={issue.whyItHurts} />
      ) : null}
      {fix ? (
        <Callout kind="fix" label="First fix" title={fix.title} body={fix.businessImpact} />
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

// ── P3 · AI Intelligence (consolidated model results + cross-model insight) ──
function AIIntelligencePage({ model }: { model: ReportModel; reportId: string }) {
  const m = model;
  const cm = m.crossModel;
  return (
    <Page variant="light">
      <PageHead context="CROSS-MODEL AI INTELLIGENCE" n="03" />
      <h1 className="rd-title">AI Intelligence</h1>
      <p className="rd-sub">
        How ChatGPT, Claude, Gemini, and Perplexity answered when a customer
        asked who to choose — what they understood, who they recommended, who
        they named instead, and the sources they trusted.
      </p>

      {!m.hasProviders ? (
        <p className="rd-note rd-prov-note">
          AI models were not tested for this audit. This section populates once a
          cross-model check has run.
        </p>
      ) : (
        <>
          {/* Consensus headline band */}
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
              accent="green"
              k="Recommended"
              v={`${cm.recommendedCount} of 4`}
              note="would suggest it to a customer today"
            />
          </div>

          {/* One dense model matrix (replaces two card grids) */}
          <table className="rd-matrix">
            <thead>
              <tr>
                <th>Model</th>
                <th>Verdict</th>
                <th>Understands</th>
                <th>Confidence</th>
                <th>Names you</th>
                <th>Top entity named</th>
                <th>Sources</th>
              </tr>
            </thead>
            <tbody>
              {m.providers.map((p) => (
                <ModelMatrixRow key={p.provider} provider={p} />
              ))}
            </tbody>
          </table>

          {/* Entity Name Consistency — the audited business was recognized under
              multiple name spellings (not real competitors). Takes priority over
              the competitive-displacement card so same-business variants are never
              framed as competition. */}
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

          {/* Bottleneck conclusion → bridge to the fix */}
          {cm.bottleneckDimension && cm.strongestDimension ? (
            <p className="rd-note rd-prov-note">
              Across models, your {cm.strongestDimension.label} reads clearly, but{" "}
              {cm.bottleneckDimension.label} is the weakest shared signal — and
              it&rsquo;s what holds back a confident recommendation.
              {cm.topCitedDomains.length > 0
                ? ` Sources AI leaned on: ${cm.topCitedDomains.slice(0, 4).join(", ")}.`
                : ""}
            </p>
          ) : cm.mainSkipReason ? (
            <p className="rd-note rd-prov-note">
              Main reason AI held back: {cm.mainSkipReason}.
              {cm.topCitedDomains.length > 0
                ? ` Sources AI leaned on: ${cm.topCitedDomains.slice(0, 4).join(", ")}.`
                : ""}
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

function ModelMatrixRow({ provider }: { provider: ReportModelProvider }) {
  const p = provider;
  if (p.verdict === "UNAVAILABLE") {
    return (
      <tr className="rd-matrix-unavail">
        <td className="rd-matrix-model">
          <ProviderMark provider={p.provider} size={15} />
          {p.display}
        </td>
        <td colSpan={6} className="rd-matrix-na">
          No response captured for this audit.
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
      <td className="rd-matrix-comp">{p.competitors[0] ?? "—"}</td>
      <td className="rd-matrix-num">{p.citationDomains.length || "—"}</td>
    </tr>
  );
}

function ReadinessStrip({ readiness }: { readiness: ReadinessFactor[] }) {
  const items = readiness.slice(0, 4);
  return (
    <div className="rd-readiness-strip">
      <span className="rd-readiness-strip-title">AI Search Readiness</span>
      <div className="rd-readiness-strip-items">
        {items.map((r) => (
          <span key={r.key} className="rd-readiness-item">
            {readinessShort(r.label)}:{" "}
            <strong className={`rd-v-${r.tone}`}>{r.score ?? "—"}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── P4 · Evidence Reviewed ──────────────────────────────────────────
function EvidencePage({ model, reportId }: { model: ReportModel; reportId: string }) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="WHAT AI HAD TO READ" n="04" />

      {m.customerQuestions.length > 0 ? (
        <section className="rd-questions">
          <h2 className="rd-questions-title">Customer Questions Tested</h2>
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
        </section>
      ) : null}

      <h1 className="rd-title">Evidence Reviewed</h1>
      <p className="rd-title-sub">What AI Had To Read</p>
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
function DiagnosticsPage({ model, reportId }: { model: ReportModel; reportId: string }) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="WHERE THE SCORE COMES FROM" n="05" />
      <h1 className="rd-title">Visibility Diagnostics</h1>
      <p className="rd-sub">
        The six signals behind the score — readable in under a minute, no
        dashboard required.
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
      {m.readiness.length > 0 ? <ReadinessStrip readiness={m.readiness} /> : null}
    </Page>
  );
}

function Bar({ category }: { category: ReportModelCategory }) {
  const pct = category.score ?? 0;
  return (
    <div className="rd-bar">
      <div className="rd-bar-top">
        <span className="rd-bar-label">{category.label}</span>
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

// ── P6 · Top Issues ─────────────────────────────────────────────────
function IssuesPage({ model, reportId }: { model: ReportModel; reportId: string }) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="CRITICAL VISIBILITY GAPS" n="06" />
      <h1 className="rd-title">Top Issues</h1>
      <p className="rd-sub">
        The few issues that most directly affect whether AI systems recommend
        this business.
      </p>
      <div className="rd-issues">
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
    <div className="rd-issue">
      <div className="rd-issue-head">
        <span className={`rd-issue-rank rd-v-${sevTone}`}>#{d.rank}</span>
        <span className="rd-issue-title">{d.title}</span>
        <Pill {...severityPill(d.severity)} />
      </div>
      <p className="rd-issue-body">{d.whyItHurts}</p>
    </div>
  );
}

// ── P7 · Priority Fix Plan ──────────────────────────────────────────
function FixesPage({ model, reportId }: { model: ReportModel; reportId: string }) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="WHAT TO FIX FIRST" n="07" />
      <h1 className="rd-title">Priority Fix Plan</h1>
      <p className="rd-sub">
        Each fix connects directly to business impact and the GeoViz Foundation
        Fix.
      </p>
      <div className="rd-fixes">
        {m.fixes.map((f) => (
          <FixCard key={f.rank} fix={f} />
        ))}
      </div>
      <div className="rd-impl">
        <span className="rd-impl-title">Implementation path</span>
        <span className="rd-impl-body">
          Foundation Fix eligible · Estimated 3–5 business days · Designed to
          improve AI verification and citation readiness.
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
        <h3 className="rd-fix-title">{f.issue}</h3>
        <span className="rd-fix-exact-label">Exact fix</span>
        <p className="rd-fix-action">{f.action}</p>
      </div>
    </div>
  );
}

// ── P8 · Strategic Action Plan + Foundation Fix CTA ─────────────────
function ActionPage({ model, reportId }: { model: ReportModel; reportId: string }) {
  const m = model;
  return (
    <Page variant="dark">
      <header className="rd-head rd-head-cover">
        <Logo dark />
        <span className="rd-head-num">08</span>
      </header>
      <p className="rd-cta-eyebrow">Foundation Fix</p>
      <h1 className="rd-action-title">Strategic Action Plan</h1>

      <div className="rd-outcome-card">
        <span className="rd-outcome-label">Projected outcome</span>
        <p className="rd-outcome-body">{m.businessImpact}</p>
      </div>

      <ReportCtaCard orderId={m.meta.orderId} businessLabel={m.meta.businessName} />
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
  return { label: "NOT ANALYZED", tone: "muted" };
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

function readinessShort(label: string): string {
  // Readiness-factor labels are now authored as the exact text to display
  // (e.g. "Google AI Overviews Readiness", "Structured Identity", "Trust
  // Evidence") so customers don't confuse them with the Page-5 site
  // diagnostics. Show them verbatim; the strip wraps if needed.
  return label.trim();
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
