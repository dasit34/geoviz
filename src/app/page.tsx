import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ReportPreview } from "@/components/ReportPreview";

const PLATFORMS = ["ChatGPT", "Claude", "Perplexity", "Gemini", "AI Overviews"];

const CHECKS = [
  {
    title: "AI Readability",
    body: "How easily AI systems can retrieve and interpret your site structure and content.",
  },
  {
    title: "Machine-Readable Business Identity",
    body: "Whether structured business data tells AI clearly who you are, what you do, and where you serve.",
  },
  {
    title: "Crawl Accessibility",
    body: "Whether the AI crawlers behind ChatGPT, Claude, Perplexity, and Gemini can actually reach your pages.",
  },
  {
    title: "Trust Signals",
    body: "Reviews, citations, and consistent business info that make AI confident enough to recommend you.",
  },
  {
    title: "Recommendation Readiness",
    body: "Whether your site has the depth and clarity AI needs to name you when a customer asks for help.",
  },
];

export default function Page() {
  return (
    <main>
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-radial-orange" />
        <div className="absolute inset-0 -z-10 grid-bg opacity-[0.35]" />
        <div className="container-page grid gap-10 py-20 md:grid-cols-[1.15fr_1fr] md:py-28 md:gap-16">
          <div>
            <span className="pill animate-pulseSoft">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> AI
              Visibility Intelligence
            </span>
            <h1 className="h1 mt-5">
              Understand how{" "}
              <span className="bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
                AI
              </span>{" "}
              systems see your business.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              GeoViz audits whether AI systems can understand, crawl,
              trust, and confidently recommend your business across the
              signals that influence AI discovery — on ChatGPT, Claude,
              Perplexity, Gemini, and the answer engines coming next.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/order" className="btn-primary text-base">
                Request My AI Visibility Audit
              </Link>
              <Link href="/sample-report" className="btn-ghost text-base">
                View Sample Report
              </Link>
            </div>
            <p className="mt-3 text-xs text-white/65">
              Automated AI analysis + human-reviewed delivery — most reports are delivered within minutes.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">
                Platforms analyzed
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {PLATFORMS.map((p) => (
                  <span
                    key={p}
                    className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="absolute -inset-10 -z-10 bg-radial-orange opacity-60" />
            <div className="animate-floatY">
              <ReportPreview />
            </div>
          </div>
        </div>
      </section>

      {/* WHAT IS GEOVIZ — premium card grid. Four compact concepts a
          non-technical buyer can scan in five seconds. */}
      <section
        id="what-is-geoviz"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-14">
          <p className="section-eyebrow">What is GeoViz</p>
          <h2 className="h2 mt-3 max-w-3xl">
            AI Visibility Intelligence for modern businesses.
          </h2>
          <p className="muted mt-4 max-w-2xl text-base leading-relaxed">
            AI systems must understand your business before they can
            recommend it. GeoViz audits how clearly ChatGPT, Claude,
            Gemini, and Perplexity can read, trust, and surface your
            business — across the signals that matter for AI discovery.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <WhatCard
              icon={<IconEye />}
              title="Machine understanding"
              body="Can AI systems clearly read and interpret what your business does?"
            />
            <WhatCard
              icon={<IconShield />}
              title="Trust signals"
              body="Can AI systems verify your reputation, services, and credibility?"
            />
            <WhatCard
              icon={<IconTarget />}
              title="Recommendation confidence"
              body="Do AI systems have enough signal to recommend you with confidence?"
            />
            <WhatCard
              icon={<IconList />}
              title="Fix priority"
              body="Which gaps to close first, ranked by impact on AI readiness."
            />
          </div>
        </div>
      </section>

      {/* WHY THIS MATTERS — compact: one strong headline, three short
          cards. Subhead trimmed; no long lede paragraph. */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-14">
          <p className="section-eyebrow">Why this matters</p>
          <h2 className="h2 mt-3 max-w-3xl">
            AI-generated answers are increasingly shaping which
            businesses customers discover and trust.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <ProblemCard
              title="AI is shaping discovery"
              body="Customers are asking ChatGPT, Claude, Gemini, and Perplexity who to hire — well before they reach a traditional search engine."
            />
            <ProblemCard
              title="Strong reputations, weak machine understanding"
              body="Businesses with real reviews and real customers can still be unreadable to AI when their site lacks the structural signals AI relies on."
            />
            <ProblemCard
              title="GeoViz identifies the gap"
              body="A scored intelligence report that surfaces what AI can&rsquo;t see — and the highest-impact fixes to close it."
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS — four clean steps. Horizontal on desktop (4-col),
          stacks on mobile so each step reads cleanly. */}
      <section
        id="how-it-works"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-14">
          <p className="section-eyebrow">How it works</p>
          <h2 className="h2 mt-3 max-w-2xl">
            Five steps. One reviewed report.
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <HowItWorksStep
              index={1}
              title="Submit your business"
              body="Your website URL, your email, and optionally your business name and a competitor URL for comparison context."
            />
            <HowItWorksStep
              index={2}
              title="GeoViz analyzes AI visibility signals"
              body="Automated analysis across AI readability, crawler accessibility, trust signals, structured identity, and semantic clarity."
            />
            <HowItWorksStep
              index={3}
              title="Human review checks the report"
              body="Every report is read end-to-end before delivery — directional intelligence framed for action, not raw model output."
            />
            <HowItWorksStep
              index={4}
              title="You receive a clear AI visibility report"
              body="Delivered by email as a hosted link and PDF — typically within minutes. A complex site can take a little longer."
            />
            <HowItWorksStep
              index={5}
              title="Optional foundation fixes improve your AI readiness"
              body="If you want us to implement the audit's priority fixes, the GEO Foundation Fix is available as a separate engagement."
            />
          </div>
        </div>
      </section>

      {/* WHAT WE MEASURE — the eight AI-visibility dimensions GeoViz
          scans for. Sits between How It Works (process) and Sample
          Report (proof). Reads as a structural detail block so a
          technical buyer can grok the rubric in 10 seconds; remains
          plain-English so a non-technical owner can still scan it. */}
      <section
        id="what-we-measure"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-14">
          <p className="section-eyebrow">What we measure</p>
          <h2 className="h2 mt-3 max-w-3xl">
            The signals AI systems use to understand a business.
          </h2>
          <p className="muted mt-4 max-w-2xl text-base leading-relaxed">
            Every audit scores your site across the eight dimensions
            that drive AI discoverability today.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MeasureCard
              title="AI readability"
              body="How easily AI systems can retrieve and interpret your content."
            />
            <MeasureCard
              title="Semantic clarity"
              body="Whether your services, locations, and offers are clearly described in plain language."
            />
            <MeasureCard
              title="Business identity consistency"
              body="Whether your name, address, and core facts are aligned across the web."
            />
            <MeasureCard
              title="Crawler accessibility"
              body="Whether the AI crawlers behind ChatGPT, Claude, Perplexity, and Gemini can actually reach your pages."
            />
            <MeasureCard
              title="Structured data"
              body="Whether machine-readable signals tell AI systems exactly what your business does and where."
            />
            <MeasureCard
              title="Trust signals"
              body="Reviews, citations, and verifications that make AI confident enough to recommend you."
            />
            <MeasureCard
              title="Recommendation readiness"
              body="Whether your site has the depth and clarity AI needs to name you when a customer asks."
            />
            <MeasureCard
              title="Competitor visibility signals"
              body="How your AI visibility profile compares against the competitor you submit (optional)."
            />
          </div>
        </div>
      </section>

      {/* WHAT GEOVIZ IS NOT — concise expectation-setter. Plain bullets,
          no scary tone. Sits adjacent to "What we measure" so the
          buyer reads "here is what we are, here is what we are not"
          as a paired thought. */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-14">
          <p className="section-eyebrow">What GeoViz is not</p>
          <h2 className="h2 mt-3 max-w-3xl">
            What this is — and what it isn&rsquo;t.
          </h2>
          <p className="muted mt-4 max-w-2xl text-base leading-relaxed">
            GeoViz is AI visibility intelligence. It is intentionally
            not these things.
          </p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <NotCard label="Not traditional SEO." />
            <NotCard label="Not keyword stuffing." />
            <NotCard label="Not guaranteed rankings." />
            <NotCard label="Not fake AI citation promises." />
            <NotCard label="Not a one-click magic fix." />
          </ul>
        </div>
      </section>

      {/* SAMPLE REPORT */}
      <section
        id="sample-report"
        className="border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="container-page py-16">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="section-eyebrow">Sample report</p>
              <h2 className="h2 mt-3">
                A real score, a real plan, plain English.
              </h2>
              <p className="muted mt-4 max-w-md">
                You get a Visibility Score from 0 to 100, the issues
                pulling it down, and the highest-impact fixes — written
                so a non-technical owner can act on them today.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-white/75">
                <SampleBullet>Visibility Score · 0–100</SampleBullet>
                <SampleBullet>
                  Plain-English breakdown of every issue
                </SampleBullet>
                <SampleBullet>Top priority fixes, ranked</SampleBullet>
                <SampleBullet>Professional PDF report</SampleBullet>
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/sample-report" className="btn-ghost">
                  View a Real GeoViz AI Visibility Report
                </Link>
                <Link href="/order" className="btn-primary">
                  Request My AI Visibility Audit
                </Link>
              </div>
            </div>
            <ReportPreview />
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-4">
            <SampleStat label="Visibility Score" value="42 / 100" tone="warn" />
            <SampleStat label="Status" value="At Risk" tone="warn" />
            <SampleStat label="Issues found" value="11" />
            <SampleStat label="Top priority fixes" value="4" tone="ok" />
          </div>
        </div>
      </section>

      {/* RECENT AUDIT INSIGHTS — observation-style notes from real
          audits. Subtle, premium, never testimonial. Not customer-
          attributed and never invents metrics. */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-14">
          <p className="section-eyebrow">Recent audit insights</p>
          <h2 className="h2 mt-3 max-w-3xl">
            Patterns we keep seeing across real audits.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <InsightCard body="Major brands can still struggle with AI readability." />
            <InsightCard body="JavaScript-heavy websites often reduce AI retrieval visibility." />
            <InsightCard body="Many businesses lack machine-readable trust signals." />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section
        id="pricing"
        className="relative border-t border-white/5 bg-ink-950 scroll-mt-20"
      >
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-50" />
        <div className="container-page py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-eyebrow">Pricing</p>
            <h2 className="h2 mt-3">One audit. One price. No subscription.</h2>
            <p className="muted mt-4">
              A diagnostic intelligence report — not an instant fix. The
              audit identifies where your business is clear, weak,
              blocked, or under-explained to AI systems, and ranks the
              fixes by impact.
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-xl">
            <div className="card card-hover relative overflow-hidden">
              <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
              <p className="pill">AI Visibility Audit</p>
              <div className="mt-5 flex items-end gap-3">
                <span className="text-5xl font-bold text-white">$97</span>
                <span className="text-2xl text-white/40 line-through">$147</span>
                <span className="pb-1 text-sm text-white/50">
                  one-time · delivered by email
                </span>
              </div>
              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                Normally $147 — currently $97 for early customers
              </p>
              <ul className="mt-6 space-y-3 text-sm text-white/80">
                <PricingBullet>Full audit across 6 scoring categories</PricingBullet>
                <PricingBullet>Visibility Score (0–100) with band</PricingBullet>
                <PricingBullet>Top 3 issues with severity + impact</PricingBullet>
                <PricingBullet>Top 3 fixes with priority + difficulty</PricingBullet>
                <PricingBullet>Professional PDF report</PricingBullet>
              </ul>
              <Link
                href="/order"
                className="btn-primary mt-8 w-full justify-center text-base"
              >
                Request My AI Visibility Audit
              </Link>
              <p className="mt-3 text-center text-xs text-white/55">
                Most reports are delivered within minutes. Your full
                scored GeoViz audit arrives by email as a hosted link
                and PDF.
              </p>
              <p className="mt-2 text-center text-xs text-white/45">
                Each audit includes automated AI-search analysis
                plus manual review for scoring consistency and
                clarity. Generated against ChatGPT, Claude,
                Perplexity, and Gemini.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOUNDATION FIX — compressed: a single tight card framed as the
          optional next step *after* the audit. Keeps $497 + the four
          most customer-relevant deliverables; drops the parallel
          $497 chip and the timeline/re-check/investment grid that
          were competing visually with the $97 anchor above. */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-16">
          <div className="rounded-2xl border border-accent/30 bg-ink-900/70 p-8 md:p-10 shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-glow">
            <p className="section-eyebrow">Optional next step</p>
            <h2 className="h2 mt-3 max-w-2xl">
              Need help improving the signals the audit identified?
            </h2>
            <p className="muted mt-4 max-w-2xl text-base leading-relaxed">
              The GEO Foundation Fix is a foundational implementation
              service — not magic automation. We work through the
              priority fixes the audit surfaced so AI systems can
              identify, trust, and recommend your business more
              clearly.
            </p>
            <p className="mt-5 text-sm text-white/70">
              <span className="text-white font-semibold">$497</span> ·
              3–5 business days · re-check included · most cases
              (complex sites quoted upfront).
            </p>
            <p className="mt-6 text-xs uppercase tracking-[0.18em] text-white/45">
              Engagements typically include
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 max-w-2xl">
              <PricingBullet>
                Schema / structured data recommendations or implementation
              </PricingBullet>
              <PricingBullet>Business identity cleanup</PricingBullet>
              <PricingBullet>AI-readable content improvements</PricingBullet>
              <PricingBullet>Crawler accessibility review</PricingBullet>
              <PricingBullet>Trust signal improvements</PricingBullet>
              <PricingBullet>
                llms.txt / AI crawler guidance where appropriate
              </PricingBullet>
              <PricingBullet>
                Citation and source clarity improvements
              </PricingBullet>
              <PricingBullet>
                Report-based priority fixes from your audit
              </PricingBullet>
            </ul>
            <p className="mt-6 text-xs text-white/45">
              Available after your audit completes. Scope is grounded
              in the audit&rsquo;s findings, not a templated checklist.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20 text-center">
          <h2 className="h2 mx-auto max-w-3xl">
            See how ChatGPT, Claude, Perplexity, and Gemini understand
            your business.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl">
            A directional AI visibility intelligence report — most are
            delivered within minutes. Hosted link plus PDF, by email.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/order" className="btn-primary">
              Request My AI Visibility Audit
            </Link>
            <Link href="/sample-report" className="btn-ghost">
              View Sample Report
            </Link>
          </div>
          <p className="mt-3 mx-auto max-w-xl text-xs text-white/45">
            Each audit includes automated AI-search analysis plus
            manual review for scoring consistency and clarity.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}

function ProblemCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card">
      <h3 className="h3">{title}</h3>
      <p className="muted mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function SampleBullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
      <span>{children}</span>
    </li>
  );
}

function SampleStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const valueColor =
    tone === "warn"
      ? "text-accent"
      : tone === "ok"
        ? "text-emerald-300"
        : "text-white";
  return (
    <div className="card text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-white/40">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${valueColor}`}>{value}</p>
    </div>
  );
}

function WhatCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="card card-hover group relative">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent transition group-hover:border-accent/60 group-hover:bg-accent/15">
        {icon}
      </div>
      <h3 className="mt-5 text-base font-semibold text-white">{title}</h3>
      <p className="muted mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function IconEye() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 10s2.5-5 8-5 8 5 8 5-2.5 5-8 5-8-5-8-5Z" />
      <circle cx="10" cy="10" r="2.2" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 2.5 4 5v4.5c0 4 2.7 6.5 6 8 3.3-1.5 6-4 6-8V5l-6-2.5Z" />
      <path d="m7.5 10 2 2 3.5-3.5" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="10" r="7" />
      <circle cx="10" cy="10" r="3.5" />
      <circle cx="10" cy="10" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconList() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5h12" />
      <path d="M4 10h12" />
      <path d="M4 15h7" />
      <path d="m13.5 14 1.5 1.5L17.5 13" />
    </svg>
  );
}

function HowItWorksStep({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  return (
    <div className="card card-hover group relative">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent/40 bg-accent/10 text-sm font-bold text-accent transition group-hover:border-accent/70 group-hover:bg-accent/15">
          {index}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
      <p className="muted mt-4 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function MeasureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="card card-hover">
      <h3 className="text-base font-semibold text-white">{title}</h3>
      <p className="muted mt-2 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function NotCard({ label }: { label: string }) {
  return (
    <li className="card flex items-start gap-3">
      <span
        aria-hidden
        className="mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-xs font-bold text-white/55"
      >
        ✕
      </span>
      <span className="text-sm leading-relaxed text-white/85">{label}</span>
    </li>
  );
}

function InsightCard({ body }: { body: string }) {
  return (
    <div className="card card-hover">
      <div className="flex gap-3">
        <span
          aria-hidden
          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
        />
        <p className="text-sm leading-relaxed text-white/85">{body}</p>
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
