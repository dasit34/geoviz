/**
 * Prisma implementation of the website-scan store. Claims are
 * compare-and-set updates, so two runners never scan the same job; a
 * scan's snapshots, changes, and final status are written in one
 * transaction, and snapshot/change rows are never updated afterwards.
 */
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

import { DIFF_VERSION, type ScanForDiff, type SnapshotForDiff } from "./diff";
import { SCANNER_VERSION } from "./extract";
import type { ClaimedScan, PreviousScan, WebsiteScanStore } from "./scan-job";

const json = (v: unknown) => (v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue));
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const CLAIM_SELECT = {
  id: true,
  subscriptionId: true,
  siteKind: true,
  siteDomain: true,
  siteUrl: true,
  trackedCompetitorId: true,
  cycleKey: true,
  attempts: true,
  isFixture: true,
} as const;

type SnapshotRow = Prisma.PageSnapshotGetPayload<object>;

export function snapshotForDiff(p: SnapshotRow): SnapshotForDiff {
  const h = (p.headings ?? {}) as { h1?: unknown; h2?: unknown; h3?: unknown };
  return {
    url: p.url,
    normalizedUrl: p.normalizedUrl,
    discoveredVia: p.discoveredVia,
    fetchStatus: p.fetchStatus,
    httpStatus: p.httpStatus,
    title: p.title,
    metaDescription: p.metaDescription,
    headings: { h1: strArr(h.h1), h2: strArr(h.h2), h3: strArr(h.h3) },
    contentBlocks: strArr(p.contentBlocks),
    structuredData: (p.structuredData as SnapshotForDiff["structuredData"]) ?? null,
    identity: (p.identity as SnapshotForDiff["identity"]) ?? null,
    services: strArr(p.services),
    locations: strArr(p.locations),
  };
}

export const prismaWebsiteScanStore: WebsiteScanStore = {
  async enqueue({ subscriptionId, cycleKey, target, isFixture }) {
    // skipDuplicates → ON CONFLICT DO NOTHING on the unique key: idempotent without an error.
    const { count } = await prisma.websiteScan.createMany({
      data: [{
        subscriptionId,
        cycleKey,
        siteKind: target.siteKind,
        siteDomain: target.siteDomain,
        siteUrl: target.siteUrl,
        trackedCompetitorId: target.trackedCompetitorId,
        scannerVersion: SCANNER_VERSION,
        isFixture,
      }],
      skipDuplicates: true,
    });
    return count === 1 ? "created" : "exists";
  },

  async requeueStale(staleBefore, maxAttempts, now) {
    const failed = await prisma.websiteScan.updateMany({
      where: { status: "running", claimedAt: { lt: staleBefore }, attempts: { gte: maxAttempts } },
      data: { status: "failed", lastError: "runner stopped mid-scan; out of attempts", completedAt: now },
    });
    const requeued = await prisma.websiteScan.updateMany({
      where: { status: "running", claimedAt: { lt: staleBefore }, attempts: { lt: maxAttempts } },
      data: { status: "queued", claimedAt: null, nextRetryAt: now, lastError: "runner stopped mid-scan; re-queued" },
    });
    return { requeued: requeued.count, failed: failed.count };
  },

  async claimNext(now, subscriptionId) {
    for (let tries = 0; tries < 5; tries += 1) {
      const candidate = await prisma.websiteScan.findFirst({
        where: { status: "queued", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }], ...(subscriptionId ? { subscriptionId } : {}) },
        orderBy: [{ createdAt: "asc" }],
        select: { id: true, attempts: true },
      });
      if (!candidate) return null;
      const { count } = await prisma.websiteScan.updateMany({
        where: { id: candidate.id, status: "queued", attempts: candidate.attempts },
        data: { status: "running", claimedAt: now, startedAt: now, attempts: { increment: 1 } },
      });
      if (count === 1) {
        const row = await prisma.websiteScan.findUniqueOrThrow({ where: { id: candidate.id }, select: CLAIM_SELECT });
        return { ...row, siteKind: row.siteKind === "competitor" ? "competitor" : "customer" } satisfies ClaimedScan;
      }
    }
    return null;
  },

  async previousSuccessful(scan) {
    const prev = await prisma.websiteScan.findFirst({
      where: {
        subscriptionId: scan.subscriptionId,
        siteDomain: scan.siteDomain,
        isFixture: scan.isFixture,
        status: { in: ["completed", "partial"] },
        completedAt: { not: null },
        id: { not: scan.id },
      },
      orderBy: { completedAt: "desc" },
      include: { pages: true },
    });
    if (!prev || !prev.completedAt) return null;
    const scanForDiff: ScanForDiff = {
      id: prev.id,
      scannerVersion: prev.scannerVersion,
      completedAt: prev.completedAt,
      discoveredUrls: strArr(prev.discoveredUrls),
      discoveryComplete: prev.discoveryComplete,
      pages: prev.pages.map(snapshotForDiff),
    };
    const urls = prev.pages.filter((p) => p.fetchStatus === "ok").map((p) => p.url);
    return { ...scanForDiff, urls } satisfies PreviousScan;
  },

  async saveResult({ scan, result, diff, comparedTo, status, now }) {
    const pages = result.pages.map((p) => ({
      scanId: scan.id,
      subscriptionId: scan.subscriptionId,
      siteDomain: scan.siteDomain,
      url: p.url,
      normalizedUrl: p.normalizedUrl,
      discoveredVia: p.discoveredVia,
      fetchStatus: p.fetchStatus,
      httpStatus: p.httpStatus,
      finalUrl: p.finalUrl,
      fetchError: p.error,
      title: p.extracted?.title ?? null,
      metaDescription: p.extracted?.metaDescription ?? null,
      canonicalUrl: p.extracted?.canonicalUrl ?? null,
      headings: json(p.extracted?.headings ?? { h1: [], h2: [], h3: [] }),
      contentBlocks: json(p.extracted?.contentBlocks ?? []),
      contentFingerprint: p.extracted?.contentFingerprint ?? null,
      structuredData: json(p.extracted?.structuredData ?? null),
      identity: json(p.extracted?.identity ?? null),
      services: json(p.extracted?.services ?? []),
      locations: json(p.extracted?.locations ?? []),
      scannerVersion: result.scannerVersion,
      fetchedAt: p.fetchedAt,
    }));
    const changes = (diff?.changes ?? []).map((c) => ({
      subscriptionId: scan.subscriptionId,
      siteDomain: scan.siteDomain,
      siteKind: scan.siteKind,
      trackedCompetitorId: scan.trackedCompetitorId,
      fromScanId: comparedTo!.id,
      toScanId: scan.id,
      changeType: c.changeType,
      url: c.url,
      beforeExcerpt: c.beforeExcerpt,
      afterExcerpt: c.afterExcerpt,
      detail: json(c.detail),
      fromFetchedAt: comparedTo!.completedAt,
      toFetchedAt: now,
      diffVersion: DIFF_VERSION,
      isFixture: scan.isFixture,
    }));
    await prisma.$transaction([
      prisma.pageSnapshot.createMany({ data: pages, skipDuplicates: true }),
      ...(changes.length ? [prisma.websiteChange.createMany({ data: changes, skipDuplicates: true })] : []),
      prisma.websiteScan.update({
        where: { id: scan.id },
        data: {
          status,
          scannerVersion: result.scannerVersion,
          robotsOutcome: result.robotsOutcome,
          discoveredUrls: json(result.discoveredUrls),
          discoveryComplete: result.discoveryComplete,
          diffOutcome: diff?.kind ?? null,
          comparedToScanId: comparedTo?.id ?? null,
          pagesAttempted: result.pages.length,
          pagesOk: result.pages.filter((p) => p.fetchStatus === "ok").length,
          pagesFailed: result.pages.filter((p) => p.fetchStatus !== "ok").length,
          requests: { increment: result.requests },
          bytesFetched: { increment: result.bytesFetched },
          durationMs: result.durationMs,
          costUsd: 0,
          lastError: result.error,
          nextRetryAt: null,
          completedAt: now,
        },
      }),
    ]);
  },

  async scheduleRetry({ scan, result, error, nextRetryAt }) {
    await prisma.websiteScan.updateMany({
      where: { id: scan.id, status: "running" },
      data: {
        status: "queued",
        claimedAt: null,
        nextRetryAt,
        lastError: error.slice(0, 500),
        robotsOutcome: result?.robotsOutcome ?? null,
        requests: { increment: result?.requests ?? 0 },
        bytesFetched: { increment: result?.bytesFetched ?? 0 },
      },
    });
  },
};
