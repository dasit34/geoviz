import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ImprovementsSection } from "@/components/ImprovementsSection";
import { MonitoringSettingsSection } from "@/components/MonitoringSettingsSection";
import { WebsiteChangesSection } from "@/components/WebsiteChangesSection";
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
import { prismaMonitoringAuthStore } from "@/lib/monitoring/auth/prisma-auth-store";
import { listCustomerSubscriptions, requireOwnedSubscription } from "@/lib/monitoring/auth/session";
import { billingActionsFor } from "@/lib/monitoring/billing-actions";
import { loadImprovementsDashboard } from "@/lib/monitoring/improvements/service";
import { findPlan, isMonitoringEnabled } from "@/lib/monitoring/plans";
import { loadStatusAuditRows } from "@/lib/monitoring/prisma-store";
import { buildMonitoringStatusView } from "@/lib/monitoring/status-view";
import { loadTrackingDashboard } from "@/lib/monitoring/tracking/service";
import { loadWebsiteDashboard } from "@/lib/monitoring/website/service";
import { checkPageRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const metadata = {
  title: "Your AI Visibility Monitoring · GeoViz",
  robots: { index: false, follow: false },
};

/**
 * Signed-in monitoring dashboard for ONE business the customer owns.
 * Unknown ids and other customers' ids are both a plain 404.
 */
export default async function MonitoringAccountDashboardPage({
  params,
  searchParams,
}: {
  params: { subscriptionId: string };
  searchParams?: { tab?: string; notice?: string };
}) {
  if (!isMonitoringEnabled()) notFound();

  const rl = checkPageRateLimit({ headers: headers(), routeKey: "page:monitoring:account", limit: 120, windowMs: 5 * 60_000 });
  if (rl.blocked) {
    return (
      <main>
        <Header />
        <section className="container-page py-24 text-center"><p className="muted">Too many requests. Please try again shortly.</p></section>
        <Footer />
      </main>
    );
  }

  const owned = await requireOwnedSubscription(params.subscriptionId);
  if (owned.status === "signed_out") redirect("/monitoring/sign-in?error=session");
  if (owned.status === "not_found") notFound();
  const { sub, customerId } = owned;

  const tab: MonitoringTabKey = MONITORING_TABS.some((t) => t.key === searchParams?.tab) ? (searchParams!.tab as MonitoringTabKey) : "overview";
  const now = new Date();
  const website = await loadWebsiteDashboard(sub);
  const [rows, tracking, customer, all] = await Promise.all([
    loadStatusAuditRows(sub),
    loadTrackingDashboard(sub, { websiteFindings: website.findings }),
    prismaMonitoringAuthStore.findCustomerById(customerId),
    listCustomerSubscriptions(customerId),
  ]);
  const view = buildMonitoringStatusView(sub, rows, now);
  const improvements =
    tab === "improvements" || tab === "actions"
      ? await loadImprovementsDashboard(sub, tracking.recommendations)
      : null;
  const planName = findPlan(view.planKey)?.name ?? "AI Visibility Monitoring";
  const notice = typeof searchParams?.notice === "string" ? searchParams.notice.slice(0, 200) : null;

  return (
    <main>
      <Header />
      <section className="container-page py-14 md:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="section-eyebrow">{planName}</p>
          <div className="flex items-center gap-3 text-xs">
            {all.length > 1 ? <a href="/monitoring/account?choose=1" className="text-white/60 underline hover:text-white">All businesses</a> : null}
            <form action="/api/monitoring/auth/sign-out" method="POST">
              <button type="submit" className="text-white/60 underline hover:text-white">Sign out</button>
            </form>
          </div>
        </div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-white">{view.businessName || view.websiteUrl}</h1>
        <p className="muted mt-2 text-sm">{view.websiteUrl} · {view.access.label}</p>
        {view.access.tone === "ended" ? (
          <p className="mt-3 text-sm text-white/60">
            Monitoring has ended. Your results, reports, and history stay available read-only — reactivate from Settings to resume.
          </p>
        ) : null}

        <MonitoringTabs subscriptionId={sub.id} active={tab} />
        {notice ? <p role="status" className="mt-4 text-sm text-severity-warning">{notice}</p> : null}

        {tab === "overview" ? (
          <OverviewSection view={view} metrics={tracking.metrics} comparison={tracking.comparison} samplesPerPrompt={tracking.latestCycle?.samplesPerPrompt ?? null} />
        ) : null}
        {tab === "history" ? <ScoreHistorySection view={view} cycleHistory={tracking.cycleHistory} /> : null}
        {tab === "prompts" ? (
          <PromptsSection
            subscriptionId={sub.id}
            prompts={tracking.prompts}
            providers={tracking.entitlements.providers}
            suggestions={tracking.suggestions}
            maxActivePrompts={tracking.entitlements.maxActivePrompts}
            canEdit={tracking.canEdit}
          />
        ) : null}
        {tab === "competitors" ? (
          <CompetitorsSection
            subscriptionId={sub.id}
            competitors={tracking.competitors}
            detected={tracking.detectedCompetitors}
            metrics={tracking.metrics}
            maxCompetitors={tracking.entitlements.maxCompetitors}
            canEdit={tracking.canEdit}
          />
        ) : null}
        {tab === "citations" ? <CitationsSection citations={tracking.citations} /> : null}
        {tab === "website" ? (
          <WebsiteChangesSection
            subscriptionId={sub.id}
            sites={website.sites}
            changes={website.changes}
            cycles={tracking.cycleHistory}
            limits={website.limits}
            canEdit={tracking.canEdit}
          />
        ) : null}
        {tab === "reports" ? <ReportsSection view={view} /> : null}
        {tab === "actions" ? (
          <ActionsSection
            recommendations={tracking.recommendations}
            subscriptionId={sub.id}
            canEdit={tracking.canEdit}
            taskByRecommendation={improvements?.taskByRecommendation ?? {}}
          />
        ) : null}
        {tab === "improvements" && improvements ? <ImprovementsSection subscriptionId={sub.id} d={improvements} /> : null}
        {tab === "settings" ? (
          <MonitoringSettingsSection
            subscriptionId={sub.id}
            view={view}
            accountEmail={customer?.email ?? sub.email}
            billing={billingActionsFor(sub, now)}
            canEdit={tracking.canEdit}
          />
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
