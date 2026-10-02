/**
 * Sync one Stripe subscription into `MonitoringSubscription`.
 *
 * Stripe is the source of truth: callers pass a snapshot freshly read
 * from Stripe (not the possibly-stale event payload), so applying events
 * in any order — or the same event twice — converges on the same row.
 * Creation needs only the subscription's own metadata (written by our
 * checkout onto `subscription_data.metadata`), so a
 * `customer.subscription.*` event arriving before
 * `checkout.session.completed` still creates the row.
 */
import { randomBytes } from "node:crypto";

import { normalizeDomain } from "@/lib/business/normalize-domain";

import { mayQueueAuditFor } from "./access";
import { cadenceDaysForPlan } from "./plans";
import {
  DuplicateBusinessRecordError,
  DuplicateSubscriptionError,
  MONITORING_PRODUCT_MARKER,
  type MonitoringStore,
  type MonitoringSubscriptionRecord,
  type SubscriptionSnapshot,
} from "./types";

export type SyncDeps = {
  store: MonitoringStore;
  now: () => Date;
  /** Business identity + baseline audit lookup (fail-soft; may return nulls). */
  resolveBusiness: (websiteUrl: string) => Promise<{
    businessId: string | null;
    baselineAuditOrderId: string | null;
  }>;
  newAccessToken?: () => string;
};

export type SyncResult =
  | { outcome: "ignored"; reason: string }
  | { outcome: "created"; subscription: MonitoringSubscriptionRecord }
  | { outcome: "updated"; subscription: MonitoringSubscriptionRecord }
  /** A new Stripe subscription reattached to an ended record — history kept. */
  | { outcome: "reactivated"; subscription: MonitoringSubscriptionRecord }
  /** Paid subscription that lost to the record already attached to this business. */
  | { outcome: "duplicate"; monitoringSubscriptionId: string; reason: string };

/** Stripe statuses after which a subscription can never bill again. */
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

/** Bounded find → create/reattach attempts; every lost race re-reads the database. */
const MAX_CONVERGE_ATTEMPTS = 4;

/**
 * Business identity key. Together with the buyer email it is UNIQUE in the
 * database (`MonitoringSubscription @@unique([email, siteKey])`), so there
 * is at most one monitoring record per (email, business website) no matter
 * how many subscriptions are paid or how events interleave.
 */
export function siteKeyFor(websiteUrl: string): string {
  return normalizeDomain(websiteUrl) ?? websiteUrl.trim().toLowerCase();
}

function sameSite(a: string, b: string): boolean {
  const na = normalizeDomain(a);
  return na !== null && na === normalizeDomain(b);
}

/**
 * The ONE record for (email, siteKey). Legacy rows created before siteKey
 * existed are claimed (siteKey set atomically) on first contact, so the
 * unique index covers them from then on.
 */
async function findBusinessRecord(
  email: string,
  siteKey: string,
  websiteUrl: string,
  store: MonitoringStore,
): Promise<MonitoringSubscriptionRecord | null> {
  const keyed = await store.findBySiteKey(email, siteKey);
  if (keyed) return keyed;
  const legacy = (await store.findByEmail(email))
    .filter((r) => r.siteKey === null && sameSite(r.websiteUrl, websiteUrl))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const row of legacy) {
    if (await store.claimSiteKey(row.id, siteKey)) return { ...row, siteKey };
  }
  return store.findBySiteKey(email, siteKey);
}

export function generateAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isMonitoringSubscription(snapshot: Pick<SubscriptionSnapshot, "metadata">): boolean {
  return snapshot.metadata?.geoviz_product === MONITORING_PRODUCT_MARKER;
}

function billingPatch(snapshot: SubscriptionSnapshot, now: Date) {
  return {
    status: snapshot.status,
    stripeCustomerId: snapshot.customerId,
    stripePriceId: snapshot.priceId,
    cancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
    currentPeriodEnd: snapshot.currentPeriodEnd,
    canceledAt: snapshot.canceledAt,
    endedAt: snapshot.endedAt,
    lastSyncedAt: now,
  };
}

export async function syncSubscription(snapshot: SubscriptionSnapshot, deps: SyncDeps): Promise<SyncResult> {
  if (!isMonitoringSubscription(snapshot)) {
    return { outcome: "ignored", reason: "not a GeoViz monitoring subscription" };
  }
  const now = deps.now();

  const existing = await deps.store.findBySubscriptionId(snapshot.id);
  if (existing) return update(existing, snapshot, deps, now);

  // A late event for a Stripe subscription whose record has since been
  // reactivated onto a newer subscription: never resurrect it as a new
  // record, and never let its (ended) status overwrite the live one.
  if (await deps.store.findByPriorSubscriptionId(snapshot.id)) {
    return { outcome: "ignored", reason: "superseded Stripe subscription (record was reactivated)" };
  }

  // Any later event for a subscription already classified as a duplicate
  // only refreshes its ledger row.
  const knownDuplicate = await deps.store.findDuplicateSubscription(snapshot.id);
  if (knownDuplicate) return recordDuplicate(snapshot, knownDuplicate.monitoringSubscriptionId, deps, now);

  const websiteUrl = snapshot.metadata.websiteUrl?.trim();
  const email = snapshot.metadata.email?.trim().toLowerCase();
  if (!websiteUrl || !email) {
    return { outcome: "ignored", reason: "monitoring subscription is missing websiteUrl/email metadata" };
  }
  const siteKey = siteKeyFor(websiteUrl);
  const patch = billingPatch(snapshot, now);

  // Converge on the single (email, siteKey) record. Correctness rests on the
  // database: the unique index makes concurrent creates collide, and the
  // conditional reattach (WHERE stripeSubscriptionId = old) lets exactly one
  // concurrent reactivation win. A loser re-reads and becomes either an
  // update of its own row or a recorded duplicate — never a second record.
  for (let attempt = 0; attempt < MAX_CONVERGE_ATTEMPTS; attempt++) {
    const owner = await findBusinessRecord(email, siteKey, websiteUrl, deps.store);

    if (!owner) {
      const created = await tryCreate(snapshot, { email, siteKey, websiteUrl, patch }, deps, now);
      if (created) return created;
      continue; // another subscription created this business's record first
    }

    if (owner.stripeSubscriptionId === snapshot.id) return update(owner, snapshot, deps, now);

    if (ENDED_STATUSES.has(owner.status)) {
      // Reactivation: reconnect the ended record (history, questions,
      // competitors, cycles, reports all stay on it).
      const nextAuditAt = mayQueueAuditFor(patch, now, now) ? now : null;
      const reattached = await deps.store.reattach(owner.id, owner.stripeSubscriptionId, snapshot.id, {
        ...patch,
        nextAuditAt,
        stripeCheckoutSessionId: null,
      });
      if (reattached) return { outcome: "reactivated", subscription: reattached };
      const mine = await deps.store.findBySubscriptionId(snapshot.id);
      if (mine) return update(mine, snapshot, deps, now);
      continue; // a different new subscription reattached first — re-read
    }

    // The record is live on another Stripe subscription: this paid
    // subscription is a duplicate (double reactivation, second purchase).
    return recordDuplicate(snapshot, owner.id, deps, now);
  }
  // Only reachable under extreme contention; the webhook returns 500 and
  // Stripe redelivers, which re-runs this loop from a fresh read.
  throw new Error(`monitoring sync did not converge for ${snapshot.id}`);
}

async function tryCreate(
  snapshot: SubscriptionSnapshot,
  ctx: { email: string; siteKey: string; websiteUrl: string; patch: ReturnType<typeof billingPatch> },
  deps: SyncDeps,
  now: Date,
): Promise<SyncResult | null> {
  const cadenceDays = cadenceDaysForPlan(snapshot.metadata.planKey);
  // First audit is due immediately once the subscription is paid up.
  const firstAuditDue = mayQueueAuditFor(ctx.patch, now, now) ? now : null;

  let business = { businessId: null as string | null, baselineAuditOrderId: null as string | null };
  try {
    business = await deps.resolveBusiness(ctx.websiteUrl);
  } catch (err) {
    console.warn("[monitoring-sync] business resolution failed (non-fatal):", err);
  }

  try {
    const created = await deps.store.create({
      ...ctx.patch,
      accessToken: (deps.newAccessToken ?? generateAccessToken)(),
      planKey: snapshot.metadata.planKey || "monthly",
      stripeSubscriptionId: snapshot.id,
      websiteUrl: ctx.websiteUrl,
      siteKey: ctx.siteKey,
      businessName: snapshot.metadata.businessName?.trim() || null,
      email: ctx.email,
      businessId: business.businessId,
      baselineAuditOrderId: business.baselineAuditOrderId,
      cadenceDays,
      nextAuditAt: firstAuditDue,
    });
    return { outcome: "created", subscription: created };
  } catch (err) {
    if (err instanceof DuplicateBusinessRecordError) return null;
    if (!(err instanceof DuplicateSubscriptionError)) throw err;
    // A concurrent event for this same subscription created the row first.
    const raced = await deps.store.findBySubscriptionId(snapshot.id);
    if (!raced) throw err;
    return update(raced, snapshot, deps, now);
  }
}

async function recordDuplicate(
  snapshot: SubscriptionSnapshot,
  monitoringSubscriptionId: string,
  deps: SyncDeps,
  now: Date,
): Promise<SyncResult> {
  await deps.store.recordDuplicateSubscription({
    stripeSubscriptionId: snapshot.id,
    monitoringSubscriptionId,
    stripeCustomerId: snapshot.customerId,
    status: snapshot.status,
    now,
  });
  return {
    outcome: "duplicate",
    monitoringSubscriptionId,
    reason: "another subscription is already attached to this business — recorded for operator review",
  };
}

async function update(
  existing: MonitoringSubscriptionRecord,
  snapshot: SubscriptionSnapshot,
  deps: SyncDeps,
  now: Date,
): Promise<SyncResult> {
  const patch = billingPatch(snapshot, now);
  // (Re)activated with nothing scheduled — e.g. the first event we saw
  // was `incomplete`, or a past_due subscription was paid — start now.
  const nextAuditAt =
    existing.nextAuditAt === null && mayQueueAuditFor(patch, now, now) ? now : undefined;
  const updated = await deps.store.updateBilling(existing.id, {
    ...patch,
    ...(nextAuditAt ? { nextAuditAt } : {}),
  });
  return { outcome: "updated", subscription: updated };
}
