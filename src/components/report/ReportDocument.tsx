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
      <PlatformsPage model={m} reportId={reportId} />
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

// ── P3 · AI Platform Results ────────────────────────────────────────
function PlatformsPage({ model, reportId }: { model: ReportModel; reportId: string }) {
  const m = model;
  return (
    <Page variant="light">
      <PageHead context="DIRECTLY TESTED AI SYSTEMS" n="03" />
      <h1 className="rd-title">AI Platform Results</h1>
      <p className="rd-sub">
        What each AI model understood, what it missed, and whether it could
        confidently recommend the business.
      </p>

      {/* Always render all four named platforms — directly testing ChatGPT,
          Claude, Gemini, and Perplexity is a core GeoViz proof point. Cards
          without a captured validator response render in an honest
          "Not captured" state (never fabricated). */}
      <div className="rd-prov-grid">
        {m.providers.map((p) => (
          <PlatformCard key={p.provider} provider={p} />
        ))}
      </div>
      {!m.hasProviders ? (
        <p className="rd-note rd-prov-note">
          Live cross-model verdicts were not run for this audit. Each platform is
          shown above with the data captured at audit time.
        </p>
      ) : null}

      <p className="rd-note rd-prov-note">
        Model results measure how clearly each AI system understood and could
        recommend the business. Site diagnostics (page 5) measure the underlying
        website signals that influence those results.
      </p>

      {m.readiness.length > 0 ? <ReadinessStrip readiness={m.readiness} /> : null}
    </Page>
  );
}

function PlatformCard({ provider }: { provider: ReportModelProvider }) {
  const p = provider;
  const unavailable = p.verdict === "UNAVAILABLE";
  const readsAs = [p.businessType, p.location].filter(Boolean).join(" · ");
  return (
    <div className={`rd-prov rd-prov-${p.provider}`}>
      <div className="rd-prov-head">
        <span className="rd-prov-name">
          <ProviderMark provider={p.provider} size={18} />
          {p.display}
        </span>
        <Pill {...verdictPill(p.verdict)} />
      </div>
      {unavailable ? (
        <p className="rd-prov-na">No response captured for this audit.</p>
      ) : p.fetchFailed ? (
        <div className="rd-prov-body">
          <div className="rd-prov-field">
            <span className="rd-prov-k">Understanding</span>
            <span className={`rd-prov-score rd-v-${understandingTone(p.understandingScore)}`}>
              {p.understandingScore === null ? "—" : p.understandingScore}
            </span>
          </div>
          <p className="rd-prov-na">
            {p.display} could not access or render enough content during this test.
          </p>
        </div>
      ) : (
        <div className="rd-prov-body">
          <div className="rd-prov-field">
            <span className="rd-prov-k">Understanding</span>
            <span className={`rd-prov-score rd-v-${understandingTone(p.understandingScore)}`}>
              {p.understandingScore === null ? "—" : p.understandingScore}
            </span>
          </div>
          <div className="rd-prov-field">
            <span className="rd-prov-k">Reads as</span>
            <span className="rd-prov-v">{readsAs || "Recognized as a business"}</span>
          </div>
          <div className="rd-prov-field">
            <span className="rd-prov-k">Main gap</span>
            <span className="rd-prov-v">{p.mainGap ?? "No critical gap flagged"}</span>
          </div>
        </div>
      )}
    </div>
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
      <h1 className="rd-title">Evidence Reviewed</h1>
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
