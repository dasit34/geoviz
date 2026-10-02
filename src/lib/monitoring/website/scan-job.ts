/**
 * Website scans as separate, retryable jobs (pure orchestration over a
 * store interface).
 *
 *   enqueue  — idempotent per (subscription, cycleKey, siteDomain); called
 *              by the scheduler AFTER the re-audit is queued, inside a
 *              try/catch, so website work can never block audits or
 *              question tracking.
 *   run      — claims queued scans atomically (compare-and-set), scans,
 *              diffs against the previous successful compatible scan, and
 *              stores immutable snapshots + changes in one write.
 *   retry    — transient failures (timeout, network, 5xx, robots.txt
 *              unreachable) are re-queued with backoff up to MAX_ATTEMPTS;
 *              site rules (robots disallow, 401/403, 404) are terminal and
 *              never bypassed.
 *   stale    — a scan stuck "running" past STALE_MS (crashed runner) is
 *              re-queued, or failed if out of attempts.
 *
 * No paid APIs are called; cost is recorded as 0 with requests, bytes, and
 * duration.
 */
import { diffScans, DIFF_VERSION, type ChangeDraft, type DiffOutcome, type ScanForDiff } from "./diff";
import { SCANNER_VERSION } from "./extract";
import { scanSite, type ScanDeps, type ScanLimits, type SiteScanResult } from "./scanner";
import type { ScanTarget } from "./targets";

export const MAX_ATTEMPTS = 3;
export const STALE_MS = 30 * 60_000;
export const BACKOFF_MS = [10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];

export type ClaimedScan = {
  id: string;
  subscriptionId: string;
  siteKind: "customer" | "competitor";
  siteDomain: string;
  siteUrl: string;
  trackedCompetitorId: string | null;
  cycleKey: string;
  attempts: number;
  isFixture: boolean;
};

export type PreviousScan = ScanForDiff & { urls: string[] };

export interface WebsiteScanStore {
  enqueue(row: { subscriptionId: string; cycleKey: string; target: ScanTarget; isFixture: boolean; now: Date }): Promise<"created" | "exists">;
  requeueStale(staleBefore: Date, maxAttempts: number, now: Date): Promise<{ requeued: number; failed: number }>;
  /** Atomically move one due queued scan to running (attempts + 1). */
  claimNext(now: Date, subscriptionId?: string): Promise<ClaimedScan | null>;
  previousSuccessful(scan: ClaimedScan): Promise<PreviousScan | null>;
  /** One write: page snapshots + changes + final scan status. */
  saveResult(args: { scan: ClaimedScan; result: SiteScanResult; diff: DiffOutcome | null; comparedTo: PreviousScan | null; status: string; now: Date }): Promise<void>;
  scheduleRetry(args: { scan: ClaimedScan; result: SiteScanResult | null; error: string; nextRetryAt: Date; now: Date }): Promise<void>;
}

export async function enqueueWebsiteScans(args: {
  store: WebsiteScanStore;
  subscriptionId: string;
  cycleKey: string;
  targets: ScanTarget[];
  isFixture?: boolean;
  now: Date;
}): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;
  for (const target of args.targets) {
    const r = await args.store.enqueue({ subscriptionId: args.subscriptionId, cycleKey: args.cycleKey, target, isFixture: args.isFixture ?? false, now: args.now });
    if (r === "created") created += 1;
    else existing += 1;
  }
  return { created, existing };
}

export type ScanJobOutcome = {
  scanId: string;
  siteDomain: string;
  status: string;
  diff: DiffOutcome["kind"] | null;
  changes: number;
  retryAt: Date | null;
  result: Pick<SiteScanResult, "robotsOutcome" | "requests" | "bytesFetched" | "durationMs" | "error"> & { pagesOk: number; pagesFailed: number };
};

export async function runQueuedWebsiteScans(args: {
  store: WebsiteScanStore;
  limits: (scan: ClaimedScan) => ScanLimits;
  scanDeps?: (scan: ClaimedScan) => ScanDeps;
  now: () => Date;
  maxScans: number;
  subscriptionId?: string;
}): Promise<{ stale: { requeued: number; failed: number }; outcomes: ScanJobOutcome[] }> {
  const now = args.now();
  const stale = await args.store.requeueStale(new Date(now.getTime() - STALE_MS), MAX_ATTEMPTS, now);
  const outcomes: ScanJobOutcome[] = [];
  for (let i = 0; i < args.maxScans; i += 1) {
    const scan = await args.store.claimNext(args.now(), args.subscriptionId);
    if (!scan) break;
    outcomes.push(await runOneScan(scan, args));
  }
  return { stale, outcomes };
}

async function runOneScan(
  scan: ClaimedScan,
  args: { store: WebsiteScanStore; limits: (scan: ClaimedScan) => ScanLimits; scanDeps?: (scan: ClaimedScan) => ScanDeps; now: () => Date },
): Promise<ScanJobOutcome> {
  const summarize = (r: SiteScanResult | null) => ({
    robotsOutcome: r?.robotsOutcome ?? "not_checked",
    requests: r?.requests ?? 0,
    bytesFetched: r?.bytesFetched ?? 0,
    durationMs: r?.durationMs ?? 0,
    error: r?.error ?? null,
    pagesOk: r?.pages.filter((p) => p.fetchStatus === "ok").length ?? 0,
    pagesFailed: r?.pages.filter((p) => p.fetchStatus !== "ok").length ?? 0,
  });
  const retryOrFail = async (result: SiteScanResult | null, error: string, retryable: boolean): Promise<ScanJobOutcome> => {
    const now = args.now();
    if (retryable && scan.attempts < MAX_ATTEMPTS) {
      const nextRetryAt = new Date(now.getTime() + BACKOFF_MS[Math.min(scan.attempts - 1, BACKOFF_MS.length - 1)]);
      await args.store.scheduleRetry({ scan, result, error, nextRetryAt, now });
      return { scanId: scan.id, siteDomain: scan.siteDomain, status: "queued", diff: null, changes: 0, retryAt: nextRetryAt, result: summarize(result) };
    }
    const status = result?.status === "blocked" ? "blocked" : "failed";
    if (result) await args.store.saveResult({ scan, result, diff: null, comparedTo: null, status, now });
    else {
      await args.store.saveResult({
        scan,
        result: { status: "failed", scannerVersion: SCANNER_VERSION, robotsOutcome: "not_checked", discoveredUrls: [], discoveryComplete: false, pages: [], requests: 0, bytesFetched: 0, durationMs: 0, error, retryable: false },
        diff: null,
        comparedTo: null,
        status: "failed",
        now,
      });
    }
    return { scanId: scan.id, siteDomain: scan.siteDomain, status, diff: null, changes: 0, retryAt: null, result: summarize(result) };
  };

  let previous: PreviousScan | null;
  let result: SiteScanResult;
  try {
    previous = await args.store.previousSuccessful(scan);
    result = await scanSite({ siteUrl: scan.siteUrl, limits: args.limits(scan), previousUrls: previous?.urls ?? [] }, args.scanDeps?.(scan) ?? {});
  } catch (err) {
    return retryOrFail(null, `scan crashed: ${(err as Error).message}`.slice(0, 300), true);
  }
  if (result.status === "failed" || result.status === "blocked") {
    return retryOrFail(result, result.error ?? result.status, result.retryable);
  }

  const now = args.now();
  const current: ScanForDiff = {
    id: scan.id,
    scannerVersion: result.scannerVersion,
    completedAt: now,
    discoveredUrls: result.discoveredUrls,
    discoveryComplete: result.discoveryComplete,
    pages: result.pages.map((p) => ({
      url: p.url,
      normalizedUrl: p.normalizedUrl,
      discoveredVia: p.discoveredVia,
      fetchStatus: p.fetchStatus,
      httpStatus: p.httpStatus,
      title: p.extracted?.title ?? null,
      metaDescription: p.extracted?.metaDescription ?? null,
      headings: p.extracted?.headings ?? { h1: [], h2: [], h3: [] },
      contentBlocks: p.extracted?.contentBlocks ?? [],
      structuredData: p.extracted?.structuredData ?? null,
      identity: p.extracted?.identity ?? null,
      services: p.extracted?.services ?? [],
      locations: p.extracted?.locations ?? [],
    })),
  };
  const diff = diffScans(previous, current);
  await args.store.saveResult({ scan, result, diff, comparedTo: previous, status: result.status, now });
  return { scanId: scan.id, siteDomain: scan.siteDomain, status: result.status, diff: diff.kind, changes: diff.changes.length, retryAt: null, result: summarize(result) };
}

export type { ChangeDraft };
export { DIFF_VERSION };
