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
  DuplicateSubscriptionError,
  MONITORING_PRODUCT_MARKER,
  REACTIVATES_METADATA_KEY,
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
  | { outcome: "reactivated"; subscription: MonitoringSubscriptionRecord };

/** Stripe statuses after which a subscription can never bill again. */
const ENDED_STATUSES = new Set(["canceled", "incomplete_expired"]);

function sameSite(a: string, b: string): boolean {
  const na = normalizeDomain(a);
  return na !== null && na === normalizeDomain(b);
}

/**
 * The ended record a new subscription should reattach to, if any:
 * the one named in the reactivation checkout's metadata, else the most
 * recent ended record bought with the same email for the same website.
 * Only ENDED records qualify — an active or past-due record is never
 * taken over — and the email + website must match either way.
 */
async function findReattachTarget(
  snapshot: SubscriptionSnapshot,
  email: string,
  websiteUrl: string,
  store: MonitoringStore,
): Promise<MonitoringSubscriptionRecord | null> {
  const eligible = (r: MonitoringSubscriptionRecord | null): r is MonitoringSubscriptionRecord =>
    r !== null && ENDED_STATUSES.has(r.status) && r.email === email && sameSite(r.websiteUrl, websiteUrl);

  const explicitId = snapshot.metadata[REACTIVATES_METADATA_KEY]?.trim();
  if (explicitId) {
    const named = await store.findById(explicitId);
    if (eligible(named)) return named;
  }
  const candidates = (await store.findByEmail(email))
    .filter(eligible)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return candidates[0] ?? null;
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

  const websiteUrl = snapshot.metadata.websiteUrl?.trim();
  const email = snapshot.metadata.email?.trim().toLowerCase();
  if (!websiteUrl || !email) {
    return { outcome: "ignored", reason: "monitoring subscription is missing websiteUrl/email metadata" };
  }

  const patch = billingPatch(snapshot, now);

  // Reactivation: reconnect to the ended record so questions, competitors,
  // cycles, reports, and history carry over.
  const target = await findReattachTarget(snapshot, email, websiteUrl, deps.store);
  if (target) {
    const nextAuditAt = mayQueueAuditFor(patch, now, now) ? now : null;
    const reattached = await deps.store.reattach(target.id, target.stripeSubscriptionId, snapshot.id, {
      ...patch,
      nextAuditAt,
      stripeCheckoutSessionId: null,
    });
    if (reattached) return { outcome: "reactivated", subscription: reattached };
    // A concurrent event for this same new subscription reattached first.
    const raced = await deps.store.findBySubscriptionId(snapshot.id);
    if (raced) return update(raced, snapshot, deps, now);
  }

  const cadenceDays = cadenceDaysForPlan(snapshot.metadata.planKey);
  // First audit is due immediately once the subscription is paid up.
  const firstAuditDue = mayQueueAuditFor(patch, now, now) ? now : null;

  let business = { businessId: null as string | null, baselineAuditOrderId: null as string | null };
  try {
    business = await deps.resolveBusiness(websiteUrl);
  } catch (err) {
    console.warn("[monitoring-sync] business resolution failed (non-fatal):", err);
  }

  try {
    const created = await deps.store.create({
      ...patch,
      accessToken: (deps.newAccessToken ?? generateAccessToken)(),
      planKey: snapshot.metadata.planKey || "monthly",
      stripeSubscriptionId: snapshot.id,
      websiteUrl,
      businessName: snapshot.metadata.businessName?.trim() || null,
      email,
      businessId: business.businessId,
      baselineAuditOrderId: business.baselineAuditOrderId,
      cadenceDays,
      nextAuditAt: firstAuditDue,
    });
    return { outcome: "created", subscription: created };
  } catch (err) {
    if (!(err instanceof DuplicateSubscriptionError)) throw err;
    // A concurrent event created the row first — apply as an update.
    const raced = await deps.store.findBySubscriptionId(snapshot.id);
    if (!raced) throw err;
    return update(raced, snapshot, deps, now);
  }
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
