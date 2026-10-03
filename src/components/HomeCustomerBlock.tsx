import Link from "next/link";

import { REAUDIT_PRICE } from "@/lib/home/offers";

/** "Already a customer?" — re-audit eligibility + (when open) monitoring sign-in. */
export function HomeCustomerBlock({ monitoringOpen }: { monitoringOpen: boolean }) {
  return (
    <section className="border-b border-white/[0.06] bg-ink-950">
      <div className="container-page grid gap-8 py-14 lg:grid-cols-[0.8fr,1.2fr] lg:items-center" data-reveal>
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/50">Already a customer?</p>
          <h2 className="mt-4 font-display text-2xl font-semibold text-white sm:text-3xl">Measure your progress.</h2>
        </div>
        <div className={`grid gap-4 ${monitoringOpen ? "sm:grid-cols-2" : ""}`}>
          <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5">
            <p className="text-[15px] font-medium text-white">Re-audit — {REAUDIT_PRICE}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-white/60">
              Available only if you already have a completed GeoViz audit that has been reviewed and delivered. Use the
              re-audit link in your report email — it compares your new results with your previous audit.
            </p>
            <Link href="/re-audit" className="mt-4 inline-flex text-[14px] text-white underline decoration-accent/60 underline-offset-4 hover:decoration-accent">
              How re-audits work →
            </Link>
          </div>
          {monitoringOpen ? (
            <div className="rounded-lg border border-white/10 bg-ink-900/60 p-5">
              <p className="text-[15px] font-medium text-white">Monitoring customers</p>
              <p className="mt-2 text-[14px] leading-relaxed text-white/60">
                Sign in with the email you used to subscribe. We’ll email you a secure sign-in link — no password.
              </p>
              <Link href="/monitoring/sign-in" className="mt-4 inline-flex text-[14px] text-white underline decoration-accent/60 underline-offset-4 hover:decoration-accent">
                Sign in to monitoring →
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
