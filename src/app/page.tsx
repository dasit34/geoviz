import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { VisibilitySignalField } from "@/components/VisibilitySignalField";
import { ScoringExamplePanel } from "@/components/ScoringExamplePanel";

/**
 * Homepage — C2 Command Center rebuild. Presentation-only.
 *
 * Spine: dark operational command-center aesthetic + editorial
 * intelligence-briefing structure. Strict palette (obsidian · amber ·
 * cyan-telemetry-only · ink/white opacity tiers — no rainbow). Three
 * illuminated focal anchors (hero artifact · §03 live readout · §05
 * pricing primary). Four motion-safe pulses total. Mobile responsive.
 *
 * Binding copy contracts (scripts/test-report-copy-defensibility.ts
 * reads this file): the phrases "underlying technical, trust, and
 * discoverability gaps", "$497", "3–5 business days", and "complex
 * sites may require custom scoping" must remain verbatim. Section ids
 * how-it-works / pricing / faq are Header anchors — keep them.
 *
 * Routes / backend / scoring / report flow untouched — marketing
 * surface only. No DB / API / Stripe / worker changes.
 */

const DIMENSIONS = [
  {
    label: "Entity clarity",
    body: "Can AI resolve who you are — one business, one identity — from your name, location, and structured details?",
  },
  {
    label: "Crawlability",
    body: "Can AI systems actually reach your pages? robots.txt, sitemap, canonical, and meta-robots.",
  },
  {
    label: "Trust signals",
    body: "Are reviews, citations, and verifications tied to your business entity — not scattered or unverifiable?",
  },
  {
    label: "Retrieval readiness",
    body: "Is there clear, structured content AI can quote you from when a customer asks for a recommendation?",
  },
  {
    label: "Recommendation confidence",
    body: "When AI assembles an answer, does it have enough signal to cite you with confidence?",
  },
];

const COMMAND_LANES = [
  { platform: "ChatGPT", confidence: 0.86, detail: "identify ✓ · trust ✓ · retrieve ✓" },
  { platform: "Claude", confidence: 0.78, detail: "identify ✓ · trust ✓ · retrieve ⚠" },
  { platform: "Perplexity", confidence: 0.52, detail: "identify ✓ · trust ⚠ · retrieve ⚠" },
  { platform: "Gemini", confidence: 0.24, detail: "identify ⚠ · trust ✗ · retrieve ✗" },
  { platform: "AI Overviews", confidence: 0.16, detail: "identify ✗ · trust ✗ · retrieve ✗" },
];

const COMMAND_TRACES = [
  {
    platform: "ChatGPT",
    query: "best local roofer near me",
    steps: [
      { step: "identify", state: "resolved", note: "sample-business.example" },
      { step: "trust", state: "partial", note: "review schema absent" },
      { step: "retrieve", state: "blocked", note: "candidate not surfaced" },
    ],
  },
  {
    platform: "Claude",
    query: "reliable roofing company",
    steps: [
      { step: "identify", state: "resolved", note: "name matched" },
      { step: "trust", state: "resolved", note: "NAP consistent" },
      { step: "retrieve", state: "partial", note: "thin service-page content" },
    ],
  },
];

const FIX_SCOPE = [
  "Structured business identity (LocalBusiness schema) implemented or repaired",
  "llms.txt created for AI systems",
  "robots.txt tuned for AI crawler access",
  "Homepage and service-page clarity improvements",
  "FAQ structure built for AI readability",
  "Before / after GeoViz re-check",
];

const AUDIT_BULLETS = [
  "Your AI Visibility Score (0–100) with what it means",
  "The top 3 issues making you invisible to AI",
  "The top 3 fixes, ranked by impact",
  "Reviewed by a human before delivery",
  "Professional PDF intelligence brief",
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

      {/* ── HERO · operational dateline · illuminated signal field ── */}
      <section className="relative overflow-hidden border-b border-white/[0.06]">
        <div className="absolute inset-0 -z-10 bg-radial-orange" />
        <div className="absolute inset-0 -z-10 grid-bg opacity-60" />

        <div className="container-page">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3.5">
            <span className="mono-data text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
              GeoViz · AI Visibility Intelligence
            </span>
            <span className="mono-data flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/40">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-cyan motion-safe:animate-pulseSoft"
              />
              <span>Sample run · directional</span>
            </span>
          </div>
        </div>

        <div className="container-page grid items-center gap-14 py-24 md:py-36 lg:grid-cols-[minmax(0,46%)_minmax(0,54%)] lg:gap-16">
          <div>
            <SectionIndex n={0} label="The stakes" />
            <Thesis className="mt-7 text-4xl sm:text-5xl lg:text-[3.6rem]">
              When customers ask ChatGPT who to hire, does your business
              show up?
            </Thesis>
            <p className="mt-7 max-w-md text-lg leading-relaxed text-white/70">
              AI systems can’t recommend what they can’t understand.
              GeoViz measures how clearly AI reads, trusts, and
              recommends your business.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Link href="/order" className="btn-primary text-base">
                Run AI Visibility Audit
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/sample-report"
                className="text-sm font-medium text-white/65 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                View sample report
              </Link>
            </div>

            <p className="mt-7 text-sm text-white/45">
              Early access —{" "}
              <span className="font-semibold text-white/80">$97</span>{" "}
              <span className="text-white/30">·</span> normally{" "}
              <span className="line-through">$147</span>
            </p>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 bg-[radial-gradient(60%_70%_at_50%_50%,rgba(255,122,24,0.20),transparent_70%)] blur-2xl"
            />
            <FigurePlate n={1} caption="visibility resolution">
              <VisibilitySignalField className="mx-auto max-w-xl" />
            </FigurePlate>
          </div>
        </div>
      </section>

      {/* ── §01 · WHAT AI SYSTEMS ACTUALLY SEE ─────────────────── */}
      <Section id="how-it-works">
        <SectionIndex n={1} label="What AI sees" />
        <SectionHeading>What AI systems actually see.</SectionHeading>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/65">
          Before AI recommends a business, it has to read it. Five
          diagnostic dimensions decide whether your business is
          understandable, trustworthy, and recommendable when a
          customer asks.
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-white/10 bg-white/[0.06] md:grid-cols-2 lg:grid-cols-5">
          {DIMENSIONS.map((d, i) => (
            <div key={d.label} className="bg-ink-900/60 p-6">
              <p className="mono-data text-[10px] font-semibold tracking-[0.18em] text-white/35">
                DIM 0{i + 1}
              </p>
              <p className="mt-3 text-sm font-semibold uppercase tracking-[0.12em] text-white/85">
                {d.label}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/60">
                {d.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── §02 · COMMAND CENTER (operational workspace) ──────── */}
      <CommandCenter />

      {/* ── §03 · REPORT SHOWCASE (signal → brief) ─────────────── */}
      <Section>
        <SectionIndex n={3} label="What you get" />
        <Thesis className="mt-7 text-3xl sm:text-4xl">
          From signal to brief.
        </Thesis>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/65">
          The instrument produces a printed intelligence brief — same
          data, authored for a customer to act on.
        </p>

        <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <FigurePlate n={2} caption="AI visibility readout (sample)">
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-x-4 -inset-y-4 -z-10 bg-[radial-gradient(60%_70%_at_50%_50%,rgba(255,122,24,0.16),transparent_70%)] blur-2xl"
              />
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/45">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-cyan motion-safe:animate-pulseSoft"
                />
                <span className="mono-data">Scanning sample</span>
              </div>
              <ScoringExamplePanel />
            </div>
          </FigurePlate>

          <PrintedCoverSample />
        </div>

        <p className="mt-10 max-w-2xl text-sm text-white/45">
          Each report is reviewed by a person before it’s sent.
        </p>
      </Section>

      {/* ── §04 · FOUNDATION FIX (AI-readable infrastructure layer) ── */}
      <Section>
        <SectionIndex n={4} label="Foundation Fix" />
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-white/60">
          An AI-readable infrastructure layer. Installed once; reads
          across every AI retrieval system.
        </p>
        <div className="mt-10 grid gap-14 lg:grid-cols-[minmax(0,46%)_minmax(0,54%)] lg:gap-16">
          <div>
            <SectionHeading>Don’t want to fix it yourself?</SectionHeading>
            <p className="mt-5 text-lg leading-relaxed text-white/70">
              We install the AI-readable layer that addresses the
              underlying technical, trust, and discoverability gaps
              surfaced in your audit — then re-check the result so you
              can see the difference.
            </p>
            <div className="mt-7 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-white/10 bg-white/[0.03] px-4 py-2 text-sm">
              <span className="mono-data font-semibold text-white">
                $497
              </span>
              <span className="text-white/30">·</span>
              <span className="text-white/65">one-time</span>
              <span className="text-white/30">·</span>
              <span className="text-white/65">3–5 business days</span>
            </div>
            <p className="mt-5 max-w-md text-xs leading-relaxed text-white/45">
              Scoped engagement — not a website rebuild. Complex sites
              may require custom scoping; we’ll quote upfront.
            </p>
            <Link
              href="/foundation-fix"
              className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-white/65 underline-offset-4 transition-colors hover:text-white hover:underline"
            >
              Learn about the Foundation Fix
              <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="rounded-lg border border-white/15 bg-ink-900/60 p-6 shadow-card backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
              What we install
            </p>
            <ul className="mt-6 space-y-4 text-sm">
              {FIX_SCOPE.map((s) => (
                <li key={s} className="flex items-start gap-3">
                  <CheckMark />
                  <span className="leading-relaxed text-white/75">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* ── §05 · PRICING (illuminated primary plate) ──────────── */}
      <section
        id="pricing"
        className="relative scroll-mt-20 border-t border-white/[0.06] bg-ink-950"
      >
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-32 md:py-40">
          <SectionIndex n={5} label="Pricing" />
          <Thesis className="mt-7 text-3xl sm:text-4xl">
            Start with the audit. Fix it when you’re ready.
          </Thesis>

          <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,58%)_minmax(0,42%)] lg:gap-20">
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-6 -z-10 bg-[radial-gradient(60%_60%_at_50%_50%,rgba(255,122,24,0.20),transparent_75%)] blur-2xl"
              />
              <div className="rounded-lg border border-white/15 bg-ink-900/60 p-6 backdrop-blur-sm shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.04),0_0_140px_-50px_rgba(255,122,24,0.22)]">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/45">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-cyan"
                  />
                  <span className="mono-data">Open · early access</span>
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                  AI Visibility Audit
                </p>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="mono-data text-6xl font-bold tracking-tight text-white">
                    $97
                  </span>
                  <span className="text-base text-white/30 line-through">
                    $147
                  </span>
                </div>
                <p className="mt-2 text-sm text-white/55">
                  Early access pricing · delivered by email, typically
                  within minutes.
                </p>
                <ul className="mt-9 space-y-3.5 text-sm text-white/80">
                  {AUDIT_BULLETS.map((b) => (
                    <PricingBullet key={b}>{b}</PricingBullet>
                  ))}
                </ul>
                <Link
                  href="/order"
                  className="btn-primary mt-10 w-full text-base sm:w-auto"
                >
                  Run AI Visibility Audit
                  <span aria-hidden>→</span>
                </Link>
              </div>
            </div>

            <div className="flex flex-col justify-center border-t border-white/10 pt-10 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                Foundation Fix
              </p>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="mono-data text-4xl font-bold tracking-tight text-white/85">
                  $497
                </span>
                <span className="text-sm text-white/45">
                  one-time · 3–5 business days
                </span>
              </div>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">
                Don’t want to fix it yourself? We install the
                AI-readable layer that addresses the underlying technical, trust, and discoverability gaps surfaced in your audit.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-white/75">
                {FOUNDATION_BULLETS.map((b) => (
                  <PricingBullet key={b}>{b}</PricingBullet>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-relaxed text-white/45">
                Scoped engagement — not a website rebuild. Complex sites
                may require custom scoping; we’ll quote upfront.
              </p>
              <Link
                href="/foundation-fix"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white/65 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                Learn about the Foundation Fix
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── §06 · QUESTIONS ────────────────────────────────────── */}
      <Section id="faq">
        <SectionIndex n={6} label="Questions" />
        <SectionHeading>Questions, answered.</SectionHeading>
        <ul className="mt-12 max-w-3xl divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {FAQS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </ul>
      </Section>

      {/* ── CLOSE · serif thesis · dateline echo · ambient floor ── */}
      <section className="relative border-t border-white/[0.06] bg-ink-950">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(255,122,24,0.08),transparent_70%)]"
        />
        <div className="container-page py-32 text-center md:py-40">
          <Thesis className="mx-auto max-w-3xl text-3xl sm:text-4xl">
            Find out if AI is recommending you — or a competitor.
          </Thesis>
          <div className="mt-10 flex justify-center">
            <Link href="/order" className="btn-primary text-base">
              Run AI Visibility Audit
              <span aria-hidden>→</span>
            </Link>
          </div>
          <p className="mx-auto mt-8 flex max-w-xl items-center justify-center gap-2 text-sm leading-relaxed text-white/45">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-cyan motion-safe:animate-pulseSoft"
            />
            <span>
              110+ AI visibility audits run across local businesses,
              service companies, and niche brands.
            </span>
          </p>
        </div>
        <div className="container-page">
          <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] py-3.5">
            <span className="mono-data text-[11px] font-semibold uppercase tracking-[0.2em] text-white/40">
              GeoViz · AI Visibility Intelligence
            </span>
            <span className="mono-data text-[11px] uppercase tracking-[0.2em] text-white/30">
              Visibility infrastructure for the AI search era
            </span>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}

/* ── editorial / command-center primitives ───────────────────── */

function Section({
  id,
  weight = "support",
  children,
}: {
  id?: string;
  weight?: "feature" | "support";
  children: React.ReactNode;
}) {
  const pad = weight === "feature" ? "py-32 md:py-40" : "py-20 md:py-24";
  return (
    <section
      id={id}
      className={`relative border-t border-white/[0.06] bg-ink-950 ${
        id ? "scroll-mt-20" : ""
      }`}
    >
      <div className={`container-page ${pad}`}>{children}</div>
    </section>
  );
}

function SectionIndex({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex items-center gap-3.5">
      {n > 0 ? (
        <span className="mono-data text-[11px] font-semibold tracking-[0.18em] text-white/35">
          §{String(n).padStart(2, "0")}
        </span>
      ) : null}
      <span className="h-px w-7 bg-white/15" aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
        {label}
      </span>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
      {children}
    </h2>
  );
}

function Thesis({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`font-serif font-medium leading-[1.12] tracking-tight text-white ${className}`}
    >
      {children}
    </h2>
  );
}

function FigurePlate({
  n,
  caption,
  source = "Derived from publicly accessible website and trust signals.",
  children,
  className = "",
}: {
  n: number;
  caption: string;
  source?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <figure className={`m-0 ${className}`}>
      {children}
      <figcaption className="mt-4 flex flex-col gap-1 border-t border-white/[0.06] pt-3">
        <span className="mono-data text-[11px] font-semibold tracking-[0.14em] text-white/45">
          Figure {String(n).padStart(2, "0")} — {caption}
        </span>
        <span className="text-[11px] leading-relaxed text-white/30">
          {source}
        </span>
      </figcaption>
    </figure>
  );
}

function CheckMark() {
  return (
    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70">
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
  );
}

function PricingBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <CheckMark />
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

/**
 * §02 Command Center — operational workspace shell with two docked
 * panels: visibility lanes and retrieval traces. Mono-throughout,
 * sample-labeled, status from cyan + opacity tiers (no rainbow). One
 * pulsing pip in the workspace dateline; panel-head pips are static.
 */
function CommandCenter() {
  return (
    <Section>
      <SectionIndex n={2} label="Operational readout" />
      <SectionHeading>
        How AI is interpreting a sample business, right now.
      </SectionHeading>
      <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/65">
        A sample run through the GeoViz pipeline. Every value below is
        directional sample data — labeled as such.
      </p>

      <div className="mt-12 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-ink-950 to-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-6 py-3 text-[11px]">
          <span className="mono-data font-semibold uppercase tracking-[0.2em] text-white/40">
            operational readout · workspace
          </span>
          <span className="mono-data flex items-center gap-2 uppercase tracking-[0.18em] text-white/40">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-cyan motion-safe:animate-pulseSoft"
            />
            <span>sample run · GEO-7F3A</span>
          </span>
        </div>

        <div className="grid lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
          <aside className="border-b border-white/[0.06] p-6 text-xs lg:border-b-0 lg:border-r">
            <p className="mono-data text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              Subject
            </p>
            <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3">
              <p className="text-sm font-semibold text-white/80">
                sample-business.example
              </p>
              <p className="mono-data mt-1 text-[10px] uppercase tracking-[0.18em] text-white/40">
                entity · GEO-7F3A
              </p>
            </div>

            <p className="mono-data mt-7 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/35">
              Run history
            </p>
            <ul className="mono-data mt-3 space-y-1.5 text-white/40">
              <li>· 2026-05-19 (sample)</li>
              <li>· 2026-05-12 (sample)</li>
              <li>· 2026-04-30 (sample)</li>
            </ul>
          </aside>

          <div className="p-6 lg:p-8">
            <div>
              <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/45">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-cyan"
                />
                <span className="mono-data">Panel — visibility lanes</span>
              </div>
              <ul className="space-y-2">
                {COMMAND_LANES.map((lane) => (
                  <li
                    key={lane.platform}
                    className="grid items-center gap-x-4 gap-y-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm md:grid-cols-[minmax(0,120px)_minmax(0,1fr)_minmax(0,200px)]"
                  >
                    <span className="font-medium text-white/85">
                      {lane.platform}
                    </span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className={`h-full rounded-full ${
                          lane.confidence >= 0.7
                            ? "bg-cyan"
                            : lane.confidence >= 0.5
                              ? "bg-white/35"
                              : "bg-white/20"
                        }`}
                        style={{
                          width: `${Math.round(lane.confidence * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="mono-data text-[11px] uppercase tracking-[0.14em] text-white/55">
                      {lane.detail}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-10">
              <div className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/45">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-cyan"
                />
                <span className="mono-data">Panel — retrieval traces</span>
              </div>
              <div className="space-y-4">
                {COMMAND_TRACES.map((trace) => (
                  <div
                    key={trace.platform}
                    className="rounded-md border border-white/[0.06] bg-white/[0.02] p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-white/50">
                      <span className="mono-data">
                        trace · {trace.platform}
                      </span>
                      <span className="text-white/35">
                        query “{trace.query}”
                      </span>
                    </div>
                    <ul className="mono-data mt-3 space-y-1.5 text-xs text-white/65">
                      {trace.steps.map((step) => (
                        <li
                          key={step.step}
                          className="grid grid-cols-[auto_minmax(0,80px)_minmax(0,80px)_1fr] gap-3"
                        >
                          <span className="text-white/30">└─▸</span>
                          <span className="text-white/55">{step.step}</span>
                          <span
                            className={
                              step.state === "resolved"
                                ? "text-white/85"
                                : step.state === "partial"
                                  ? "text-white/55"
                                  : "text-white/35"
                            }
                          >
                            {step.state}
                          </span>
                          <span className="text-white/40">{step.note}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-8 text-[11px] uppercase tracking-[0.18em] text-white/30">
              ─ sample data · directional · no live measurement of the visitor ─
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * §03 Report Showcase — the printed-brief sample paired with the live
 * readout. Restrained, paper-like, no glow. Deliberately the *unlit*
 * counterpart to the illuminated live readout on the left.
 */
function PrintedCoverSample() {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/80 p-8 md:p-10">
      <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.08] pb-4">
        <span className="mono-data text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
          GeoViz Intelligence
        </span>
        <span className="mono-data text-[11px] uppercase tracking-[0.18em] text-white/35">
          Report · sample
        </span>
      </div>

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
        AI Visibility Intelligence Report
      </p>
      <h3 className="mt-3 text-2xl font-bold tracking-tight text-white">
        Sample Business
      </h3>
      <p className="mt-1 text-sm text-white/45">yourbusiness.com</p>

      <div className="mt-10 flex items-baseline gap-4">
        <span className="mono-data text-5xl font-bold text-white">61</span>
        <span className="mono-data text-lg text-white/35">/ 100</span>
      </div>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        Needs Work
      </p>

      <p className="mt-7 max-w-sm text-sm leading-relaxed text-white/55">
        Directional assessment based on publicly accessible website
        and trust signals. Not a ranking guarantee.
      </p>

      <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/[0.06] pt-6">
        <div>
          <dt className="mono-data text-[10px] uppercase tracking-[0.18em] text-white/35">
            Generated
          </dt>
          <dd className="mt-1 text-sm text-white/75">2026-05-19</dd>
        </div>
        <div>
          <dt className="mono-data text-[10px] uppercase tracking-[0.18em] text-white/35">
            Report ID
          </dt>
          <dd className="mono-data mt-1 text-sm text-white/75">
            GEO-7F3A
          </dd>
        </div>
        <div>
          <dt className="mono-data text-[10px] uppercase tracking-[0.18em] text-white/35">
            Delivery
          </dt>
          <dd className="mt-1 text-sm text-white/75">Human-reviewed</dd>
        </div>
        <div>
          <dt className="mono-data text-[10px] uppercase tracking-[0.18em] text-white/35">
            Format
          </dt>
          <dd className="mt-1 text-sm text-white/75">PDF brief</dd>
        </div>
      </dl>

      <p className="mt-8 text-[10px] uppercase tracking-[0.2em] text-white/30">
        — printed cover · sample —
      </p>
    </div>
  );
}
