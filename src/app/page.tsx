import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HeroRadar } from "@/components/HeroRadar";
import { SampleAuditCard } from "@/components/SampleAuditCard";

/**
 * Homepage — redesigned in PR #27 ("Satellite Visibility System ×
 * Bloomberg Terminal"). 11 sections compressed to 6:
 *   1. Hero          — headline + HeroRadar (left/right asymmetric)
 *   2. Problem       — 4 evidence-style observations
 *   3. How it works  — CRAWL → ANALYZE → REPORT
 *   4. What we audit — 8 dimensions in a dense data-manifest list
 *   5. Pricing       — 2 cards (audit $97 + Foundation Fix $497)
 *   6. Final CTA     — social proof line + single primary button
 *
 * Design constraints per CLAUDE_DESIGN.md:
 *   - Restrained motion (only HeroRadar moves; sweep at 12s, center
 *     pulse at 3s — both honor prefers-reduced-motion).
 *   - Cyan reserved for telemetry (HeroRadar + numbered prefixes).
 *   - Amber/accent reserved for scores + CTAs.
 *   - Mono for prices, IDs, dimension labels, numeric prefixes.
 *   - Sharp edges (PR #25 set the global rounding to rounded-lg).
 *   - No icon-card SaaS grids; data manifests instead.
 */

const PLATFORMS = ["ChatGPT", "Claude", "Perplexity", "Gemini", "AI Overviews"];

const PROBLEMS = [
  "AI systems rely on structured, machine-readable business information.",
  "Inconsistent business signals weaken retrieval confidence.",
  "Most websites were built for Google search, not AI recommendation systems.",
  "Missing schema and fragmented entity signals reduce discoverability.",
];

const STEPS = [
  {
    name: "CRAWL",
    body: "GeoViz reads your public website and machine-readable business signals.",
  },
  {
    name: "ANALYZE",
    body: "We inspect schema, entity clarity, crawlability, AI readability, and recommendation readiness.",
  },
  {
    name: "REPORT",
    body: "You receive a scored diagnostic with prioritized visibility fixes.",
  },
];

const DIMENSIONS = [
  {
    name: "AI Readability",
    body: "How clearly AI systems can parse your site content.",
  },
  {
    name: "Entity Clarity",
    body: "Whether structured business data identifies you cleanly.",
  },
  {
    name: "Schema / Structured Data",
    body: "Coverage of LocalBusiness-family schema fields.",
  },
  {
    name: "Crawlability",
    body: "Whether AI crawlers can reach your pages.",
  },
  {
    name: "Technical Accessibility",
    body: "How a headless render compares to your source HTML.",
  },
  {
    name: "Recommendation Readiness",
    body: "Depth and clarity needed for AI to name you.",
  },
  {
    name: "Discoverability Signals",
    body: "Trust, citation, and NAP consistency across the web.",
  },
  {
    name: "Content Depth & Context",
    body: "Whether your site has the depth AI can quote.",
  },
];

const AUDIT_BULLETS = [
  "AI Visibility Score (0–100) with band tier",
  "Top 3 visibility issues with severity + impact",
  "Top 3 fixes with priority + difficulty",
  "Operator-reviewed before delivery",
  "Professional PDF report",
];

const FOUNDATION_BULLETS = [
  "Machine-readability improvements for AI retrieval",
  "Trust and verification signal strengthening",
  "Cross-platform business identity alignment",
  "Before/after GeoViz re-check (verification audit)",
];

const FOUNDATION_SAFETY = [
  "Scoped engagement — not a website rebuild.",
  "Implementation recommendations tailored to your platform.",
  "Complex sites may require custom scoping — we’ll quote upfront.",
];

// Per-platform retrieval profile band (PR #28). Honest framing of
// the reference image's "LIVE · AI ACTIVITY" idea — we don't have
// real-time per-platform telemetry, but we do test against each
// platform's distinct retrieval mode. The descriptor is a factual
// characterization, not a status claim.
const RETRIEVAL_PROFILES = [
  { name: "ChatGPT", profile: "Web search tools" },
  { name: "Claude", profile: "Web search retrieval" },
  { name: "Perplexity", profile: "Citation engine" },
  { name: "Gemini", profile: "Knowledge graph" },
  { name: "AI Overviews", profile: "AI Mode" },
];

// Trust signals strip below the retrieval profiles section. Each
// claim is verifiable — no enterprise-grade marketing puffery.
const TRUST_SIGNALS = [
  "Real AI system testing",
  "Operator-reviewed reports",
  "Actionable recommendations",
  "Stripe-secure checkout",
];

// FAQ content. Native <details>/<summary> accordion — no JS, full
// keyboard + screen-reader support out of the box. Answers stay
// factual and honor CLAUDE.md's "no guaranteed rankings" rule.
const FAQS = [
  {
    q: "What does the audit actually measure?",
    a: "Eight AI visibility dimensions: schema / structured data, entity clarity, crawlability, technical accessibility, AI readability, recommendation readiness, discoverability signals, and content depth. The full list is in the “What we audit” section above.",
  },
  {
    q: "How long does delivery take?",
    a: "Most audits are delivered by email within minutes. Each report is operator-reviewed before delivery, which can occasionally add a short queue during high-traffic periods.",
  },
  {
    q: "Will this guarantee my business shows up in ChatGPT?",
    a: "No, and we won’t claim it does. The audit identifies the structural reasons AI systems may or may not retrieve your business and gives you a prioritized fix list. AI recommendation behavior is non-deterministic — we measure readiness, not placement.",
  },
  {
    q: "What’s the difference between the $97 audit and the $497 Foundation Fix?",
    a: "The audit is a diagnostic — it tells you what’s broken. The Foundation Fix is a scoped engagement where we implement the AI-readable layer your audit identifies as missing.",
  },
  {
    q: "What if my audit fails?",
    a: "If our system can’t complete an audit for technical reasons (site unreachable, blocking AI crawlers, etc.) we either regenerate the report or refund your payment — your choice.",
  },
  {
    q: "Can I see a sample report before I buy?",
    a: "Yes — use the “see sample report” link in the hero, or the Sample Report link in the header.",
  },
];

export default function Page() {
  return (
    <main>
      <Header />

      {/* ─────────────────────────────────────────────────────────
          1. HERO — asymmetric 4fr:6fr grid. Left = copy + CTAs +
             pricing strip. Right = telemetry suite (HeroRadar +
             SampleAuditCard side-by-side on lg+; stacked below
             lg). Single bg-radial-orange — no grid-bg overlay, no
             duplicate glow.
          ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-radial-orange" />
        <div className="container-page grid gap-12 py-20 md:grid-cols-[4fr_6fr] md:py-28 md:gap-16 lg:gap-20">
          <div>
            <p className="mono-data text-[11px] uppercase tracking-[0.22em] text-cyan">
              AI Visibility Intelligence
            </p>
            <h1 className="mt-5 text-3xl font-bold uppercase leading-[1.05] tracking-[-0.02em] text-white sm:text-4xl md:text-[44px] md:leading-[1.02] lg:text-[52px]">
              See how AI sees{" "}
              <span className="text-accent">your</span> business.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              GeoViz maps how AI systems read, understand, and
              retrieve your business — so you can close visibility
              gaps before customers choose someone else.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/order"
                className="btn-primary inline-flex items-center gap-2 text-base"
              >
                Get my visibility score
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/sample-report"
                className="mono-data text-xs uppercase tracking-[0.18em] text-white/55 hover:text-white/85"
              >
                see sample report →
              </Link>
            </div>

            {/* Pricing strip — mono, intentionally framed as
                "early access" so the discount doesn't read as
                permanently cheap. Matches the reference image. */}
            <p className="mono-data mt-6 text-xs uppercase tracking-[0.18em] text-white/55">
              Early access · <span className="text-white/85">$97</span>{" "}
              <span className="ml-2 text-white/35 line-through">$147</span>
            </p>

            {/* Trust ticker — 110+ audits, operator-reviewed,
                report ID. Bloomberg-ticker rhythm. */}
            <p className="mono-data mt-3 text-[10px] uppercase tracking-[0.2em] text-white/40">
              110+ audits run · operator-reviewed · GEO-SAMPLE-001
            </p>
          </div>

          {/* Telemetry suite — radar + score panel side-by-side. */}
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:gap-6 lg:items-center">
            <div className="flex items-center justify-center">
              <HeroRadar />
            </div>
            <div className="flex items-center justify-center lg:justify-start">
              <SampleAuditCard className="w-full max-w-[280px]" />
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          1.5. AI RETRIEVAL PROFILES — 5 platform cards in a
               horizontal band. Each card shows platform name +
               retrieval-mode descriptor + decorative sparkline.
               Honest framing: NOT "live activity" telemetry; the
               sparklines are decorative visual identity.
          ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-12 md:py-16">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="section-eyebrow">
                Platforms · AI retrieval profiles
              </p>
              <h2 className="h3 mt-3 max-w-2xl">
                Five AI systems. Five retrieval profiles we test.
              </h2>
            </div>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {RETRIEVAL_PROFILES.map((p) => (
              <RetrievalProfileCard
                key={p.name}
                name={p.name}
                profile={p.profile}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          1.6. BUILT FOR THE AI ERA — thin trust strip. Quiet
               border-bordered band of 4 inline claims. NOT a
               feature section — a status indicator.
          ───────────────────────────────────────────────────────── */}
      <section className="border-y border-white/5 bg-ink-950/60">
        <div className="container-page py-5">
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
            <p className="mono-data text-[10px] uppercase tracking-[0.22em] text-white/40">
              Built for the AI era
            </p>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {TRUST_SIGNALS.map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/65"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          2. PROBLEM — 4 evidence-style observations. No cards,
             no icons. Mono numbered prefixes in cyan (telemetry
             accent). Bloomberg-ticker rhythm.
          ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-16 md:py-20">
          <p className="section-eyebrow">
            Problem · why AI readability matters
          </p>
          <h2 className="h2 mt-3 max-w-3xl">
            Most websites are unreadable to AI by default.
          </h2>
          <ul className="mt-10 grid gap-x-12 gap-y-5 md:grid-cols-2">
            {PROBLEMS.map((body, i) => (
              <li key={body} className="flex gap-4">
                <span className="mono-data text-xs uppercase tracking-[0.18em] text-cyan">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-base leading-relaxed text-white/85">
                  {body}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          3. HOW IT WORKS — 3 horizontal steps. CRAWL → ANALYZE →
             REPORT. Arrow connectors on md+ only.
          ───────────────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-16 md:py-20">
          <p className="section-eyebrow">Process · how it works</p>
          <h2 className="h2 mt-3 max-w-2xl">
            Three stages. One reviewed report.
          </h2>
          <div className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step, i) => (
              <div key={step.name} className="relative">
                <p className="mono-data text-[10px] uppercase tracking-[0.22em] text-cyan">
                  Step {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mono-data mt-3 text-xl uppercase tracking-[0.04em] text-white">
                  {step.name}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-white/65">
                  {step.body}
                </p>
                {/* Arrow connector — only between cards, not after
                    the last one. Hidden on mobile (single column). */}
                {i < STEPS.length - 1 ? (
                  <span
                    aria-hidden
                    className="mono-data pointer-events-none absolute -right-4 top-1 hidden text-base text-white/20 md:block"
                  >
                    →
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          4. WHAT WE AUDIT — 8 dimensions as dense data manifest.
             Numbered rows with mono dimension names + descriptions.
             Looks like a system spec, not a feature grid.
          ───────────────────────────────────────────────────────── */}
      <section
        id="what-we-audit"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-16 md:py-20">
          <p className="section-eyebrow">Audit scope · 8 dimensions</p>
          <h2 className="h2 mt-3 max-w-2xl">
            What every GeoViz audit measures.
          </h2>
          <div className="mt-10 grid gap-x-12 md:grid-cols-2">
            {DIMENSIONS.map((dim, i) => (
              <DimensionRow key={dim.name} index={i + 1} {...dim} />
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          5. PRICING — 2 cards: audit ($97 early access) + Foundation
             Fix ($497). Same rhythm; card 1 is the primary
             recommendation, card 2 is the deeper engagement.
          ───────────────────────────────────────────────────────── */}
      <section
        id="pricing"
        className="relative border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-50" />
        <div className="container-page py-16 md:py-24">
          <p className="section-eyebrow">Pricing · two engagements</p>
          <h2 className="h2 mt-3 max-w-2xl">
            Diagnose first. Fix the foundation when you&rsquo;re ready.
          </h2>

          <div className="mt-12 grid gap-6 md:grid-cols-2 md:gap-8">
            {/* CARD 1 — AI Visibility Audit */}
            <article className="flex flex-col rounded-lg border border-white/10 bg-ink-900/60 p-8 shadow-card md:p-10">
              <p className="mono-data text-[11px] uppercase tracking-[0.22em] text-cyan">
                AI Visibility Audit
              </p>
              <div className="mt-6 flex items-baseline gap-3">
                <span className="mono-data text-5xl font-bold text-white">
                  $97
                </span>
                <span className="mono-data text-base text-white/35 line-through">
                  $147
                </span>
              </div>
              <p className="mono-data mt-3 text-xs uppercase tracking-[0.18em] text-white/55">
                Early access pricing
              </p>
              <ul className="mt-8 space-y-3 text-sm text-white/80">
                {AUDIT_BULLETS.map((b) => (
                  <PricingBullet key={b}>{b}</PricingBullet>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link
                  href="/order"
                  className="btn-primary w-full justify-center text-base"
                >
                  Request my audit
                </Link>
                <p className="mt-3 text-xs text-white/45">
                  Reviewed report delivered by email, typically within
                  minutes.
                </p>
              </div>
            </article>

            {/* CARD 2 — Foundation Fix */}
            <article className="flex flex-col rounded-lg border border-white/10 bg-ink-900/40 p-8 shadow-card md:p-10">
              <p className="mono-data text-[11px] uppercase tracking-[0.22em] text-white/55">
                Foundation Fix
              </p>
              <div className="mt-6 flex items-baseline gap-3">
                <span className="mono-data text-5xl font-bold text-white">
                  $497
                </span>
              </div>
              <p className="mono-data mt-3 text-xs uppercase tracking-[0.18em] text-white/55">
                One-time engagement · 3–5 business days
              </p>
              <p className="mt-5 max-w-md text-sm leading-relaxed text-white/75">
                Install the foundational AI-readable business layer
                your website is missing — a scoped engagement that
                {/* keep the abstract-framing phrase on one line so
                    the report-copy-defensibility regex matches. */}
                addresses the underlying technical, trust, and discoverability gaps surfaced in your audit.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-white/80">
                {FOUNDATION_BULLETS.map((b) => (
                  <PricingBullet key={b}>{b}</PricingBullet>
                ))}
              </ul>
              <ul className="mt-6 space-y-2 border-t border-white/5 pt-5 text-xs text-white/55">
                {FOUNDATION_SAFETY.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="text-white/30">·</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-8">
                <Link
                  href="/foundation-fix"
                  className="mono-data inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-white/70 hover:text-white"
                >
                  request foundation fix →
                </Link>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          5.5. FAQ — native <details> accordion (no JS dependency).
               Six factual answers. No overpromising — explicit
               about non-deterministic AI behavior, refund path,
               difference between audit and Foundation Fix.
          ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-16 md:py-20">
          <p className="section-eyebrow">FAQ · questions we get</p>
          <h2 className="h2 mt-3 max-w-2xl">Quick answers.</h2>
          <ul className="mt-10 max-w-3xl divide-y divide-white/5 border-y border-white/5">
            {FAQS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </ul>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────
          6. SOCIAL PROOF + FINAL CTA — tight closer. Single line
             of real proof, single primary action.
          ───────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20 text-center">
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/75">
            110+ AI visibility audits run across local businesses,
            service companies, and niche brands.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/order"
              className="btn-primary inline-flex items-center gap-2 text-base"
            >
              Get my visibility score
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function DimensionRow({
  index,
  name,
  body,
}: {
  index: number;
  name: string;
  body: string;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-start gap-x-4 border-b border-white/5 py-5">
      <span className="mono-data pt-[2px] text-xs uppercase tracking-[0.18em] text-cyan">
        [{String(index).padStart(2, "0")}]
      </span>
      <div>
        <p className="mono-data text-[13px] uppercase tracking-[0.1em] text-white">
          {name}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-white/65">
          {body}
        </p>
      </div>
    </div>
  );
}

function PricingBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m3 8 3.5 3.5L13 5" />
        </svg>
      </span>
      <span>{children}</span>
    </li>
  );
}

/**
 * Per-platform card in the AI Retrieval Profiles band. Shows the
 * platform name + its factual retrieval-mode descriptor + a tiny
 * decorative sparkline (visual identity only — not real data).
 */
function RetrievalProfileCard({
  name,
  profile,
}: {
  name: string;
  profile: string;
}) {
  return (
    <article className="rounded-lg border border-white/10 bg-ink-900/40 p-4">
      <div className="flex items-center justify-between">
        <p className="mono-data text-xs uppercase tracking-[0.14em] text-white/85">
          {name}
        </p>
        <span className="h-1.5 w-1.5 rounded-full bg-cyan" aria-hidden />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-white/55">
        {profile}
      </p>
      <ProfileSparkline className="mt-3" />
    </article>
  );
}

/**
 * Tiny decorative sparkline. Fixed shape (not data-driven) —
 * provides visual identity for the platform cards. aria-hidden
 * because it carries no information; the platform name + profile
 * descriptor do the communication work.
 */
function ProfileSparkline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 22"
      className={`block h-5 w-full ${className ?? ""}`}
      aria-hidden
      focusable="false"
    >
      <polyline
        points="0,16 12,12 22,15 32,8 44,11 54,6 66,9 80,4"
        fill="none"
        stroke="rgba(103, 232, 249, 0.45)"
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="80" cy="4" r="1.5" fill="rgba(103, 232, 249, 0.95)" />
    </svg>
  );
}

/**
 * FAQ accordion item — native <details>/<summary>, no JS. The
 * marker is hidden via list-style-none + custom +/× indicator
 * driven by the open attribute.
 */
function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <li>
      <details className="group py-5 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer items-start justify-between gap-6 list-none">
          <span className="text-base font-medium leading-snug text-white">
            {q}
          </span>
          <span
            aria-hidden
            className="mono-data shrink-0 text-xl leading-none text-white/45 transition group-open:rotate-45"
          >
            +
          </span>
        </summary>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/70">
          {a}
        </p>
      </details>
    </li>
  );
}
