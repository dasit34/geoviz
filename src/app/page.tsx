import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { HeroForm } from "@/components/HeroForm";
import { ReportPreview } from "@/components/ReportPreview";

const PLATFORMS = ["ChatGPT", "Claude", "Perplexity", "Gemini", "AI Overviews"];

const CHECKS = [
  {
    title: "AI crawler access",
    body: "Whether GPTBot, ClaudeBot, PerplexityBot, and Googlebot can actually reach your pages.",
  },
  {
    title: "robots.txt",
    body: "How your robots policy impacts AI training and citation crawlers.",
  },
  {
    title: "Sitemap",
    body: "Discoverability of every key service and location page.",
  },
  {
    title: "Schema markup",
    body: "Structured data that lets AI tools confidently identify what you do.",
  },
  {
    title: "LocalBusiness data",
    body: "NAP, hours, service area, and category signals AI uses for local recommendations.",
  },
  {
    title: "FAQ structure",
    body: "Question/answer formatting AI can extract and cite directly.",
  },
  {
    title: "Service clarity",
    body: "Whether your homepage and service pages clearly state what you offer.",
  },
  {
    title: "Location clarity",
    body: "Whether AI can confidently match you to the cities and regions you serve.",
  },
  {
    title: "Authority signals",
    body: "Reviews, mentions, and citations that build AI trust in your business.",
  },
  {
    title: "AI citability",
    body: "How likely AI tools are to recommend you when a customer asks for help.",
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
              Visibility Audit
            </span>
            <h1 className="h1 mt-5">
              Can{" "}
              <span className="bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
                ChatGPT
              </span>{" "}
              find your business — or is it recommending your competitors?
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              We audit how ChatGPT, Claude, Perplexity, and Gemini see your
              business — and show exactly how to fix it.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/order" className="btn-primary text-base">
                Get My Audit — $97
              </Link>
              <Link href="/sample-report" className="btn-ghost text-base">
                View a Real Audit (2 min)
              </Link>
            </div>
            <p className="mt-3 text-xs italic text-white/50">
              We run a limited number of audits per day to keep results accurate.
            </p>

            <div className="mt-8">
              <HeroForm />
            </div>

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

      {/* WHAT YOU'LL SEE — directly under hero */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-16">
          <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <p className="section-eyebrow">What you’ll see in your audit</p>
              <h2 className="h2 mt-3">Your real numbers, your real fixes.</h2>
              <ul className="mt-6 space-y-3 text-base text-white/85">
                <li className="flex items-start gap-3">
                  <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-accent" />
                  <span>Visibility Score: 38/100</span>
                </li>
                <li className="flex items-start gap-3">
                  <span aria-hidden className="text-base">❌</span>
                  <span>Not recommended by ChatGPT for key local searches</span>
                </li>
                <li className="flex items-start gap-3">
                  <span aria-hidden className="text-base">⚠️</span>
                  <span>Weak presence in sources AI platforms rely on</span>
                </li>
                <li className="flex items-start gap-3">
                  <span aria-hidden className="text-base">✅</span>
                  <span>Clear fix plan to improve AI visibility</span>
                </li>
              </ul>
            </div>
            <div>
              <Link href="/sample-report" className="btn-ghost">
                See Full Sample Report →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20">
          <p className="section-eyebrow">The shift</p>
          <h2 className="h2 mt-3 max-w-3xl">
            Customers are starting their search inside AI — not Google.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <ProblemCard
              title="AI is the new front door"
              body="Buyers are asking ChatGPT, Claude, and Gemini for recommendations before they ever open a search engine."
            />
            <ProblemCard
              title="Most sites are invisible"
              body="If AI tools can’t crawl, parse, or trust your site, they will not surface you when a customer asks who to hire."
            />
            <ProblemCard
              title="Lost opportunities"
              body="Every AI conversation that recommends a competitor instead of you is a job, case, or appointment that never reaches you."
            />
          </div>
        </div>
      </section>

      {/* WHAT WE CHECK */}
      <section
        id="what-we-check"
        className="relative border-t border-white/5 bg-ink-950"
      >
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-40" />
        <div className="container-page py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow">What we check</p>
              <h2 className="h2 mt-3">10 signals that decide AI visibility.</h2>
            </div>
            <p className="muted max-w-md">
              Each audit is a deep technical and content review focused on the
              exact signals AI tools use to recommend a business.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {CHECKS.map((c, i) => (
              <CheckCard key={c.title} index={i + 1} {...c} />
            ))}
          </div>
        </div>
      </section>

      {/* SAMPLE REPORT */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <p className="section-eyebrow">Sample report</p>
              <h2 className="h2 mt-3">
                A clear score, a clear plan, plain English.
              </h2>
              <p className="muted mt-4 max-w-md">
                You get an AI Visibility Score from 0 to 100, the issues that
                are pulling you down, and the highest-impact fixes — written so
                a non-technical owner can act on them.
              </p>
              <ul className="mt-6 space-y-3 text-sm text-white/75">
                <SampleBullet>AI Visibility Score · 0–100</SampleBullet>
                <SampleBullet>
                  Plain-English breakdown of every issue
                </SampleBullet>
                <SampleBullet>Top priority fixes, ranked</SampleBullet>
                <SampleBullet>Professional PDF report</SampleBullet>
              </ul>
              <div className="mt-8 flex gap-3">
                <Link href="/sample-report" className="btn-ghost">
                  See full sample report
                </Link>
                <Link href="/order" className="btn-primary">
                  Run my audit
                </Link>
              </div>
            </div>
            <ReportPreview />
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-4">
            <SampleStat label="AI Visibility Score" value="42 / 100" tone="warn" />
            <SampleStat label="Status" value="At Risk" tone="warn" />
            <SampleStat label="Issues found" value="11" />
            <SampleStat label="Top priority fixes" value="4" tone="ok" />
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section
        id="pricing"
        className="relative border-t border-white/5 bg-ink-950"
      >
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-50" />
        <div className="container-page py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="section-eyebrow">Pricing</p>
            <h2 className="h2 mt-3">One audit. One price. No subscription.</h2>
            <p className="muted mt-4">
              You get the full picture of how AI tools see your business — and
              exactly what to fix first.
            </p>
          </div>

          <div className="mx-auto mt-12 max-w-xl">
            <div className="card relative overflow-hidden">
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
                <PricingBullet>Full AI visibility audit</PricingBullet>
                <PricingBullet>AI Visibility Score (0–100)</PricingBullet>
                <PricingBullet>Breakdown of every issue</PricingBullet>
                <PricingBullet>Recommended fixes, ranked</PricingBullet>
                <PricingBullet>Professional PDF report</PricingBullet>
              </ul>
              <Link
                href="/order"
                className="btn-primary mt-8 w-full justify-center text-base"
              >
                Get My Audit — $97
              </Link>
              <p className="mt-3 text-center text-xs italic text-white/50">
                We run a limited number of audits per day to keep results accurate.
              </p>
              <p className="mt-2 text-center text-xs text-white/40">
                Delivered by email within 24 hours. Each report is generated
                using AI-assisted analysis across ChatGPT, Claude, Perplexity,
                and Gemini, then reviewed for clarity before delivery.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-16">
          <p className="section-eyebrow">Trust</p>
          <h2 className="h2 mt-3">Built for businesses adapting to AI search.</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            <li className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-sm text-white/80">
              Platforms checked: ChatGPT, Claude, Perplexity, Gemini
            </li>
            <li className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-sm text-white/80">
              Designed for local businesses and service providers
            </li>
            <li className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-sm text-white/80">
              Each audit is reviewed for clarity before delivery
            </li>
            <li className="rounded-lg border border-white/10 bg-white/[0.02] p-5 text-sm text-white/80">
              Early customers and case studies will be added here
            </li>
          </ul>
        </div>
      </section>

      {/* UPSELL TEASER */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20">
          <div className="card relative overflow-hidden md:p-10">
            <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-accent-blue/20 blur-3xl" />
            <div className="grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-center">
              <div>
                <p className="section-eyebrow text-accent-blue">After the audit</p>
                <h2 className="h2 mt-3">GEO Foundation Fix — $497</h2>
                <ul className="mt-6 space-y-3 text-sm text-white/80">
                  <PricingBullet>Fix the issues found in your audit</PricingBullet>
                  <PricingBullet>
                    Improve AI visibility across ChatGPT and other platforms
                  </PricingBullet>
                  <PricingBullet>
                    Optimize structured data and business signals
                  </PricingBullet>
                  <PricingBullet>Re-check your visibility after fixes</PricingBullet>
                </ul>
                <p className="muted mt-5 text-sm">
                  More complex cases are quoted upfront.
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-800/60 p-6 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                  GEO Foundation Fix
                </p>
                <p className="mt-3 text-4xl font-bold text-white">$497</p>
                <p className="mt-2 text-sm text-white/60">
                  Available after your audit.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY GEOVIZ EXISTS */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-16">
          <div className="mx-auto max-w-3xl">
            <p className="section-eyebrow">Why GeoViz exists</p>
            <h2 className="h2 mt-3">A new front door for customers.</h2>
            <p className="mt-5 text-base leading-relaxed text-white/80">
              More customers are using ChatGPT and other AI platforms to find
              businesses. But many companies that rank on Google are invisible
              in AI answers. GeoViz shows you exactly how these systems see
              your business — and what needs to change.
            </p>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20 text-center">
          <h2 className="h2 mx-auto max-w-3xl">
            Find out if ChatGPT, Claude, Perplexity, and Gemini recommend your business.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl">
            Delivered by email within 24 hours. Each report is generated using
            AI-assisted analysis across ChatGPT, Claude, Perplexity, and
            Gemini, then reviewed for clarity before delivery.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/order" className="btn-primary">
              Get My Audit — $97
            </Link>
            <Link href="/sample-report" className="btn-ghost">
              View a Real Audit (2 min)
            </Link>
          </div>
          <p className="mt-3 text-xs italic text-white/50">
            We run a limited number of audits per day to keep results accurate.
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

function CheckCard({
  index,
  title,
  body,
}: {
  index: number;
  title: string;
  body: string;
}) {
  return (
    <div className="card transition hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-glow">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-[0.2em] text-accent">
          {String(index).padStart(2, "0")}
        </span>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </div>
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
