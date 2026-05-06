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
    body: "Structured data that lets AI confidently identify what you do.",
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
    body: "How likely AI is to name you when a customer asks for help.",
  },
];

const AUDIENCES = [
  {
    title: "Home services",
    examples: "Roofing · HVAC · Plumbing · Electricians · Contractors",
    body: "Customers ask AI for a contractor before they call anyone. If your site doesn't surface a clear service area, license, and warranty, the closest competitor with cleaner signals gets the call.",
  },
  {
    title: "Health & wellness",
    examples: "Dentists · Med spas · Clinics · Chiropractors",
    body: "AI is conservative with health recommendations — it leans on whichever local practice publishes the most consistent identity and service information. Practices with weak entity signals get filtered out before review counts even matter.",
  },
  {
    title: "Professional services",
    examples: "Law firms · Accountants · Consultants · Real-estate agents",
    body: "AI prefers to cite sources where the practitioner, the firm, and the practice areas line up cleanly. Inconsistent naming or thin practice-area pages cause AI to hand the inquiry to a more legible competitor.",
  },
  {
    title: "Multi-location operators",
    examples: "Regional chains · Franchise locations · Agencies running local accounts",
    body: "Each location must read as its own credible entity to AI — not a copy-pasted footer. Without per-city pages and structured location data, AI collapses your locations into one and your service-area coverage disappears.",
  },
];

const AI_DIMENSIONS = [
  {
    eyebrow: "01",
    title: "Crawlability",
    body: "Citation bots — OAI-SearchBot, ClaudeBot, PerplexityBot, Bingbot, Google-Extended — must be able to reach your pages. Many sites accidentally block them in robots.txt.",
  },
  {
    eyebrow: "02",
    title: "Structured data",
    body: "JSON-LD schema (LocalBusiness, Service, Review, FAQPage) is how AI confirms what you do, where, and for whom — without having to guess from marketing copy.",
  },
  {
    eyebrow: "03",
    title: "Entity consistency",
    body: "Your business name, phone, and address must match exactly across the homepage, footer, schema, and Open Graph tags. Mismatches make AI uncertain you're the same business.",
  },
  {
    eyebrow: "04",
    title: "Service ↔ location relationships",
    body: "AI extracts what services you offer and where you offer them. Sites that bundle every service onto one page lose to operators with separate, location-specific service pages.",
  },
  {
    eyebrow: "05",
    title: "Citation trust",
    body: "Visible reviews, license numbers, warranty terms, and named third-party sources (BBB, Google Business Profile, Yelp) are what AI references when deciding whom to cite.",
  },
  {
    eyebrow: "06",
    title: "FAQ extraction format",
    body: "Question-and-answer blocks marked up with FAQPage schema are pulled directly into AI answers. Plain marketing copy is summarised; FAQ blocks get quoted.",
  },
  {
    eyebrow: "07",
    title: "Machine-readable hierarchy",
    body: "Clear `<h1>` per page, ordered headings, semantic HTML5 elements (`<address>`, `<article>`, ContactPoint), and an XML sitemap together tell AI how your content fits together.",
  },
];

const FOUNDATION_FIX_DELIVERABLES = [
  "LocalBusiness or Service JSON-LD installed with full NAP, hours, areaServed, and industry subtype",
  "AggregateRating + FAQPage schema added so AI can extract reviews and answers directly",
  "robots.txt rewritten to allow OAI-SearchBot, ClaudeBot, PerplexityBot, Bingbot, and Google-Extended",
  "Site-root /llms.txt published with clear site description and links to your key pages",
  "XML sitemap referenced from robots.txt, every service and location page included",
  "Title tags + meta descriptions rewritten to name service and location explicitly",
  "Re-audit and final visibility score delivered after implementation",
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
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> AI search
              audit for local businesses
            </span>
            <h1 className="h1 mt-5">
              When customers ask{" "}
              <span className="bg-gradient-to-r from-accent to-accent-glow bg-clip-text text-transparent">
                ChatGPT
              </span>{" "}
              who to hire — does your business get named?
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              AI answer engines are the new front door for local
              hiring. When ChatGPT, Claude, Perplexity, and Gemini
              can&rsquo;t parse your site clearly, they cite the
              competitor whose business identity is easier to confirm.
              We show you why — and exactly what to fix.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/order" className="btn-primary text-base">
                Get My Audit — $97
              </Link>
              <Link href="/sample-report" className="btn-ghost text-base">
                View a sample audit
              </Link>
            </div>
            <p className="mt-3 text-xs text-white/55">
              Get an instant AI visibility scan in minutes. Receive
              your full scored GeoViz audit within 24 hours.
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

      {/* PROBLEM — real business pain */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20">
          <p className="section-eyebrow">The shift</p>
          <h2 className="h2 mt-3 max-w-3xl">
            Customers are choosing who to call before they ever open Google.
          </h2>
          <p className="muted mt-5 max-w-2xl text-base leading-relaxed">
            If AI recommends your competitor, you lose the customer
            before your phone rings, your form fills, or your booking page
            loads. Most local businesses are invisible inside AI answers
            — even ones ranking on Google.
          </p>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <ProblemCard
              title="AI is the new front door"
              body="Buyers are asking ChatGPT, Claude, and Gemini who to hire — long before any traditional search happens."
            />
            <ProblemCard
              title="Most sites are invisible"
              body="If AI can&rsquo;t crawl, parse, or trust your site, it will not name you when a local customer asks for a recommendation."
            />
            <ProblemCard
              title="Lost calls compound"
              body="Every conversation that ends with the wrong recommendation is a job, a case, or an appointment you never knew you had a chance at."
            />
          </div>
        </div>
      </section>

      {/* WHO THIS IS FOR */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow">Built for</p>
              <h2 className="h2 mt-3 max-w-2xl">
                Local operators where one missed lead pays for the audit ten times over.
              </h2>
            </div>
            <p className="muted max-w-md">
              Businesses where every inbound call is qualified, the
              services are specific, and the win-rate per lead is high.
              These businesses have the most to gain — and the most to
              lose — when AI picks who gets named.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {AUDIENCES.map((a) => (
              <AudienceCard key={a.title} {...a} />
            ))}
          </div>
        </div>
      </section>

      {/* WHAT AI ACTUALLY LOOKS AT — authority section */}
      <section
        id="how-ai-reads"
        className="relative border-t border-white/5 bg-ink-950"
      >
        <div className="absolute inset-0 -z-10 bg-radial-orange opacity-30" />
        <div className="container-page py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow">How AI search systems read your site</p>
              <h2 className="h2 mt-3 max-w-2xl">
                Seven dimensions decide whether AI cites you or skips you.
              </h2>
            </div>
            <p className="muted max-w-md">
              Each dimension is structured, measurable, and tested in
              every audit. AI answer engines parse machine-readable
              structure first, then extract claims they can confirm,
              then cite sources they can trust.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AI_DIMENSIONS.map((d) => (
              <DimensionCard key={d.title} {...d} />
            ))}
          </div>
        </div>
      </section>

      {/* WHAT WE CHECK */}
      <section
        id="what-we-check"
        className="border-t border-white/5 bg-ink-950"
      >
        <div className="container-page py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow">What we check</p>
              <h2 className="h2 mt-3">10 signals that decide AI citations.</h2>
            </div>
            <p className="muted max-w-md">
              Each audit is a deep technical and content review focused
              on the exact signals generative engines use to decide who
              gets recommended.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {CHECKS.map((c, i) => (
              <CheckCard key={c.title} index={i + 1} {...c} />
            ))}
          </div>
        </div>
      </section>

      {/* CASE STUDY — before/after framework */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow">Rubric-based reference</p>
              <h2 className="h2 mt-3 max-w-2xl">
                What a Foundation Fix typically delivers.
              </h2>
            </div>
            <p className="muted max-w-md text-sm">
              Illustrative — modeled on the same six-category rubric
              the audit runs on. We don&rsquo;t publish named customer
              cases without explicit consent.
            </p>
          </div>

          <div className="mt-12 rounded-2xl border border-white/10 bg-ink-900/60 p-6 md:p-10 shadow-card">
            <div className="grid gap-10 lg:grid-cols-[auto_1fr] lg:items-start">
              <BeforeAfterScores />
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-accent">
                  What changed
                </p>
                <ul className="mt-4 space-y-3 text-sm text-white/80">
                  <CaseChange before="No JSON-LD on any page" after="Full LocalBusiness + Service schema with industry subtype" />
                  <CaseChange before="No FAQ section" after="FAQPage schema published with 8 customer questions" />
                  <CaseChange before="OAI-SearchBot blocked in robots.txt" after="All five citation bots reachable, sitemap referenced" />
                  <CaseChange before="No /llms.txt" after="Structured llms.txt published linking to every service page" />
                  <CaseChange before="Service-area buried at the bottom of the homepage" after="Named service-area cities + per-city landing pages" />
                </ul>
                <div className="mt-6 grid gap-4 sm:grid-cols-3">
                  <BeforeAfterStat label="Schema /25" before={3} after={20} />
                  <BeforeAfterStat label="Crawler /20" before={9} after={18} />
                  <BeforeAfterStat label="Content /15" before={5} after={13} />
                </div>
              </div>
            </div>
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
            <SampleStat label="Visibility Score" value="42 / 100" tone="warn" />
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
              The full picture of how generative search engines see your
              business — and exactly what to fix first.
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
                Get My Audit — $97
              </Link>
              <p className="mt-3 text-center text-xs text-white/55">
                Get an instant AI visibility scan in minutes. Receive
                your full scored GeoViz audit within 24 hours.
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

      {/* FOUNDATION FIX — premium service block */}
      <section className="border-t border-white/5 bg-ink-950">
        <div className="container-page py-20">
          <div className="rounded-2xl border border-accent/30 bg-ink-900/70 p-8 md:p-12 shadow-card">
            <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
              <div>
                <p className="section-eyebrow">Done-for-you · rubric-based</p>
                <h2 className="h2 mt-3">
                  GEO Foundation Fix — measurable AI-visibility lift.
                </h2>
                <p className="muted mt-5 max-w-xl text-base leading-relaxed">
                  Every category that pulled your audit score down
                  comes back as a concrete repair: structured business
                  data, AI-crawler access, content hierarchy, and
                  entity clarity. We implement against the same rubric
                  the audit ran on, then re-score the site so the
                  visibility lift is measurable — not a guess.
                </p>

                <p className="mt-8 text-xs uppercase tracking-[0.2em] text-accent">
                  Deliverables
                </p>
                <ul className="mt-4 space-y-3 text-sm text-white/85">
                  {FOUNDATION_FIX_DELIVERABLES.map((d) => (
                    <PricingBullet key={d}>{d}</PricingBullet>
                  ))}
                </ul>

                <div className="mt-8 grid gap-4 sm:grid-cols-3">
                  <FixMetaCard
                    label="Timeline"
                    value="3–5 business days"
                    hint="From audit handoff to verified live"
                  />
                  <FixMetaCard
                    label="Re-check"
                    value="Included"
                    hint="Final score delivered after implementation"
                  />
                  <FixMetaCard
                    label="Investment"
                    value="$497 one-time"
                    hint="Most cases. Complex sites quoted upfront."
                  />
                </div>
              </div>

              <div className="rounded-xl border border-accent/40 bg-ink-900/80 p-7 flex flex-col">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">
                  GEO Foundation Fix
                </p>
                <p className="mt-3 text-5xl font-bold text-white">$497</p>
                <p className="mt-2 text-sm text-white/60">
                  Done-for-you. Re-check included.
                </p>
                <ul className="mt-6 space-y-2 text-sm text-white/75 flex-1">
                  <li className="flex gap-2">
                    <span className="text-accent">→</span> Schema, llms.txt, robots.txt
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent">→</span> FAQ + service-page structure
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent">→</span> Per-location signals
                  </li>
                  <li className="flex gap-2">
                    <span className="text-accent">→</span> Final score delivered
                  </li>
                </ul>
                <p className="mt-6 text-xs text-white/45">
                  Available after your audit completes.
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
            Find out exactly what ChatGPT, Claude, Perplexity, and Gemini see.
          </h2>
          <p className="muted mx-auto mt-4 max-w-xl">
            Get an instant AI visibility scan in minutes. Receive
            your full scored GeoViz audit within 24 hours.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/order" className="btn-primary">
              Get My Audit — $97
            </Link>
            <Link href="/sample-report" className="btn-ghost">
              View a sample audit
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

function AudienceCard({
  title,
  examples,
  body,
}: {
  title: string;
  examples: string;
  body: string;
}) {
  return (
    <div className="card">
      <h3 className="h3">{title}</h3>
      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-accent">
        {examples}
      </p>
      <p className="muted mt-4 text-sm leading-relaxed">{body}</p>
    </div>
  );
}

function DimensionCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="card">
      <p className="text-xs font-semibold tracking-[0.2em] text-accent">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-base font-semibold text-white">{title}</h3>
      <p className="muted mt-3 text-sm leading-relaxed">{body}</p>
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

function BeforeAfterScores() {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-800/60 p-6 text-center min-w-[260px]">
      <p className="text-xs uppercase tracking-[0.18em] text-white/50">
        Visibility score
      </p>
      <div className="mt-5 flex items-center justify-center gap-5">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-white/40">
            Before
          </p>
          <p className="mt-1 text-5xl font-bold text-accent">38</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-accent/80">
            At Risk
          </p>
        </div>
        <span aria-hidden className="text-2xl text-white/40">
          →
        </span>
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-white/40">
            After
          </p>
          <p className="mt-1 text-5xl font-bold text-emerald-300">71</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-emerald-300/80">
            Competitive
          </p>
        </div>
      </div>
      <p className="mt-5 text-xs text-white/45">
        Illustrative · based on the rubric
      </p>
    </div>
  );
}

function CaseChange({ before, after }: { before: string; after: string }) {
  return (
    <li className="flex gap-3">
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
      <span className="leading-relaxed">
        <span className="text-white/55 line-through">{before}</span>
        <span className="text-white/40"> → </span>
        <span className="text-white">{after}</span>
      </span>
    </li>
  );
}

function BeforeAfterStat({
  label,
  before,
  after,
}: {
  label: string;
  before: number;
  after: number;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-800/40 p-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.16em] text-white/45">
        {label}
      </p>
      <p className="mt-1 text-sm font-mono text-white/85">
        <span className="text-accent">{before}</span>
        <span className="text-white/40"> → </span>
        <span className="text-emerald-300 font-semibold">{after}</span>
      </p>
    </div>
  );
}

function FixMetaCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink-800/40 p-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-white/55">{hint}</p>
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
