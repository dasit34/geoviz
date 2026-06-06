import type {
  ReportModel,
  ReportModelBucket,
  ReportModelCategory,
  ReportModelProvider,
  Tone,
} from "@/lib/report/report-model";
import { RadarChart } from "@/components/RadarChart";
import { ReportCtaCard } from "@/components/ReportCtaCard";
import {
  GeoVizMark,
  ProviderMark,
  ScoreGauge,
} from "@/components/report/BrandMarks";
import type { ReadinessFactor } from "@/lib/report/report-model";

/**
 * ReportDocument — the single fixed-template renderer for the GeoViz
 * AI Visibility Intelligence Report.
 *
 * Consumes ONE deterministic `ReportModel` and renders a FIXED section
 * order with FIXED headings, in the technical-intelligence visual
 * system (all-sans + mono data, dense grid, premium GeoViz branding).
 * Iteration 2: stronger brand presence (terrain background + large
 * wordmark + per-section GeoViz chips + branded footer), card-based
 * scannable layout (scorecard tiles, insight panel, score gauge),
 * premium per-platform cards with logos + comparison strip.
 *
 * Pure presentation. Same component for admin preview, PDF, and sample.
 */
export function ReportDocument({ model }: { model: ReportModel }) {
  const m = model;
  return (
    <article className={`rd rd-tone-${m.score.tone}`}>
      <Cover model={m} />

      <Section n="01" title="Executive Summary" label="Briefing" reportId={m.meta.reportId}>
        <Executive model={m} />
      </Section>

      <Section
        n="02"
        title="Directly Tested AI Platforms"
        label="Directly tested across four AI models"
        reportId={m.meta.reportId}
      >
        {m.buckets.length > 0 ? <BucketRow buckets={m.buckets} /> : null}
        {m.hasProviders ? (
          <>
            <p className="rd-subhead">
              Per-platform analysis · ChatGPT · Claude · Gemini · Perplexity
            </p>
            <div className="rd-platform-grid">
              {m.providers.map((p) => (
                <PlatformCard key={p.provider} provider={p} />
              ))}
            </div>
            <ComparisonStrip providers={m.providers} />
          </>
        ) : (
          <p className="rd-muted-note">
            Cross-model verdicts unavailable for this audit.
          </p>
        )}
      </Section>

      {m.readiness.length > 0 ? (
        <Section
          n="03"
          title="AI Search & Visibility Readiness"
          label="Readiness for AI-powered search surfaces"
          reportId={m.meta.reportId}
        >
          <p className="rd-readiness-note">
            Derived readiness signals — <strong>not</strong> a direct model
            score. These estimate how prepared your business is for
            AI-powered search experiences, including Google AI Overviews.
          </p>
          <div className="rd-readiness-grid">
            {m.readiness.map((r) => (
              <ReadinessCard key={r.key} factor={r} />
            ))}
          </div>
        </Section>
      ) : null}

      <Section
        n="04"
        title="Visibility Diagnostics"
        label="Where the score comes from"
        reportId={m.meta.reportId}
      >
        <div className="rd-cat-block">
          <div className="rd-cat-list">
            {m.categories.map((c) => (
              <CategoryRow key={c.key} category={c} />
            ))}
          </div>
          <div className="rd-radar">
            <p className="rd-figure-label">Score distribution</p>
            <RadarChart
              categories={m.categories.map((c) => ({
                key: c.key,
                label: c.label,
                short: c.label,
                tooltip: c.tooltip,
                max: 100,
                score: c.score,
              }))}
            />
          </div>
        </div>
        {m.diagnostics.length > 0 ? (
          <div className="rd-finding-list">
            <p className="rd-subhead">Top issues</p>
            {m.diagnostics.map((d) => (
              <div key={d.rank} className={`rd-finding rd-sev-${d.severity}`}>
                <div className="rd-finding-head">
                  <SevGlyph severity={d.severity} />
                  <span className="rd-rank">#{d.rank}</span>
                  <span className="rd-finding-title">{d.title}</span>
                  <span className={`rd-chip rd-chip-sev-${d.severity}`}>
                    {severityLabel(d.severity)}
                  </span>
                </div>
                <dl className="rd-kv">
                  <div>
                    <dt>Problem</dt>
                    <dd>{d.problem}</dd>
                  </div>
                  <div>
                    <dt>Why it hurts visibility</dt>
                    <dd>{d.whyItHurts}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        ) : null}
      </Section>

      <Section
        n="05"
        title="Priority Fixes"
        label="What to fix first"
        reportId={m.meta.reportId}
      >
        <div className="rd-fix-list">
          {m.fixes.map((f) => (
            <div key={f.rank} className="rd-fix">
              <div className="rd-fix-head">
                <span className="rd-rank rd-rank-fix">#{f.rank}</span>
                <span className="rd-fix-title">{f.title}</span>
              </div>
              <div className="rd-chip-row">
                <span className={`rd-chip rd-chip-impact-${f.impact}`}>
                  {f.impact.toUpperCase()} IMPACT
                </span>
                <span className="rd-chip">DIFFICULTY · {f.difficulty}</span>
                {f.foundationFix ? (
                  <span className="rd-chip rd-chip-accent">
                    FOUNDATION FIX · YES
                  </span>
                ) : null}
              </div>
              <dl className="rd-kv">
                <div>
                  <dt>Recommended fix</dt>
                  <dd>{f.action}</dd>
                </div>
                <div>
                  <dt>Business impact</dt>
                  <dd>{f.businessImpact}</dd>
                </div>
              </dl>
              {f.unlocks.length > 0 ? (
                <p className="rd-unlocks">
                  <span className="rd-unlocks-label">Unlocks</span>{" "}
                  {f.unlocks.join(" · ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section
        n="06"
        title="Strategic Action Plan"
        label="Business outcome"
        reportId={m.meta.reportId}
      >
        <div className="rd-outcome">
          <div className="rd-outcome-head">
            <OutcomeGlyph />
            <span className="rd-outcome-label">Projected outcome</span>
          </div>
          <p className="rd-outcome-prose">{m.businessImpact}</p>
          {(() => {
            const unlocks = Array.from(
              new Set(m.fixes.flatMap((f) => f.unlocks)),
            ).slice(0, 6);
            return unlocks.length > 0 ? (
              <div className="rd-outcome-unlocks">
                <span className="rd-outcome-unlocks-label">
                  What improves once fixed
                </span>
                <div className="rd-chip-row">
                  {unlocks.map((u) => (
                    <span key={u} className="rd-chip rd-chip-accent">
                      {u}
                    </span>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
        </div>
        <div className="rd-cta-wrap">
          <ReportCtaCard
            orderId={m.meta.orderId}
            businessLabel={m.meta.businessName}
          />
        </div>
      </Section>

      <details className="rd-appendix" open={false}>
        <summary>
          <span className="rd-eyebrow">Appendix</span>
          <span className="rd-appendix-title">Methodology &amp; per-system detail</span>
        </summary>
        <div className="rd-appendix-body">
          <p className="rd-appendix-method">
            GeoViz analyzed publicly accessible website and trust signals —
            site content, business identity details, structured business
            data, and AI-crawler accessibility. The composite reflects six
            categories covering AI readability, business identity
            verification, trust signals, content depth, brand presence, and
            technical accessibility. Each report is reviewed before delivery.
          </p>
        </div>
      </details>

      <footer className="rd-footer">
        <span className="rd-footer-lockup">
          <GeoVizMark size={28} />
          <span className="rd-footer-brand">
            Geo<span>Viz</span>
            <span className="rd-footer-ai">.ai</span>
          </span>
        </span>
        <span className="rd-footer-meta">
          AI Visibility Intelligence · geoviz.ai
        </span>
        <span className="rd-footer-id">{m.meta.reportId}</span>
      </footer>
    </article>
  );
}

function Cover({ model }: { model: ReportModel }) {
  const m = model;
  const overall = typeof m.score.overall === "number" ? m.score.overall : null;
  return (
    <section className="rd-cover" aria-label="report cover">
      <div className="rd-cover-bg" aria-hidden />
      <div className="rd-cover-watermark" aria-hidden>
        <GeoVizMark size={560} mono />
      </div>
      <div className="rd-cover-bar" aria-hidden />

      {/* Brand zone */}
      <header className="rd-cover-top">
        <span className="rd-cover-lockup">
          <GeoVizMark size={94} />
          <span className="rd-cover-logo">
            GeoViz<span className="rd-cover-logo-ai">.ai</span>
          </span>
        </span>
        <span className="rd-cover-kicker">AI VISIBILITY INTELLIGENCE</span>
      </header>

      {/* Editorial hero — the business name is the focal point */}
      <div className="rd-cover-hero">
        <p className="rd-cover-eyebrow">AI Visibility Intelligence Report</p>
        <h1 className="rd-cover-business">{m.meta.businessName}</h1>
        {m.meta.nameAlternates.length > 0 ? (
          <p className="rd-cover-alt">
            Also referenced as <span>{m.meta.nameAlternates.join(", ")}</span>
          </p>
        ) : null}
        <p className="rd-cover-url">{prettyUrl(m.meta.website)}</p>
      </div>

      <div className="rd-cover-rule" aria-hidden />

      {/* Score feature cluster — gauge + verdict, side by side */}
      <div className="rd-cover-feature">
        <div className="rd-cover-gauge-wrap">
          <ScoreGauge value={m.score.overall} tone={m.score.tone} size={184} />
        </div>
        <div className="rd-cover-verdict">
          <span className="rd-cover-verdict-label">GeoViz Score</span>
          <span className={`rd-band rd-band-${m.score.tone}`}>{m.score.band}</span>
          {m.meta.cohort ? (
            <span className="rd-cohort">{m.meta.cohort}</span>
          ) : null}
          <span className="rd-cover-verdict-note">
            {overall === null
              ? "Directional AI-visibility assessment."
              : `${overall} / 100 composite across six AI-visibility categories.`}
          </span>
        </div>
        {m.buckets.length > 0 ? (
          <div className="rd-cover-buckets">
            {m.buckets.map((b) => (
              <div key={b.key} className="rd-cover-bucket">
                <span className="rd-cover-bucket-label">{b.label}</span>
                <Meter pct={b.pct} tone={b.tone} compact />
                <span className="rd-cover-bucket-pct">{b.pct}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Dossier band — quiet metadata at the foot of the cover */}
      <dl className="rd-cover-meta">
        <Meta k="Generated" v={fmtDate(m.meta.generatedAt)} />
        <Meta k="Report ID" v={m.meta.reportId} mono />
        <Meta k="Review status" v="Human Reviewed" />
        {m.meta.cohort ? (
          <Meta k="Cohort" v={m.meta.cohort} />
        ) : (
          <Meta k="Website" v={prettyUrl(m.meta.website)} />
        )}
      </dl>

      <p className="rd-cover-disclaimer">
        Directional assessment based on publicly accessible website and trust
        signals. Not a ranking guarantee.
      </p>
    </section>
  );
}

function Section({
  n,
  title,
  label,
  reportId,
  children,
}: {
  n: string;
  title: string;
  label: string;
  reportId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rd-section">
      <div className="rd-section-watermark" aria-hidden>
        <GeoVizMark size={300} mono />
      </div>
      <div className="rd-section-head">
        <span className="rd-section-marker">
          <GeoVizMark size={26} />
          <span className="rd-section-n">{n}</span>
        </span>
        <div className="rd-section-titles">
          <p className="rd-eyebrow">{label}</p>
          <h2 className="rd-section-title">{title}</h2>
        </div>
        <span className="rd-section-brand">
          Geo<span>Viz</span> · {reportId}
        </span>
      </div>
      <div className="rd-section-body">{children}</div>
    </section>
  );
}

function Executive({ model }: { model: ReportModel }) {
  const m = model;
  const overall = typeof m.score.overall === "number" ? m.score.overall : null;
  const cohort = m.meta.cohort ?? "—";
  const conf = m.score.confidenceLabel
    ? m.score.confidenceLabel.replace(/^Audit completeness:\s*/i, "")
    : "—";
  const tiles: Array<{ k: string; v: string; tone?: Tone }> = [
    { k: "Overall", v: overall === null ? "—" : `${overall}`, tone: m.score.tone },
    { k: "Band", v: m.score.band, tone: m.score.tone },
    { k: "Cohort", v: cohort },
    { k: "Audit confidence", v: conf },
  ];
  return (
    <>
      <p className="rd-exec-headline">{m.executive.headline}</p>
      <div className="rd-stat-tiles">
        {tiles.map((t) => (
          <div
            key={t.k}
            className={`rd-stat-tile ${t.tone ? `rd-stat-tile-${t.tone}` : ""}`}
          >
            <span className="rd-stat-k">{t.k}</span>
            <span className={`rd-stat-v ${t.tone ? `rd-tone-${t.tone}` : ""}`}>
              {t.v}
            </span>
          </div>
        ))}
      </div>
      <div className="rd-signal-grid">
        <div className="rd-signal rd-signal-pos">
          <span className="rd-signal-label">Strongest signal</span>
          <span className="rd-signal-val">{m.executive.strongestSignal}</span>
        </div>
        <div className="rd-signal rd-signal-neg">
          <span className="rd-signal-label">Weakest signal</span>
          <span className="rd-signal-val">{m.executive.weakestSignal}</span>
        </div>
      </div>
      {m.diagnostics[0] || m.fixes[0] ? (
        <div className="rd-insight">
          <span className="rd-insight-label">Key takeaway</span>
          <div className="rd-insight-rows">
            {m.diagnostics[0] ? (
              <div className="rd-insight-row">
                <span className="rd-insight-tag rd-insight-tag-issue">TOP ISSUE</span>
                <span>{m.diagnostics[0].title}</span>
              </div>
            ) : null}
            {m.fixes[0] ? (
              <div className="rd-insight-row">
                <span className="rd-insight-tag rd-insight-tag-fix">FIRST FIX</span>
                <span>{m.fixes[0].title}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function BucketRow({ buckets }: { buckets: ReportModelBucket[] }) {
  return (
    <div className="rd-bucket-row">
      {buckets.map((b) => (
        <div key={b.key} className="rd-bucket">
          <div className="rd-bucket-top">
            <span className="rd-bucket-name">{b.label}</span>
            <span className={`rd-bucket-val rd-tone-${b.tone}`}>{b.pct}</span>
          </div>
          <Meter pct={b.pct} tone={b.tone} />
        </div>
      ))}
    </div>
  );
}

function PlatformCard({ provider }: { provider: ReportModelProvider }) {
  const p = provider;
  const unavailable = p.verdict === "UNAVAILABLE";
  const us = p.understandingScore;
  const usTone: Tone =
    us === null ? "muted" : us >= 70 ? "ok" : us >= 40 ? "warn" : "bad";
  // At-a-glance strength: how the model understood the business.
  const strength =
    p.businessType ??
    (p.topServices.length ? p.topServices[0] : null) ??
    "Recognized as a local business";
  const strengthDetail = p.location
    ? p.location
    : p.topServices.length
      ? p.topServices.slice(0, 3).join(" · ")
      : null;
  return (
    <div className={`rd-platform rd-platform-${p.provider}`}>
      <div className="rd-platform-band">
        <span className="rd-platform-id">
          <span className="rd-platform-chip">
            <ProviderMark provider={p.provider} size={22} />
          </span>
          <span className="rd-platform-name">{p.display}</span>
        </span>
        <span className={`rd-verdict rd-verdict-${p.verdict.toLowerCase()}`}>
          {unavailable ? "UNAVAILABLE" : p.verdict}
        </span>
      </div>
      {unavailable ? (
        <p className="rd-provider-na">No response captured for this audit.</p>
      ) : (
        <div className="rd-platform-body">
          <div className="rd-platform-scores">
            <div className="rd-platform-score">
              <span className="rd-platform-score-k">Understanding</span>
              <span className={`rd-platform-score-v rd-tone-${usTone}`}>
                {us === null ? "—" : us}
              </span>
              <Meter pct={us ?? 0} tone={usTone} compact />
            </div>
            <div className="rd-platform-score rd-platform-score-rec">
              <span className="rd-platform-score-k">Recommendation</span>
              <span className={`rd-readychip rd-ready-${p.recommendationReadiness ?? "na"}`}>
                {(p.recommendationReadiness ?? "—").toString().toUpperCase()}
              </span>
            </div>
          </div>
          <div className="rd-glance-list">
            <div className="rd-glance rd-glance-pos">
              <TrendGlyph dir="up" />
              <div className="rd-glance-body">
                <span className="rd-glance-k">Reads as</span>
                <span className="rd-glance-v">
                  {strength}
                  {strengthDetail ? (
                    <span className="rd-glance-detail"> · {strengthDetail}</span>
                  ) : null}
                </span>
              </div>
            </div>
            <div className="rd-glance rd-glance-neg">
              <TrendGlyph dir="down" />
              <div className="rd-glance-body">
                <span className="rd-glance-k">Main gap</span>
                <span className="rd-glance-v">{p.mainGap ?? "No critical gap flagged"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrendGlyph({ dir }: { dir: "up" | "down" }) {
  const tone = dir === "up" ? "ok" : "bad";
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 13 13"
      aria-hidden
      className={`rd-trendglyph rd-tone-${tone}`}
    >
      {dir === "up" ? (
        <path d="M6.5 10 V3 M3.5 6 L6.5 3 L9.5 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M6.5 3 V10 M3.5 7 L6.5 10 L9.5 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

function ReadinessCard({ factor }: { factor: ReadinessFactor }) {
  const f = factor;
  const score = f.score === null ? "—" : String(f.score);
  return (
    <div className="rd-readiness">
      <div className="rd-readiness-head">
        <span className="rd-readiness-name">{f.label}</span>
        <span className="rd-readiness-tag">READINESS SCORE</span>
      </div>
      <div className="rd-readiness-scorerow">
        <span className={`rd-readiness-v rd-tone-${f.tone}`}>{score}</span>
        <Meter pct={f.score ?? 0} tone={f.tone} />
      </div>
      <p className="rd-readiness-basis">{f.basis}</p>
    </div>
  );
}

function ComparisonStrip({ providers }: { providers: ReportModelProvider[] }) {
  const scored = providers.filter((p) => p.understandingScore !== null);
  if (scored.length < 2) return null;
  // Rank scored platforms high→low; unscored fall to the end.
  const ranked = [...providers].sort((a, b) => {
    const av = a.understandingScore;
    const bv = b.understandingScore;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });
  const leaderScore = ranked[0]?.understandingScore ?? null;
  return (
    <div className="rd-compare">
      <p className="rd-figure-label">Business understanding — ranked across platforms</p>
      <div className="rd-compare-rows">
        {ranked.map((p, i) => {
          const us = p.understandingScore;
          const tone: Tone =
            us === null ? "muted" : us >= 70 ? "ok" : us >= 40 ? "warn" : "bad";
          const isLeader = us !== null && us === leaderScore && i === 0;
          return (
            <div
              key={p.provider}
              className={`rd-compare-row${isLeader ? " rd-compare-leader" : ""}`}
            >
              <span className="rd-compare-rank">{us === null ? "—" : i + 1}</span>
              <span className="rd-compare-mark">
                <ProviderMark provider={p.provider} size={16} />
                {p.display}
                {isLeader ? <span className="rd-compare-tag">LEADER</span> : null}
              </span>
              <Meter pct={us ?? 0} tone={tone} />
              <span className={`rd-compare-val rd-tone-${tone}`}>
                {us === null ? "N/A" : us}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: ReportModelCategory }) {
  const val = category.score === null ? "—" : String(category.score);
  return (
    <div className="rd-cat">
      <div className="rd-cat-top">
        <span className="rd-cat-name">{category.label}</span>
        <span className="rd-cat-weight">{category.weight}%</span>
        <span className={`rd-cat-val rd-tone-${category.tone}`}>{val}</span>
      </div>
      <Meter pct={category.score ?? 0} tone={category.tone} />
      {category.reason ? <p className="rd-cat-reason">{category.reason}</p> : null}
    </div>
  );
}

function Meter({
  pct,
  tone,
  compact,
}: {
  pct: number;
  tone: Tone;
  compact?: boolean;
}) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className={`rd-meter${compact ? " rd-meter-compact" : ""}`}>
      <div className={`rd-meter-fill rd-tone-${tone}`} style={{ width: `${w}%` }} />
    </div>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="rd-meta-cell">
      <dt>{k}</dt>
      <dd className={mono ? "rd-mono" : undefined}>{v}</dd>
    </div>
  );
}

function SevGlyph({ severity }: { severity: string }) {
  const tone =
    severity === "critical" ? "bad" : severity === "warning" ? "warn" : "muted";
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className={`rd-sevglyph rd-tone-${tone}`}>
      <path
        d="M8 1.5 L14.5 13 H1.5 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8 6 V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.7" fill="currentColor" />
    </svg>
  );
}

function OutcomeGlyph() {
  // Rising-bars / growth mark for the projected-outcome card.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="rd-outcome-glyph">
      <path d="M2.5 15.5 H15.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="3.5" y="10" width="2.6" height="4" rx="0.6" fill="currentColor" opacity="0.55" />
      <rect x="7.7" y="7" width="2.6" height="7" rx="0.6" fill="currentColor" opacity="0.78" />
      <rect x="11.9" y="3.5" width="2.6" height="10.5" rx="0.6" fill="currentColor" />
      <path d="M3 9 L7 6 L10 8 L15 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function severityLabel(s: string): string {
  if (s === "critical") return "CRITICAL";
  if (s === "warning") return "HIGH IMPACT";
  return "ADVISORY";
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
