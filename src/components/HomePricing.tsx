import Link from "next/link";

import { AUDIT_PRICE, AUDIT_REGULAR_PRICE, type MonitoringOffer } from "@/lib/home/offers";

function Bullet({ children, tone = "dark" }: { children: React.ReactNode; tone?: "dark" | "light" }) {
  return (
    <li className={`flex gap-2.5 text-[14.5px] leading-snug ${tone === "light" ? "text-graphite-900" : "text-white/80"}`}>
      <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden>
        <path d="M3 8.5l3.2 3L13 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{children}</span>
    </li>
  );
}

/** Pricing — Free check · $97 audit · Monitoring (flag-aware). */
export function HomePricing({ monitoring }: { monitoring: MonitoringOffer }) {
  const open = monitoring.state === "open";
  return (
    <section id="pricing" className="scroll-mt-24 border-b border-graphite-400/20 bg-cream-50 text-graphite-900">
      <div className="container-page py-16 sm:py-24" data-reveal>
        <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em] text-graphite-500">
          <span className="font-semibold text-graphite-900">06</span>
          <span aria-hidden className="h-px w-6 bg-graphite-400/40" />
          Pricing
        </p>
        <h2 className="mt-5 max-w-3xl font-display text-3xl font-semibold leading-[1.1] tracking-tight sm:text-[2.6rem]">
          Start with the audit. Monitor when you’re ready.
        </h2>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          <article className="flex flex-col rounded-lg border border-graphite-400/25 bg-white/70 p-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">Free check</h3>
            <p className="mt-4 font-display text-4xl font-semibold">Free</p>
            <p className="mt-3 text-[14.5px] leading-relaxed text-graphite-700">
              A quick technical read of how machine-readable your website is — structured data, crawl access, readable
              content, and business-identity consistency. It doesn’t ask any AI system.
            </p>
            <div className="mt-auto pt-6">
              <Link href="/check" className="inline-flex w-full items-center justify-center rounded-md border border-graphite-400/40 px-4 py-3 text-[15px] font-medium text-graphite-900 transition hover:border-graphite-900">
                Run the free check
              </Link>
            </div>
          </article>

          <article className="relative flex flex-col rounded-lg border-2 border-accent bg-ink-950 p-6 text-white shadow-glow">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">AI Visibility Audit · one-time</h3>
            <p className="mt-4 flex items-baseline gap-3">
              <span className="font-display text-4xl font-semibold">{AUDIT_PRICE}</span>
              <span className="text-[14px] text-white/55">
                Early Access · normally <s>{AUDIT_REGULAR_PRICE}</s>
              </span>
            </p>
            <ul className="mt-5 space-y-2.5">
              <Bullet>Score across six areas of AI readability</Bullet>
              <Bullet>How ChatGPT, Claude, Gemini, and Perplexity read your business (via their APIs)</Bullet>
              <Bullet>Issues in plain English, and what to fix first</Bullet>
              <Bullet>Reviewed by a person · PDF brief by email</Bullet>
            </ul>
            <div className="mt-auto pt-6">
              <Link href="/order" className="btn-primary w-full text-[15px]">
                Run your AI Visibility Audit — {AUDIT_PRICE}
              </Link>
            </div>
          </article>

          <article className="flex flex-col rounded-lg border border-graphite-400/25 bg-white/70 p-6">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.16em] text-graphite-500">
              AI Visibility Monitoring · Early Access
            </h3>
            <p className="mt-4 flex items-baseline gap-2">
              {monitoring.state === "open" ? (
                monitoring.amountLabel ? (
                  <>
                    <span className="font-display text-4xl font-semibold">{monitoring.amountLabel}</span>
                    <span className="text-[14px] text-graphite-500">{monitoring.intervalLabel}</span>
                  </>
                ) : (
                  <span className="font-display text-2xl font-semibold">Monthly plan</span>
                )
              ) : (
                <>
                  <span className="font-display text-4xl font-semibold">{monitoring.plannedPrice}</span>
                  <span className="text-[14px] text-graphite-500">per month</span>
                </>
              )}
            </p>
            {!open ? (
              <p className="mt-2 inline-flex w-fit rounded border border-graphite-400/40 px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-graphite-700">
                Opening soon
              </p>
            ) : null}
            <ul className="mt-5 space-y-2.5">
              <Bullet tone="light">A reviewed re-audit every month</Bullet>
              <Bullet tone="light">10 customer questions × 4 AI systems, twice each</Bullet>
              <Bullet tone="light">Up to 3 competitors in the same questions</Bullet>
              <Bullet tone="light">Website change tracking and verified improvement tasks</Bullet>
            </ul>
            <p className="mt-4 text-[12.5px] leading-relaxed text-graphite-500">
              Cancel any time — access continues to the end of your paid month and your history stays available.
            </p>
            <div className="mt-auto pt-6">
              {open ? (
                <Link href="/monitoring" className="inline-flex w-full items-center justify-center rounded-md bg-graphite-900 px-4 py-3 text-[15px] font-medium text-cream-50 transition hover:bg-ink-900">
                  Start monitoring
                </Link>
              ) : (
                <>
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    aria-describedby="monitoring-opening-note"
                    className="inline-flex w-full cursor-not-allowed items-center justify-center rounded-md border border-graphite-400/40 bg-graphite-400/10 px-4 py-3 text-[15px] font-medium text-graphite-700"
                  >
                    Start monitoring
                  </button>
                  <p id="monitoring-opening-note" className="mt-2 text-center text-[12.5px] text-graphite-700">
                    Purchasing opens at launch.
                  </p>
                </>
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
