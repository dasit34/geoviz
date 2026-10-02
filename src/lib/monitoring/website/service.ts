/**
 * Database-backed website-tracking operations used by the scheduler, the
 * scan runner, the edit route, and the status page. Rules live in the pure
 * modules (targets, scanner, diff, scan-job, findings); this file loads
 * and saves.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";
import { prisma } from "@/lib/db";

import { entitlementsForPlan } from "../plans";
import type { Recommendation } from "../tracking/recommendations";
import { canEditTracking, type MutationResult } from "../tracking/service";
import type { MonitoringSubscriptionRecord } from "../types";
import { websiteFindings } from "./findings";
import { prismaWebsiteScanStore } from "./prisma-store";
import { enqueueWebsiteScans, runQueuedWebsiteScans, type ClaimedScan } from "./scan-job";
import type { ScanDeps, ScanLimits } from "./scanner";
import { decideCompetitorWebsite, scanTargets } from "./targets";

export async function enqueueWebsiteScansForSubscription(
  sub: Pick<MonitoringSubscriptionRecord, "id" | "planKey" | "websiteUrl" | "businessName">,
  cycleKey: string,
  now = new Date(),
) {
  const ent = entitlementsForPlan(sub.planKey).websiteTracking;
  if (!ent.enabled) return { created: 0, existing: 0, skipped: [] as Array<{ id: string; name: string; reason: string }> };
  const competitors = await prisma.trackedCompetitor.findMany({ where: { subscriptionId: sub.id, isActive: true }, orderBy: { createdAt: "asc" } });
  const { targets, skipped } = scanTargets({ customer: sub, competitors, entitlement: ent });
  const r = await enqueueWebsiteScans({ store: prismaWebsiteScanStore, subscriptionId: sub.id, cycleKey, targets, now });
  return { ...r, skipped };
}

/** Run queued scans (limits always come from the subscription's plan). */
export async function runWebsiteScans(opts: { maxScans: number; subscriptionId?: string; scanDeps?: (scan: ClaimedScan) => ScanDeps }) {
  const planKeys = new Map<string, string>();
  const subIds = await prisma.websiteScan.findMany({ where: { status: { in: ["queued", "running"] }, ...(opts.subscriptionId ? { subscriptionId: opts.subscriptionId } : {}) }, select: { subscriptionId: true }, distinct: ["subscriptionId"] });
  const subs = await prisma.monitoringSubscription.findMany({ where: { id: { in: subIds.map((s) => s.subscriptionId) } }, select: { id: true, planKey: true } });
  subs.forEach((s) => planKeys.set(s.id, s.planKey));
  const limits = (scan: ClaimedScan): ScanLimits => {
    const ent = entitlementsForPlan(planKeys.get(scan.subscriptionId)).websiteTracking;
    return { maxPagesPerSite: ent.maxPagesPerSite, maxSitemapUrlsRead: ent.maxSitemapUrlsRead };
  };
  return runQueuedWebsiteScans({ store: prismaWebsiteScanStore, limits, scanDeps: opts.scanDeps, now: () => new Date(), maxScans: opts.maxScans, subscriptionId: opts.subscriptionId });
}

/** Customer (or operator) supplies a competitor's website — the only way a competitor domain becomes confirmed. */
export async function setCompetitorWebsite(sub: MonitoringSubscriptionRecord, competitorId: string, websiteUrl: string): Promise<MutationResult> {
  if (!canEditTracking(sub)) return { ok: false, message: "Your subscription isn't active, so tracking is read-only." };
  const comp = await prisma.trackedCompetitor.findFirst({ where: { id: competitorId, subscriptionId: sub.id, isActive: true } });
  if (!comp) return { ok: false, message: "Competitor not found." };
  const others = await prisma.trackedCompetitor.findMany({ where: { subscriptionId: sub.id, isActive: true, id: { not: comp.id }, domain: { not: null } }, select: { domain: true } });
  const d = decideCompetitorWebsite({ websiteUrl, customerWebsiteUrl: sub.websiteUrl, otherCompetitorDomains: others.map((o) => o.domain!) });
  if (!d.ok) return d;
  await prisma.trackedCompetitor.update({ where: { id: comp.id }, data: { websiteUrl: d.websiteUrl, domain: d.domain, domainConfirmedAt: new Date() } });
  return { ok: true };
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type WebsiteSiteView = {
  siteKind: "customer" | "competitor";
  label: string;
  domain: string | null;
  competitorId: string | null;
  /** Competitor without a confirmed website — shown as "add website". */
  needsWebsite: boolean;
  baselineAt: Date | null;
  latest: {
    status: string;
    completedAt: Date | null;
    diffOutcome: string | null;
    robotsOutcome: string | null;
    pagesOk: number;
    pagesFailed: number;
    requests: number;
    bytesFetched: number;
    durationMs: number | null;
    lastError: string | null;
    isFixture: boolean;
    nextRetryAt: Date | null;
  } | null;
  uncheckable: Array<{ url: string; fetchStatus: string; httpStatus: number | null }>;
};

export type WebsiteChangeView = {
  id: string;
  siteKind: string;
  siteDomain: string;
  siteLabel: string;
  changeType: string;
  url: string;
  beforeExcerpt: string | null;
  afterExcerpt: string | null;
  detail: unknown;
  fromFetchedAt: Date;
  toFetchedAt: Date;
  isFixture: boolean;
};

/** Everything the Website Changes tab needs. */
export async function loadWebsiteDashboard(sub: MonitoringSubscriptionRecord): Promise<{
  enabled: boolean;
  limits: { maxPagesPerSite: number; maxCompetitorSites: number };
  sites: WebsiteSiteView[];
  changes: WebsiteChangeView[];
  findings: Recommendation[];
}> {
  const ent = entitlementsForPlan(sub.planKey).websiteTracking;
  const competitors = await prisma.trackedCompetitor.findMany({ where: { subscriptionId: sub.id, isActive: true }, orderBy: { createdAt: "asc" } });
  const customerDomain = normalizeDomain(sub.websiteUrl);
  const labelFor = new Map<string, string>();
  if (customerDomain) labelFor.set(customerDomain, "Your website");
  competitors.forEach((c) => c.domain && labelFor.set(c.domain, c.name));

  const sites: WebsiteSiteView[] = [];
  const siteRows: Array<{ siteKind: "customer" | "competitor"; label: string; domain: string | null; competitorId: string | null; needsWebsite: boolean }> = [
    { siteKind: "customer", label: sub.businessName || customerDomain || "Your website", domain: customerDomain, competitorId: null, needsWebsite: false },
    ...competitors.map((c) => ({ siteKind: "competitor" as const, label: c.name, domain: c.domainConfirmedAt ? c.domain : null, competitorId: c.id, needsWebsite: !c.domainConfirmedAt || !c.domain })),
  ];
  // Fixture sites (demonstration data) are listed too, clearly labelled.
  const fixtureDomains = await prisma.websiteScan.findMany({ where: { subscriptionId: sub.id, isFixture: true }, select: { siteDomain: true, siteKind: true }, distinct: ["siteDomain"] });
  for (const f of fixtureDomains) {
    if (!siteRows.some((r) => r.domain === f.siteDomain)) {
      siteRows.push({ siteKind: f.siteKind === "competitor" ? "competitor" : "customer", label: `Fixture site (${f.siteDomain})`, domain: f.siteDomain, competitorId: null, needsWebsite: false });
      labelFor.set(f.siteDomain, `Fixture site (${f.siteDomain})`);
    }
  }

  for (const row of siteRows) {
    if (!row.domain) {
      sites.push({ ...row, baselineAt: null, latest: null, uncheckable: [] });
      continue;
    }
    const [latest, first] = await Promise.all([
      prisma.websiteScan.findFirst({ where: { subscriptionId: sub.id, siteDomain: row.domain, status: { notIn: ["running"] } }, orderBy: { createdAt: "desc" } }),
      prisma.websiteScan.findFirst({ where: { subscriptionId: sub.id, siteDomain: row.domain, status: { in: ["completed", "partial"] } }, orderBy: { completedAt: "asc" }, select: { completedAt: true } }),
    ]);
    const failedPages = latest && latest.status !== "queued"
      ? await prisma.pageSnapshot.findMany({ where: { scanId: latest.id, fetchStatus: { not: "ok" } }, select: { url: true, fetchStatus: true, httpStatus: true } })
      : [];
    sites.push({
      ...row,
      baselineAt: first?.completedAt ?? null,
      latest: latest
        ? {
            status: latest.status,
            completedAt: latest.completedAt,
            diffOutcome: latest.diffOutcome,
            robotsOutcome: latest.robotsOutcome,
            pagesOk: latest.pagesOk,
            pagesFailed: latest.pagesFailed,
            requests: latest.requests,
            bytesFetched: latest.bytesFetched,
            durationMs: latest.durationMs,
            lastError: latest.lastError,
            isFixture: latest.isFixture,
            nextRetryAt: latest.nextRetryAt,
          }
        : null,
      // Confirmed 404/410s are reported as removals, not here.
      uncheckable: failedPages.filter((p) => !(p.fetchStatus === "not_found" && (p.httpStatus === 404 || p.httpStatus === 410))),
    });
  }

  const changeRows = await prisma.websiteChange.findMany({ where: { subscriptionId: sub.id }, orderBy: [{ toFetchedAt: "desc" }, { createdAt: "asc" }], take: 60 });
  const changes: WebsiteChangeView[] = changeRows.map((c) => ({
    id: c.id,
    siteKind: c.siteKind,
    siteDomain: c.siteDomain,
    siteLabel: labelFor.get(c.siteDomain) ?? c.siteDomain,
    changeType: c.changeType,
    url: c.url,
    beforeExcerpt: c.beforeExcerpt,
    afterExcerpt: c.afterExcerpt,
    detail: c.detail,
    fromFetchedAt: c.fromFetchedAt,
    toFetchedAt: c.toFetchedAt,
    isFixture: c.isFixture,
  }));

  // Customer topics from the latest successful real scan of the customer's site.
  let customerTopics: string[] = [];
  if (customerDomain) {
    const scan = await prisma.websiteScan.findFirst({ where: { subscriptionId: sub.id, siteDomain: customerDomain, isFixture: false, status: { in: ["completed", "partial"] } }, orderBy: { completedAt: "desc" }, select: { id: true } });
    if (scan) {
      const pages = await prisma.pageSnapshot.findMany({ where: { scanId: scan.id, fetchStatus: "ok" }, select: { title: true, headings: true, services: true, locations: true } });
      customerTopics = pages.flatMap((p) => {
        const h = (p.headings ?? {}) as { h1?: unknown; h2?: unknown };
        return [p.title ?? "", ...strArr(h.h1), ...strArr(h.h2), ...strArr(p.services), ...strArr(p.locations)].filter(Boolean);
      });
    }
  }
  const findings = websiteFindings({ changes: changes.filter((c) => !c.isFixture), customerTopics });

  return { enabled: ent.enabled, limits: { maxPagesPerSite: ent.maxPagesPerSite, maxCompetitorSites: ent.maxCompetitorSites }, sites, changes, findings };
}
