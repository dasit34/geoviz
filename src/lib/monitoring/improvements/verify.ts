/**
 * Independent verification of implemented tasks as retryable jobs (pure
 * orchestration over a store interface). One check = robots.txt + one page
 * through the SSRF-safe fetcher. Transient failures retry with backoff; a
 * page that still can't be fetched — or that robots.txt / access controls
 * keep us from reading — ends as "Could not verify", never as verified.
 */
import { normalizeDomain } from "@/lib/business/normalize-domain";

import { extractPage } from "../website/extract";
import { crawlDelayMs, isAllowed, robotsPolicyFrom } from "../website/robots";
import type { Fetcher } from "../website/scanner";
import { safeFetch } from "../website/safe-fetch";
import type { Expectation } from "./drafts";
import { evaluate, type CheckedPage, type Evaluation } from "./expectations";

export const VERIFY_MAX_ATTEMPTS = 3;
export const VERIFY_BACKOFF_MS = [10 * 60_000, 60 * 60_000];
export const VERIFY_STALE_MS = 15 * 60_000;
const TRANSIENT = new Set(["timeout", "network_error", "http_error", "robots_unavailable"]);

export type ClaimedVerification = { id: string; taskId: string; subscriptionId: string; url: string; expected: Expectation; attempts: number; isFixture: boolean };

export interface VerificationStore {
  requeueStale(before: Date, now: Date): Promise<number>;
  /** Claims only real checks unless `fixtures` is set (staging fixture demo only). */
  claimNext(now: Date, opts: { subscriptionId?: string; fixtures?: boolean }): Promise<ClaimedVerification | null>;
  complete(args: { v: ClaimedVerification; evaluation: Evaluation; fetchStatus: string; now: Date }): Promise<void>;
  scheduleRetry(args: { v: ClaimedVerification; error: string; nextRetryAt: Date }): Promise<void>;
}

export async function checkPage(url: string, deps: { fetcher?: Fetcher; sleep?: (ms: number) => Promise<void> } = {}): Promise<CheckedPage & { robots: string }> {
  const fetcher: Fetcher = deps.fetcher ?? ((u, o) => safeFetch(u, o));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const site = normalizeDomain(url);
  const base = { url, httpStatus: null, extracted: null };
  if (!site) return { ...base, fetchStatus: "blocked_unsafe", robots: "not_checked" };
  const origin = new URL(url).origin;
  const robotsRes = await fetcher(`${origin}/robots.txt`, { site, accept: "text" });
  const policy = robotsPolicyFrom(robotsRes.ok ? { ok: true, body: robotsRes.body } : robotsRes);
  if (policy.kind === "disallow_all") return { ...base, fetchStatus: "network_error", robots: "unavailable" };
  if (policy.kind === "rules" && !isAllowed(policy.robots, url)) return { ...base, fetchStatus: "blocked_robots", robots: "disallowed" };
  await sleep(crawlDelayMs(policy));
  const res = await fetcher(url, { site, accept: "html" });
  if (!res.ok) return { url, fetchStatus: res.fetchStatus, httpStatus: res.httpStatus, extracted: null, robots: policy.kind };
  try {
    return { url, fetchStatus: "ok", httpStatus: res.status, extracted: extractPage(res.body, res.finalUrl), robots: policy.kind };
  } catch {
    return { url, fetchStatus: "network_error", httpStatus: res.status, extracted: null, robots: policy.kind };
  }
}

export type VerifyOutcome = { id: string; taskId: string; outcome: Evaluation["outcome"] | "retry"; fetchStatus: string };

export async function runQueuedVerifications(args: {
  store: VerificationStore;
  now: () => Date;
  maxChecks: number;
  subscriptionId?: string;
  fixtures?: boolean;
  deps?: (v: ClaimedVerification) => { fetcher?: Fetcher; sleep?: (ms: number) => Promise<void> };
}): Promise<{ stale: number; outcomes: VerifyOutcome[] }> {
  const stale = await args.store.requeueStale(new Date(args.now().getTime() - VERIFY_STALE_MS), args.now());
  const outcomes: VerifyOutcome[] = [];
  for (let i = 0; i < args.maxChecks; i += 1) {
    const v = await args.store.claimNext(args.now(), { subscriptionId: args.subscriptionId, fixtures: args.fixtures });
    if (!v) break;
    let page: CheckedPage & { robots?: string };
    try {
      page = await checkPage(v.url, args.deps?.(v));
    } catch (err) {
      page = { url: v.url, fetchStatus: "network_error", httpStatus: null, extracted: null };
      void err;
    }
    const transient = TRANSIENT.has(page.fetchStatus) || (page as { robots?: string }).robots === "unavailable";
    if (transient && v.attempts < VERIFY_MAX_ATTEMPTS) {
      const nextRetryAt = new Date(args.now().getTime() + VERIFY_BACKOFF_MS[Math.min(v.attempts - 1, VERIFY_BACKOFF_MS.length - 1)]!);
      await args.store.scheduleRetry({ v, error: page.fetchStatus, nextRetryAt });
      outcomes.push({ id: v.id, taskId: v.taskId, outcome: "retry", fetchStatus: page.fetchStatus });
      continue;
    }
    const evaluation = evaluate(v.expected, page);
    await args.store.complete({ v, evaluation, fetchStatus: page.fetchStatus, now: args.now() });
    outcomes.push({ id: v.id, taskId: v.taskId, outcome: evaluation.outcome, fetchStatus: page.fetchStatus });
  }
  return { stale, outcomes };
}
