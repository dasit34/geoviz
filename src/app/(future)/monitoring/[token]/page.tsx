import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { findPlan, isMonitoringEnabled } from "@/lib/monitoring/plans";
import { findSubscriptionByToken, loadStatusAuditRows } from "@/lib/monitoring/prisma-store";
import { buildMonitoringStatusView } from "@/lib/monitoring/status-view";
import { checkPageRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Your AI Visibility Monitoring · GeoViz",
  robots: { index: false, follow: false },
};

const fmtDate = (d: Date | null) =>
  d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "—";

/**
 * Customer monitoring status page. The random token in the URL is the
 * only credential — no login (same capability model as report pages).
 */
export default async function MonitoringStatusPage({ params }: { params: { token: string } }) {
  if (!isMonitoringEnabled()) notFound();

  const rl = checkPageRateLimit({ headers: headers(), routeKey: "page:monitoring:status", limit: 30, windowMs: 5 * 60_000 });
  if (rl.blocked) {
    return (
      <main>
        <Header />
        <section className="container-page py-24 text-center">
          <p className="muted">Too many requests. Please try again shortly.</p>
        </section>
        <Footer />
      </main>
    );
  }

  const sub = await findSubscriptionByToken(params.token);
  if (!sub) notFound();
  const view = buildMonitoringStatusView(sub, await loadStatusAuditRows(sub), new Date());
  const planName = findPlan(view.planKey)?.name ?? "AI Visibility Monitoring";
  const toneClass =
    view.access.tone === "ok" ? "text-severity-info" : view.access.tone === "warning" ? "text-severity-warning" : "text-white/50";

  return (
    <main>
      <Header />
      <section className="container-page py-16 md:py-20">
        <p className="section-eyebrow">{planName}</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">{view.businessName || view.websiteUrl}</h1>
        <p className="muted mt-2 text-sm">{view.websiteUrl}</p>

        <div className="mt-10 grid gap-4 md:grid-cols-4">
          <div className="card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Subscription</p>
            <p className={`mt-2 font-semibold ${toneClass}`}>{view.access.label}</p>
            {view.cancelAtPeriodEnd && view.currentPeriodEnd ? (
              <p className="mt-1 text-xs text-white/50">Ends {fmtDate(view.currentPeriodEnd)}</p>
            ) : null}
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Next scheduled audit</p>
            <p className="mono-data mt-2 text-white">
              {view.nextAuditAt ? fmtDate(view.nextAuditAt) : "None scheduled"}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Latest score</p>
            <p className="mono-data mt-2 text-2xl text-white">{view.latestScore ?? "—"}</p>
            <p className="mt-1 text-xs text-white/50">Previous: {view.previousScore ?? "—"}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Score change</p>
            <p className="mono-data mt-2 text-2xl text-white">
              {view.scoreChange === null ? "—" : view.scoreChange > 0 ? `+${view.scoreChange}` : view.scoreChange}
            </p>
            <p className="mt-1 text-xs text-white/50">vs. previous reviewed audit</p>
          </div>
        </div>

        <h2 className="h3 mt-14">Audits</h2>
        {view.audits.length === 0 ? (
          <p className="muted mt-3 text-sm">Your first monitoring audit is scheduled — it will appear here once it starts.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/[0.06] rounded-lg border border-white/10">
            {view.audits.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="text-white">
                    {fmtDate(a.createdAt)}
                    {a.isBaseline ? <span className="ml-2 text-xs text-white/45">Starting audit</span> : null}
                  </p>
                  <p className="text-xs text-white/50">{a.stateLabel}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {a.score !== null ? <span className="mono-data text-white">{a.score}/100</span> : null}
                  {a.reportUrl ? <a href={a.reportUrl} className="text-accent underline">Open report</a> : null}
                  {a.comparisonUrl ? <a href={a.comparisonUrl} className="text-white/70 underline">What changed</a> : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {view.canManageBilling ? (
          <form action="/api/monitoring/portal" method="POST" className="mt-12">
            <input type="hidden" name="token" value={params.token} />
            <button type="submit" className="btn-ghost">Manage billing or cancel</button>
            <p className="mt-2 text-xs text-white/45">Opens Stripe&apos;s secure billing portal.</p>
          </form>
        ) : null}

        <p className="mt-12 max-w-2xl text-xs text-white/40">
          Scores measure AI readability, crawlability, and trust signals using the same frozen GeoViz
          rubric on every audit. They are directional, not a guarantee of rankings or AI recommendations.
        </p>
      </section>
      <Footer />
    </main>
  );
}
