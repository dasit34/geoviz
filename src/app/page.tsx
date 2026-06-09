import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { VisibilitySignalField } from "@/components/VisibilitySignalField";
import { ScoringExamplePanel } from "@/components/ScoringExamplePanel";
import { ProviderMark } from "@/components/report/BrandMarks";

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
    body: "Whether AI can resolve one business, one identity from name, location, and structured details.",
  },
  {
    label: "Crawlability",
    body: "robots.txt, sitemap, canonical, meta-robots — whether AI systems can reach your pages.",
  },
  {
    label: "Trust signals",
    body: "Reviews, citations, and verifications tied to the business entity — not scattered.",
  },
  {
    label: "Retrieval readiness",
    body: "Structured content AI can quote when a customer asks for a recommendation.",
  },
  {
    label: "Recommendation confidence",
    body: "Whether AI has enough signal to cite you when it assembles an answer.",
  },
];

// The four directly-tested AI models — each scored on how clearly it
// interprets, trusts, and retrieves the business. Google AI Overviews is
// NOT one of these; it's a search-visibility surface shown separately as a
// derived readiness signal (see SEARCH_READINESS below).
const COMMAND_LANES = [
  { platform: "ChatGPT",    confidence: 0.86, detail: "Interprets clearly · trusted · retrievable" },
  { platform: "Claude",     confidence: 0.78, detail: "Interprets clearly · trusted · partial retrieval" },
  { platform: "Perplexity", confidence: 0.52, detail: "Interprets clearly · weak trust · partial retrieval" },
  { platform: "Gemini",     confidence: 0.24, detail: "Partial interpretation · weak trust · low retrieval" },
];

// AI-powered search visibility — analyzed, not directly model-tested.
// Shown as a readiness signal derived from structured-data, crawl access,
// and content depth, never as a fifth validated model score.
const SEARCH_READINESS = {
  surface: "Google AI Overviews",
  readiness: 0.16,
  detail: "Readiness signal · derived from structured data + crawl access + content depth",
};

// Multi-model credibility block — the four directly-tested AI systems, each
// framed by the interpretive question GeoViz answers for it. `provider` keys
// map to ProviderMark; `accent` reuses the report's per-provider top-border
// tokens so the homepage and the report read as one brand. AI Overviews is
// NOT here — it's the derived readiness note under the grid.
const MODEL_ENDPOINTS = [
  {
    provider: "openai",
    name: "ChatGPT",
    question: "Can it understand what you do?",
    label: "Understanding + recommendation confidence",
    accent: "border-t-severity-info",
  },
  {
    provider: "claude",
    name: "Claude",
    question: "Can it reason about your business clearly?",
    label: "Business interpretation + reasoning gaps",
    accent: "border-t-accent",
  },
  {
    provider: "gemini",
    name: "Gemini",
    question: "Can it recognize your entity and local relevance?",
    label: "Entity clarity + AI search readiness",
    accent: "border-t-accent-blue",
  },
  {
    provider: "perplexity",
    name: "Perplexity",
    question: "Can it find and cite enough evidence?",
    label: "Sourceability + citation confidence",
    accent: "border-t-cyan",
  },
];

const FIX_SCOPE = [
  "Machine-readable business identity",
  "AI retrieval readiness",
  "Cross-platform consistency alignment",
  "Before/after AI Visibility re-check",
];

const AUDIT_BULLETS = [
  "Cross-model AI Visibility analysis with a single readiness read",
  "The top 3 issues making you invisible to AI",
  "The top 3 fixes, ranked by impact",
  "Reviewed by a human before delivery",
  "Professional PDF intelligence brief",
];

const FOUNDATION_BULLETS = [
  "Machine-readable business identity",
  "Trust and verification signals AI systems look for",
  "Cross-platform entity alignment",
  "Before/after AI Visibility re-check",
];

const FAQS = [
  {
    q: "What is AI visibility?",
    a: "Whether AI assistants like ChatGPT, Claude, Gemini, and Perplexity can find, understand, and recommend your business when a customer asks them for help. It’s separate from where you rank on Google.",
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
    q: "What makes GeoViz different from other AI search tools?",
    a: "Most tools query one AI system. GeoViz analyzes your business across four — ChatGPT, Claude, Gemini, and Perplexity — and reports where they agree, where they diverge, and which sources they cite about you. The result is a multi-model read, not a single-model guess.",
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
          <div className="hidden items-center justify-end gap-4 border-b border-white/[0.06] py-3.5 md:flex">
            <span className="mono-data flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/40">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-cyan motion-safe:animate-pulseSoft"
              />
              <span>Sample run · directional</span>
            </span>
          </div>
        </div>

        <div className="container-page grid items-center gap-8 py-12 sm:gap-12 sm:py-20 md:py-28 lg:grid-cols-[minmax(0,46%)_minmax(0,54%)] lg:gap-16">
          <div>
            <p className="mono-data mb-4 max-w-md border-l border-accent/40 pl-4 text-[11px] uppercase leading-[1.6] tracking-[0.22em] text-white/55 sm:mb-6">
              Visibility is no longer just ranking. It’s interpretation.
            </p>
            <Thesis className="text-[2rem] leading-[1.1] sm:text-5xl sm:leading-[1.12] lg:text-[3.6rem]">
              Search is shifting from links to answers. We measure
              whether AI recommends your business.
            </Thesis>
            <p className="mt-5 max-w-lg text-base leading-[1.55] text-white/75 sm:mt-7 sm:text-lg sm:leading-[1.6]">
              ChatGPT, Claude, Gemini, and Perplexity each read your
              business differently. Our audit shows how clearly they
              can understand, trust, and surface you to a customer.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 sm:mt-9 sm:gap-x-6 sm:gap-y-4">
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

          </div>

          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-6 -inset-y-4 -z-10 bg-[radial-gradient(60%_70%_at_50%_50%,rgba(255,106,26,0.20),transparent_70%)] blur-2xl"
            />
            <FigurePlate n={1} caption="visibility resolution">
              <VisibilitySignalField className="mx-auto max-w-xl" />
            </FigurePlate>
          </div>
        </div>
      </section>

      {/* ── MULTI-MODEL CREDIBILITY (supporting block, unnumbered) ── */}
      <MultiModelTesting />

      {/* ── PRIMER · the shift (editorial context, unnumbered) ── */}
      <Section tone="light">
        <div className="flex items-center gap-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-graphite-500">
            The shift
          </span>
          <span className="h-px w-7 bg-graphite-400/30" aria-hidden />
        </div>
        <Thesis tone="light" className="mt-7 max-w-3xl text-3xl sm:text-4xl">
          AI search is changing how businesses get discovered.
        </Thesis>
        <div className="mt-8 grid max-w-3xl gap-5 text-[17px] leading-[1.6] text-graphite-700">
          <p>
            Customers are increasingly receiving synthesized answers
            instead of scrolling through lists of links. Visibility
            now depends on whether AI systems can correctly
            interpret, trust, and retrieve your business information.
          </p>
          <p>
            Local businesses are particularly affected as AI
            assistants become a primary recommendation channel for
            services customers used to find through search.
          </p>
        </div>
        <div className="mt-10 max-w-3xl border-t border-graphite-400/25 pt-5">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-graphite-500 sm:flex sm:flex-wrap sm:items-center">
            <span>ChatGPT</span>
            <span aria-hidden className="hidden text-graphite-400/60 sm:inline">·</span>
            <span>Claude</span>
            <span aria-hidden className="hidden text-graphite-400/60 sm:inline">·</span>
            <span>Gemini</span>
            <span aria-hidden className="hidden text-graphite-400/60 sm:inline">·</span>
            <span>Perplexity</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-graphite-500">
            All converging on answer-driven discovery.
          </p>
        </div>
      </Section>

      {/* ── §01 · WHAT AI SYSTEMS ACTUALLY SEE ─────────────────── */}
      <Section id="how-it-works" tone="light">
        <SectionIndex n={1} label="What AI sees" tone="light" />
        <SectionHeading tone="light">What AI systems actually see.</SectionHeading>
        <p className="mt-5 max-w-2xl text-lg leading-[1.55] text-graphite-700">
          Before AI can recommend you, it has to read you. Five
          interpretive dimensions determine whether AI systems
          understand, trust, and recommend your business.
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-lg border border-cream-200 bg-cream-200 md:grid-cols-2 lg:grid-cols-5">
          {DIMENSIONS.map((d) => (
            <div key={d.label} className="bg-cream-100 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.12em] text-graphite-900">
                {d.label}
              </p>
              <p className="mt-3 text-[15px] leading-[1.55] text-graphite-700">
                {d.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── §02 · CROSS-MODEL SIGNAL (sample snapshot) ─────────── */}
      <CommandCenter />

      {/* ── §03 · REPORT SHOWCASE (signal → brief) ─────────────── */}
      <Section tone="light">
        <SectionIndex n={3} label="What you get" tone="light" />
        <Thesis tone="light" className="mt-7 text-3xl sm:text-4xl">
          From signal to brief.
        </Thesis>
        <p className="mt-5 max-w-2xl text-xl leading-[1.55] text-graphite-700">
          Every audit produces a printed intelligence brief — the
          same multi-model analysis, authored for a real person to
          act on.
        </p>

        <div className="mt-14 grid gap-12 lg:grid-cols-2 lg:gap-16">
          <FigurePlate n={2} caption="AI visibility readout (sample)" tone="light">
            <div className="relative">
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-graphite-400">
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulseSoft"
                />
                <span className="mono-data">Scanning sample</span>
              </div>
              <ScoringExamplePanel />
            </div>
          </FigurePlate>

          <PrintedCoverSample />
        </div>

        <p className="mt-10 max-w-2xl text-sm text-graphite-500">
          Each report is reviewed by a person before it’s sent.
        </p>
      </Section>

      {/* ── §04 · FOUNDATION FIX (AI-readable infrastructure layer) ── */}
      <Section>
        <SectionIndex n={4} label="Foundation Fix" />
        <p className="mt-5 max-w-2xl text-lg leading-[1.55] text-white/70">
          AI visibility infrastructure. Installed once; understood
          across every AI retrieval system.
        </p>
        <div className="mt-10 grid gap-14 lg:grid-cols-[minmax(0,46%)_minmax(0,54%)] lg:gap-16">
          <div>
            <SectionHeading>Installed for you.</SectionHeading>
            <p className="mt-5 text-lg leading-[1.55] text-white/70">
              We build the AI visibility infrastructure that addresses
              the underlying technical, trust, and discoverability gaps
              surfaced in your audit — then re-check how AI systems
              read your business.
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

      {/* ── §05 · PRICING (editorial light spread) ─────────────── */}
      <section
        id="pricing"
        className="relative scroll-mt-20 border-t border-cream-200 bg-cream-50"
      >
        <div className="container-page py-32 md:py-40">
          <SectionIndex n={5} label="Pricing" tone="light" />
          <Thesis tone="light" className="mt-7 text-3xl sm:text-4xl">
            Start with the audit. Fix it when you’re ready.
          </Thesis>

          <div className="mt-16 grid gap-12 lg:grid-cols-[minmax(0,58%)_minmax(0,42%)] lg:gap-20">
            <div className="relative">
              <div className="rounded-lg border border-cream-200 border-t-[3px] border-t-accent/70 bg-cream-100 p-6">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-graphite-400">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-accent"
                  />
                  <span className="mono-data">Open · single audit</span>
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-graphite-400">
                  AI Visibility Audit
                </p>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="mono-data text-6xl font-bold tracking-tight text-graphite-900">
                    $97
                  </span>
                </div>
                <p className="mt-2 text-sm text-graphite-500">
                  Cross-model analysis across ChatGPT, Claude, Gemini,
                  and Perplexity · delivered by email, typically
                  within minutes.
                </p>
                <ul className="mt-9 space-y-3.5 text-sm text-graphite-700">
                  {AUDIT_BULLETS.map((b) => (
                    <PricingBullet key={b} tone="light">{b}</PricingBullet>
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

            <div className="flex flex-col justify-center border-t border-cream-200 pt-10 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-graphite-400">
                Foundation Fix
              </p>
              <div className="mt-5 flex items-baseline gap-3">
                <span className="mono-data text-4xl font-bold tracking-tight text-graphite-900">
                  $497
                </span>
                <span className="text-sm text-graphite-500">
                  one-time · 3–5 business days
                </span>
              </div>
              <p className="mt-5 max-w-md text-base leading-[1.55] text-graphite-700">
                AI visibility infrastructure installed for you and
                re-checked.
              </p>
              <Link
                href="/foundation-fix"
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-graphite-700 underline-offset-4 transition-colors hover:text-graphite-900 hover:underline"
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
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 bg-[radial-gradient(60%_100%_at_50%_100%,rgba(255,106,26,0.08),transparent_70%)]"
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
          <div className="mx-auto mt-10 flex max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
            <span>Cross-model analysis</span>
            <span aria-hidden className="text-white/30">·</span>
            <span>Human-reviewed PDF brief</span>
            <span aria-hidden className="text-white/30">·</span>
            <span>Delivered by email</span>
          </div>
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
  tone = "dark",
  children,
}: {
  id?: string;
  weight?: "feature" | "support";
  tone?: "dark" | "light";
  children: React.ReactNode;
}) {
  const pad = weight === "feature" ? "py-32 md:py-40" : "py-24 md:py-32";
  const surface =
    tone === "light"
      ? "border-t border-cream-200 bg-cream-50"
      : "border-t border-white/[0.06] bg-ink-950";
  return (
    <section
      id={id}
      className={`relative ${surface} ${id ? "scroll-mt-20" : ""}`}
    >
      <div className={`container-page ${pad}`}>{children}</div>
    </section>
  );
}

function SectionIndex({
  n,
  label,
  tone = "dark",
}: {
  n: number;
  label: string;
  tone?: "dark" | "light";
}) {
  const num =
    tone === "light"
      ? "mono-data text-[11px] font-semibold tracking-[0.18em] text-graphite-400"
      : "mono-data text-[11px] font-semibold tracking-[0.18em] text-white/35";
  const rule =
    tone === "light" ? "h-px w-7 bg-graphite-400/30" : "h-px w-7 bg-white/15";
  const text =
    tone === "light"
      ? "text-[11px] font-semibold uppercase tracking-[0.22em] text-graphite-500"
      : "text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45";
  return (
    <div className="flex items-center gap-3.5">
      {n > 0 ? <span className={num}>§{String(n).padStart(2, "0")}</span> : null}
      <span className={rule} aria-hidden />
      <span className={text}>{label}</span>
    </div>
  );
}

function SectionHeading({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "light";
}) {
  const color = tone === "light" ? "text-graphite-900" : "text-white";
  return (
    <h2
      className={`mt-5 max-w-2xl text-3xl font-bold tracking-tight ${color} sm:text-4xl md:text-5xl`}
    >
      {children}
    </h2>
  );
}

function Thesis({
  children,
  className = "",
  tone = "dark",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "dark" | "light";
}) {
  const color = tone === "light" ? "text-graphite-900" : "text-white";
  return (
    <h2
      className={`font-serif font-medium leading-[1.12] tracking-tight ${color} ${className}`}
    >
      {children}
    </h2>
  );
}

function FigurePlate({
  n,
  caption,
  source = "Derived from publicly accessible website and trust signals.",
  tone = "dark",
  children,
  className = "",
}: {
  n: number;
  caption: string;
  source?: string;
  tone?: "dark" | "light";
  children: React.ReactNode;
  className?: string;
}) {
  const rule = tone === "light" ? "border-graphite-400/25" : "border-white/[0.06]";
  const captionText =
    tone === "light"
      ? "mono-data text-[11px] font-semibold tracking-[0.14em] text-graphite-500"
      : "mono-data text-[11px] font-semibold tracking-[0.14em] text-white/45";
  const sourceText =
    tone === "light"
      ? "text-[11px] leading-relaxed text-graphite-400"
      : "text-[11px] leading-relaxed text-white/30";
  return (
    <figure className={`m-0 ${className}`}>
      {children}
      <figcaption className={`mt-4 flex flex-col gap-1 border-t ${rule} pt-3`}>
        <span className={captionText}>
          Figure {String(n).padStart(2, "0")} — {caption}
        </span>
        <span className={sourceText}>{source}</span>
      </figcaption>
    </figure>
  );
}

function CheckMark({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const cls =
    tone === "light"
      ? "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cream-200 bg-cream-50 text-graphite-700"
      : "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-white/70";
  return (
    <span className={cls}>
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

function PricingBullet({
  children,
  tone = "dark",
}: {
  children: React.ReactNode;
  tone?: "dark" | "light";
}) {
  return (
    <li className="flex items-start gap-3">
      <CheckMark tone={tone} />
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
 * Multi-model credibility block (supporting, unnumbered) — sits directly
 * under the hero to prove GeoViz is *tested across* the major AI systems,
 * not a generic SEO scan. Four provider endpoints, each with the
 * interpretive question GeoViz answers, then the derived AI-Overviews note
 * and a CTA line that routes into the $97 audit. Defensible language only
 * ("tested/checked across" — never partnered/integrated/guaranteed).
 */
function MultiModelTesting() {
  return (
    <Section>
      <SectionIndex n={0} label="Multi-model AI visibility testing" />
      <SectionHeading>
        Tested across the AI systems customers actually use.
      </SectionHeading>
      <p className="mt-5 max-w-2xl text-lg leading-[1.55] text-white/70">
        GeoViz checks how your business is understood across ChatGPT, Claude,
        Gemini, and Perplexity — then turns those findings into a clear
        visibility score, evidence review, and priority fix plan.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {MODEL_ENDPOINTS.map((m) => (
          <div
            key={m.provider}
            className={`flex flex-col rounded-lg border border-white/10 ${m.accent} border-t-2 bg-ink-900/60 p-5 shadow-card backdrop-blur-sm`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <ProviderMark provider={m.provider} size={26} />
                <span className="font-display text-base font-semibold text-white">
                  {m.name}
                </span>
              </span>
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 rounded-full bg-cyan motion-safe:animate-pulseSoft"
              />
            </div>
            <p className="mt-4 text-[15px] font-medium leading-[1.5] text-white/85">
              {m.question}
            </p>
            <p className="mono-data mt-3 text-[10.5px] font-semibold uppercase leading-[1.5] tracking-[0.16em] text-white/45">
              {m.label}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-6 max-w-3xl text-sm leading-[1.6] text-white/50">
        Google AI Overviews readiness is evaluated as a derived visibility
        signal based on crawlability, structured data, entity clarity, content
        depth, and trust evidence.
      </p>

      <div className="mt-10 flex flex-col gap-4 border-t border-white/[0.08] pt-7 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-[17px] font-medium leading-[1.5] text-white/80">
          If AI systems cannot clearly identify, verify, and source your
          business, they are less likely to recommend it.
        </p>
        <Link
          href="/order"
          className="text-sm font-medium text-accent underline-offset-4 transition-colors hover:underline"
        >
          Run AI Visibility Audit
        </Link>
      </div>
    </Section>
  );
}

/**
 * §02 Cross-model signal — sample AI Visibility Snapshot showing
 * recommendation signals + query response paths for one fictional
 * business (North Coast Roofing). Two stacked panels under one
 * dateline. Outcome language (Interprets / Trusts / Recommends);
 * no console chrome. Status from cyan + opacity tiers (no rainbow).
 * One pulsing pip in the dateline; panel-head pips are static.
 */
function CommandCenter() {
  return (
    <Section>
      <SectionIndex n={2} label="Cross-model signal" />
      <SectionHeading>
        How different AI systems interpret and retrieve the same business.
      </SectionHeading>
      <p className="mt-5 max-w-2xl text-lg leading-[1.55] text-white/70">
        Directly tested across ChatGPT, Claude, Gemini, and Perplexity, with
        additional analysis for AI-powered search visibility, including Google
        AI Overviews. Every value is directional sample data.
      </p>

      <div className="mt-12 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-ink-950 to-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] px-6 py-3 text-[11px]">
          <span className="mono-data font-semibold uppercase tracking-[0.2em] text-white/55">
            North Coast Roofing · northcoastroofing.com
          </span>
          <span className="mono-data flex items-center gap-2 uppercase tracking-[0.18em] text-white/40">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-cyan motion-safe:animate-pulseSoft"
            />
            <span>Sample · directional</span>
          </span>
        </div>

        <div className="p-6 lg:p-8">
          <p className="mono-data mb-3 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/45">
            Directly tested AI models
          </p>
          <ul className="space-y-2">
            {COMMAND_LANES.map((lane) => (
              <li
                key={lane.platform}
                className="grid items-center gap-x-3 gap-y-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 text-sm grid-cols-[minmax(0,96px)_minmax(0,1fr)] md:grid-cols-[minmax(0,140px)_minmax(0,1fr)_minmax(0,260px)] md:gap-x-4"
              >
                <span className="text-base font-medium text-white/85">
                  {lane.platform}
                </span>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full ${
                      lane.confidence >= 0.8
                        ? "bg-cyan"
                        : lane.confidence >= 0.65
                          ? "bg-cyan/55"
                          : lane.confidence >= 0.45
                            ? "bg-white/35"
                            : "bg-white/20"
                    }`}
                    style={{
                      width: `${Math.round(lane.confidence * 100)}%`,
                    }}
                  />
                </div>
                <span className="col-span-2 text-[12px] leading-relaxed text-white/60 md:col-span-1">
                  {lane.detail}
                </span>
              </li>
            ))}
          </ul>

          {/* AI-powered search visibility — analyzed, not directly model-tested.
              Rendered as a distinct readiness lane (orange "READINESS" tag, no
              model-confidence bar) so it never reads as a fifth scored model. */}
          <p className="mono-data mb-3 mt-7 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/45">
            AI search visibility
          </p>
          <div className="grid items-center gap-x-3 gap-y-2 rounded-md border border-accent/25 bg-accent/[0.04] px-4 py-3.5 text-sm grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto] md:gap-x-4">
            <span className="text-base font-medium text-white/85">
              {SEARCH_READINESS.surface}
            </span>
            <span className="col-span-2 text-[12px] leading-relaxed text-white/60 md:col-span-1 md:order-2">
              {SEARCH_READINESS.detail}
            </span>
            <span className="mono-data justify-self-end rounded-sm border border-accent/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent md:order-3">
              Readiness
            </span>
          </div>

          <p className="mt-8 text-[12px] text-white/40">
            Sample data · directional · no live measurement of your business.
            Google AI Overviews is a search-visibility readiness signal, not a
            directly tested model.
          </p>
        </div>
      </div>
    </Section>
  );
}

/**
 * §03 Report Showcase — the "delivered" side of the pair. Cover-page
 * mock framed as the executive intelligence brief that arrives by
 * email. Deliberately holds no score — the score lives on the
 * analytical card to its left. This card communicates the deliverable
 * (PDF, page count, reviewed-by-a-person, delivery channel), not a
 * second scorecard.
 */
function PrintedCoverSample() {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-900/80 p-8 md:p-10">
      <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.08] pb-4">
        <span className="mono-data text-[11px] font-semibold uppercase tracking-[0.2em] text-white/55">
          Delivered executive intelligence brief
        </span>
        <span className="mono-data text-[11px] uppercase tracking-[0.18em] text-white/35">
          Sample
        </span>
      </div>

      <h3 className="mt-8 text-2xl font-bold tracking-tight text-white">
        North Coast Roofing
      </h3>
      <p className="mt-1 text-sm text-white/45">northcoastroofing.com</p>

      <p className="mt-8 max-w-sm text-sm leading-[1.6] text-white/55">
        Directional assessment based on publicly accessible website
        and trust signals. Not a ranking guarantee.
      </p>

      <div className="mt-8 rounded-md border border-white/[0.08] bg-white/[0.02] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Delivered as
        </p>
        <ul className="mt-3 grid gap-2 text-sm text-white/75">
          <li>PDF intelligence brief · approximately 6 pages</li>
          <li>Reviewed by a person before delivery</li>
          <li>Sent by email, typically within minutes</li>
        </ul>
      </div>

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
            AVA-7F3A
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
