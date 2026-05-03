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
              When customers ask{" "}
              <span className="bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
                ChatGPT
              </span>{" "}
              who to hire, does your business show up?
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              AI search is becoming the new front door for customers. GeoViz
              audits your website and shows whether AI tools can find,
              understand, and recommend your business.
            </p>

            <HeroForm />

            <div className="mt-4 flex items-center gap-3 text-xs text-white/50">
              <Link href="/sample-report" className="underline-offset-4 hover:text-white hover:underline">
                See sample report →
              </Link>
              <span className="hidden sm:inline">·</span>
              <span className="hidden sm:inline">
                Full report delivered by email. Includes AI visibility score,
                crawler checks, schema review, and top fixes.
              </span>
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
              <div className="mt-5 flex items-end gap-2">
                <span className="text-5xl font-bold text-white">$147</span>
                <span className="pb-1 text-sm text-white/50">
                  one-time · delivered by email
                </span>
              </div>
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
                Run My Audit
              </Link>
              <p className="mt-3 text-center text-xs text-white/40">
                Secure checkout via Stripe · No subscription · Report in ~24 hours
              </p>
            </div>
          </div>
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
                <h2 className="h2 mt-3">Want us to fix it for you?</h2>
                <p className="muted mt-4 max-w-xl">
                  Once you have your audit, our team can implement the fixes for
                  you. Schema, llms.txt, robots.txt, homepage clarity, service
                  pages, FAQ structure — done end-to-end with a clean
                  before/after comparison.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
                    Schema implementation
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
                    llms.txt
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
                    robots.txt for AI crawlers
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
                    Service page clarity
                  </span>
                  <span className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
                    FAQ structure
                  </span>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-ink-800/60 p-6 text-center">
                <p className="text-xs uppercase tracking-[0.2em] text-white/50">
                  GEO Foundation Fix
                </p>
                <p className="mt-3 text-4xl font-bold text-white">
                  from $497
                </p>
                <p className="mt-2 text-sm text-white/60">
                  Available after your audit. We’ll quote based on findings.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20 text-center">
          <h2 className="h2 mx-auto max-w-3xl">
            Find out if AI tools recommend your business.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl">
            Run your AI Visibility Audit today. Full report by email — usually
            within 24 hours.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/order" className="btn-primary">
              Run My Audit · $147
            </Link>
            <Link href="/sample-report" className="btn-ghost">
              See sample report
            </Link>
          </div>
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
