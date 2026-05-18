import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HeroRadar } from "@/components/HeroRadar";
import { SampleAuditCard } from "@/components/SampleAuditCard";

/**
 * Homepage — rebuilt PR #29 against
 * references/geoviz-radar-reference.png as the primary visual
 * direction. Audience is real SMB owners (roofers, dentists,
 * contractors), so the copy is plain English — no enterprise /
 * dev-tooling / abstract-AI-jargon voice.
 *
 * Composition principles:
 *   - Orange radar is the emotional anchor of the hero. Cyan is
 *     minimal. Obsidian background. Editorial spacing.
 *   - Big confident typography; hierarchy from size + weight, not
 *     from bordered boxes or telemetry numbering.
 *   - No SaaS card grids, no fake dashboards, no [01]-style
 *     section numbers, no mono labels sprinkled everywhere.
 *   - Sections: Hero · Trust strip · How it works · Before/After ·
 *     Sample report preview · FAQ · Pricing · Final CTA.
 *
 * Routes / backend / audit flow are untouched — landing page only.
 */

const PLATFORMS = [
  "ChatGPT",
  "Claude",
  "Perplexity",
  "Gemini",
  "Google AI Overviews",
];

const STEPS = [
  {
    title: "We scan your business",
    body: "We pull your public website and the signals AI systems actually read — your name, services, location, structured data, and trust markers.",
  },
  {
    title: "We test AI visibility",
    body: "We check how clearly ChatGPT, Claude, Gemini, and Perplexity can identify, trust, and retrieve your business when a customer asks for a recommendation.",
  },
  {
    title: "You get a report + fixes",
    body: "A clear visibility score, the specific issues holding you back, and exactly what to fix first — reviewed by a human before it reaches you.",
  },
];

const BEFORE_POINTS = [
  "Inconsistent business name, phone, and address across the web",
  "No structured data AI can parse",
  "Thin service pages with nothing AI can quote",
  "Reviews and trust signals AI can’t connect to you",
];

const AFTER_POINTS = [
  "One consistent business identity AI can verify",
  "Structured details AI can read and retrieve",
  "Clear service and answer content AI can quote",
  "Trust signals tied directly to your business",
];

const SAMPLE_EVIDENCE = [
  {
    tone: "ok" as const,
    text: "Business name and location detected in structured data",
  },
  {
    tone: "warn" as const,
    text: "Service descriptions are thin — AI has little it can quote",
  },
  {
    tone: "bad" as const,
    text: "No FAQ or pricing structure AI can retrieve",
  },
  {
    tone: "bad" as const,
    text: "Reviews aren’t connected to your business entity",
  },
];

const AUDIT_BULLETS = [
  "Your AI Visibility Score (0–100) with what it means",
  "The top 3 issues making you invisible to AI",
  "The top 3 fixes, ranked by impact",
  "Reviewed by a human before delivery",
  "Professional PDF report",
];

const FOUNDATION_BULLETS = [
  "We make your business machine-readable for AI retrieval",
  "We strengthen the trust and verification signals AI looks for",
  "We align your business identity across platforms",
  "Before/after GeoViz re-check so you can see the difference",
];

const FAQS = [
  {
    q: "What is AI visibility?",
    a: "Whether AI assistants like ChatGPT, Claude, and Gemini can find, understand, and recommend your business when a customer asks them for help. It’s separate from where you rank on Google.",
  },
  {
    q: "Why does this matter for my business?",
    a: "More people now ask AI for a recommendation before they ever open a search engine. If AI can’t read your business clearly, it confidently recommends a competitor instead of you.",
  },
  {
    q: "Is this just SEO?",
    a: "No. SEO is about ranking in Google’s search results. This is about whether AI systems can understand and trust your business enough to recommend it. They’re related, but they’re not the same checks.",
  },
  {
    q: "Can you fix the issues for me?",
    a: "Yes. The audit shows you exactly what’s wrong. The optional Foundation Fix is a scoped engagement where we implement those fixes for you and re-check the result.",
  },
  {
    q: "How long does it take?",
    a: "Most audits are delivered by email within minutes. Every report is reviewed by a human before it’s sent, which can occasionally add a short wait during busy periods.",
  },
];

export default function Page() {
  return (
    <main>
      <Header />

      {/* ── HERO ───────────────────────────────────────────────
          Massive plain-English headline left; orange scanning
          instrument + live score readout right. Asymmetric:
          ~38% text, ~62% instrument. Generous editorial spacing.
          ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-radial-orange" />
        <div className="container-page grid items-center gap-14 py-24 md:grid-cols-[minmax(0,38%)_minmax(0,62%)] md:py-32 md:gap-12 lg:gap-16">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-accent">
              AI Visibility Audit
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Can AI actually find your business?
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-white/70">
              When someone asks ChatGPT, Claude, or Gemini who to
              hire, GeoViz checks whether AI can read, trust, and
              recommend your business — before a competitor gets the
              referral.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link
                href="/order"
                className="btn-primary inline-flex items-center gap-2 text-base"
              >
                Get my AI visibility score
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/sample-report"
                className="text-sm font-medium text-white/70 underline-offset-4 hover:text-white hover:underline"
              >
                View sample report
              </Link>
            </div>

            <p className="mt-7 text-sm text-white/50">
              Early access —{" "}
              <span className="font-semibold text-white/80">$97</span>{" "}
              <span className="text-white/35">·</span> normally{" "}
              <span className="line-through">$147</span>
            </p>
          </div>

          {/* Scanning instrument + live readout. Stacks below lg. */}
          <div className="grid items-center gap-8 lg:grid-cols-[1.5fr_1fr] lg:gap-8">
            <div className="flex items-center justify-center">
              <HeroRadar />
            </div>
            <div className="flex items-center justify-center lg:justify-start">
              <SampleAuditCard className="w-full max-w-[260px]" />
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST STRIP ────────────────────────────────────────
          No cards, no sparklines, no borders — just a quiet lead
          line + the 5 platforms in a wide spaced row.
          ──────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-12 text-center">
          <p className="text-sm text-white/50">
            Tested against the AI systems your customers already use
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {PLATFORMS.map((p) => (
              <span
                key={p}
                className="text-base font-semibold tracking-tight text-white/75"
              >
                {p}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────
          3 steps. Large quiet numerals, no bordered boxes, no
          telemetry codes. Editorial three-column rhythm.
          ──────────────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-20 md:py-28">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            How it works
          </h2>
          <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {STEPS.map((step, i) => (
              <div key={step.title}>
                <span className="text-4xl font-bold text-accent/40">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-xl font-semibold text-white">
                  {step.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-white/65">
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BEFORE / AFTER ─────────────────────────────────────
          Two columns split by a single divider — left dim
          ("before"), right warm-accented ("after"). Minimal
          chrome; contrast carries the meaning.
          ──────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20 md:py-28">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            What changes when AI can read you.
          </h2>
          <div className="mt-14 grid gap-12 md:grid-cols-2 md:gap-0">
            <div className="md:pr-14">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-white/40">
                Before GeoViz
              </p>
              <p className="mt-4 text-lg leading-relaxed text-white/55">
                AI sees a blurry, fragmented business. There’s not
                enough it can trust, so it recommends someone else.
              </p>
              <ul className="mt-7 space-y-3 text-sm text-white/55">
                {BEFORE_POINTS.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span className="text-white/25">—</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="md:border-l md:border-white/10 md:pl-14">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
                AI-readable business profile
              </p>
              <p className="mt-4 text-lg leading-relaxed text-white/80">
                AI sees one clear, trusted business it can confidently
                put in front of a customer.
              </p>
              <ul className="mt-7 space-y-3 text-sm text-white/80">
                {AFTER_POINTS.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span className="text-accent">→</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── SAMPLE REPORT PREVIEW ──────────────────────────────
          One premium panel. Evidence-based plain-English findings,
          not metric soup. This is THE artifact — a single tasteful
          border is allowed here.
          ──────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20 md:py-28">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,42%)_minmax(0,58%)] lg:items-center lg:gap-16">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                A real report. Plain answers.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-white/65">
                No dashboards to decode. You get a score, the exact
                reasons AI can’t confidently recommend you, and the
                fixes that matter most — written so you can act on
                them.
              </p>
              <Link
                href="/sample-report"
                className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-accent hover:text-accent-glow"
              >
                View the full sample report
                <span aria-hidden>→</span>
              </Link>
            </div>

            <div className="rounded-lg border border-white/10 bg-ink-900/60 p-8 shadow-card md:p-10">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Sample report
                  </p>
                  <p className="mt-3 text-sm text-white/60">
                    yourbusiness.com
                  </p>
                </div>
                <div className="text-right">
                  <span className="mono-data text-5xl font-bold text-accent-glow">
                    73
                  </span>
                  <span className="mono-data text-base text-white/40">
                    /100
                  </span>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-accent-glow">
                    Needs work
                  </p>
                </div>
              </div>

              <ul className="mt-8 space-y-4 border-t border-white/5 pt-7 text-sm">
                {SAMPLE_EVIDENCE.map((e) => (
                  <li key={e.text} className="flex gap-3">
                    <EvidenceMark tone={e.tone} />
                    <span className="leading-relaxed text-white/75">
                      {e.text}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="mt-7 border-t border-white/5 pt-5 text-xs text-white/40">
                Every report is reviewed by a person before it’s
                delivered.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────
          Native <details> accordion. SMB objection-handling.
          ──────────────────────────────────────────────────────── */}
      <section
        id="faq"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-20 md:py-28">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Questions, answered.
          </h2>
          <ul className="mt-12 max-w-3xl divide-y divide-white/8 border-y border-white/8">
            {FAQS.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </ul>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────
          Two offers, restrained chrome — one shared panel split
          by a divider instead of two heavy bordered cards.
          ──────────────────────────────────────────────────────── */}
      <section
        id="pricing"
        className="relative border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-20 md:py-28">
          <h2 className="max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Start with the audit. Fix it when you’re ready.
          </h2>

          <div className="mt-14 grid gap-14 md:grid-cols-2 md:gap-0">
            {/* Audit */}
            <div className="md:pr-16">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-accent">
                AI Visibility Audit
              </p>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="text-5xl font-bold text-white">$97</span>
                <span className="text-base text-white/35 line-through">
                  $147
                </span>
              </div>
              <p className="mt-2 text-sm text-white/55">
                Early access pricing
              </p>
              <ul className="mt-8 space-y-3 text-sm text-white/80">
                {AUDIT_BULLETS.map((b) => (
                  <PricingBullet key={b}>{b}</PricingBullet>
                ))}
              </ul>
              <Link
                href="/order"
                className="btn-primary mt-9 inline-flex w-full items-center justify-center gap-2 text-base sm:w-auto"
              >
                Get my AI visibility score
                <span aria-hidden>→</span>
              </Link>
              <p className="mt-4 text-xs text-white/40">
                Delivered by email, typically within minutes.
              </p>
            </div>

            {/* Foundation Fix */}
            <div className="md:border-l md:border-white/10 md:pl-16">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-white/55">
                Foundation Fix
              </p>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="text-5xl font-bold text-white">$497</span>
              </div>
              <p className="mt-2 text-sm text-white/55">
                One-time · 3–5 business days
              </p>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/75">
                Don’t want to fix it yourself? We install the
                {/* keep the abstract-framing phrase on one line so
                    the report-copy-defensibility regex matches. */}
                AI-readable layer that addresses the underlying technical, trust, and discoverability gaps surfaced in your audit.
              </p>
              <ul className="mt-7 space-y-3 text-sm text-white/80">
                {FOUNDATION_BULLETS.map((b) => (
                  <PricingBullet key={b}>{b}</PricingBullet>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-white/45">
                Scoped engagement — not a website rebuild. Complex
                sites may require custom scoping; we’ll quote upfront.
              </p>
              <Link
                href="/foundation-fix"
                className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white"
              >
                Learn about the Foundation Fix
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────
          Confident closer + real social proof.
          ──────────────────────────────────────────────────────── */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-24 text-center">
          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">
            See what AI really thinks of your business.
          </h2>
          <div className="mt-9 flex justify-center">
            <Link
              href="/order"
              className="btn-primary inline-flex items-center gap-2 text-base"
            >
              Get my AI visibility score
              <span aria-hidden>→</span>
            </Link>
          </div>
          <p className="mx-auto mt-8 max-w-xl text-sm leading-relaxed text-white/50">
            110+ AI visibility audits run across local businesses,
            service companies, and niche brands.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function EvidenceMark({ tone }: { tone: "ok" | "warn" | "bad" }) {
  const map = {
    ok: { glyph: "✓", cls: "text-emerald-300" },
    warn: { glyph: "!", cls: "text-amber-300" },
    bad: { glyph: "✕", cls: "text-accent-glow" },
  } as const;
  const { glyph, cls } = map[tone];
  return (
    <span
      aria-hidden
      className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center text-xs font-bold ${cls}`}
    >
      {glyph}
    </span>
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

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <li>
      <details className="group py-6 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-6">
          <span className="text-lg font-medium leading-snug text-white">
            {q}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-2xl leading-none text-white/40 transition group-open:rotate-45"
          >
            +
          </span>
        </summary>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/65">
          {a}
        </p>
      </details>
    </li>
  );
}
