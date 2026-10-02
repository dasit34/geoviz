import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import {
  ActionsSection,
  CitationsSection,
  CompetitorsSection,
  MONITORING_TABS,
  MonitoringTabs,
  OverviewSection,
  PromptsSection,
  ReportsSection,
  ScoreHistorySection,
  type MonitoringTabKey,
} from "@/components/MonitoringDashboard";
import { findPlan, isMonitoringEnabled } from "@/lib/monitoring/plans";
import { findSubscriptionByToken, loadStatusAuditRows } from "@/lib/monitoring/prisma-store";
import { buildMonitoringStatusView } from "@/lib/monitoring/status-view";
import { loadTrackingDashboard } from "@/lib/monitoring/tracking/service";
import { checkPageRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Your AI Visibility Monitoring · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Customer monitoring dashboard. The random token in the URL is the only
 * credential — no login (same capability model as report pages).
 */
export default async function MonitoringStatusPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams?: { tab?: string; notice?: string };
}) {
  if (!isMonitoringEnabled()) notFound();

  const rl = checkPageRateLimit({ headers: headers(), routeKey: "page:monitoring:status", limit: 60, windowMs: 5 * 60_000 });
  if (rl.blocked) {
    return (
      <main>
        <Header />
        <section className="container-page py-24 text-center"><p className="muted">Too many requests. Please try again shortly.</p></section>
        <Footer />
      </main>
    );
  }

  const sub = await findSubscriptionByToken(params.token);
  if (!sub) notFound();

  const tab: MonitoringTabKey = MONITORING_TABS.some((t) => t.key === searchParams?.tab) ? (searchParams!.tab as MonitoringTabKey) : "overview";
  const [rows, tracking] = await Promise.all([loadStatusAuditRows(sub), loadTrackingDashboard(sub)]);
  const view = buildMonitoringStatusView(sub, rows, new Date());
  const planName = findPlan(view.planKey)?.name ?? "AI Visibility Monitoring";
  const notice = typeof searchParams?.notice === "string" ? searchParams.notice.slice(0, 200) : null;

  return (
    <main>
      <Header />
      <section className="container-page py-14 md:py-16">
        <p className="section-eyebrow">{planName}</p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">{view.businessName || view.websiteUrl}</h1>
        <p className="muted mt-2 text-sm">{view.websiteUrl} · {view.access.label}</p>

        <MonitoringTabs token={params.token} active={tab} />
        {notice ? <p role="status" className="mt-4 text-sm text-severity-warning">{notice}</p> : null}

        {tab === "overview" ? <OverviewSection view={view} metrics={tracking.metrics} comparison={tracking.comparison} /> : null}
        {tab === "history" ? <ScoreHistorySection view={view} cycleHistory={tracking.cycleHistory} /> : null}
        {tab === "prompts" ? (
          <PromptsSection
            token={params.token}
            prompts={tracking.prompts}
            providers={tracking.entitlements.providers}
            suggestions={tracking.suggestions}
            maxActivePrompts={tracking.entitlements.maxActivePrompts}
            canEdit={tracking.canEdit}
          />
        ) : null}
        {tab === "competitors" ? (
          <CompetitorsSection
            token={params.token}
            competitors={tracking.competitors}
            detected={tracking.detectedCompetitors}
            metrics={tracking.metrics}
            maxCompetitors={tracking.entitlements.maxCompetitors}
            canEdit={tracking.canEdit}
          />
        ) : null}
        {tab === "citations" ? <CitationsSection citations={tracking.citations} /> : null}
        {tab === "reports" ? <ReportsSection view={view} /> : null}
        {tab === "actions" ? <ActionsSection recommendations={tracking.recommendations} /> : null}

        {view.canManageBilling ? (
          <form action="/api/monitoring/portal" method="POST" className="mt-14">
            <input type="hidden" name="token" value={params.token} />
            <button type="submit" className="btn-ghost">Manage billing or cancel</button>
            <p className="mt-2 text-xs text-white/45">Opens Stripe&apos;s secure billing portal.</p>
          </form>
        ) : null}

        <p className="mt-12 max-w-3xl text-xs text-white/40">
          AI answers come from each provider&apos;s API (with web search where available), not the consumer ChatGPT, Claude, Gemini,
          or Perplexity apps, and can vary from run to run. Scores and rates are directional measurements, not a guarantee of
          rankings or AI recommendations.
        </p>
      </section>
      <Footer />
    </main>
  );
}
