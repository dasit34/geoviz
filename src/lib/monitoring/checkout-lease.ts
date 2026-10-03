/**
 * Monitoring checkout lease — prevention layer against double billing.
 *
 * At most ONE payable Stripe Checkout session exists per (buyer email,
 * business) at a time, for new purchases and reactivations alike:
 *  - The lease row's primary key is sha256(email|siteKey), so two concurrent
 *    requests cannot both insert it; taking over a finished/expired lease is
 *    a conditional UPDATE on (leaseKey, attempt), so only one wins.
 *  - The winner creates the Checkout session with a Stripe idempotency key
 *    derived from (leaseKey, attempt); a retried request can't create a
 *    second session for the same attempt.
 *  - Losers get the SAME checkout URL (or "in progress" while it's being
 *    created) — never an independent session.
 *  - The Checkout session expires with the lease, so an expired lease can
 *    never coexist with a payable session.
 * The webhook compensation layer (duplicate-compensation.ts) still handles
 * anything that gets past this.
 */
import { createHash } from "node:crypto";

import type Stripe from "stripe";

/** Stripe requires expires_at ≥ 30 min ahead; the lease outlives the session slightly. */
export const CHECKOUT_SESSION_TTL_MS = 31 * 60_000;
export const CHECKOUT_LEASE_TTL_MS = CHECKOUT_SESSION_TTL_MS + 60_000;

export type CheckoutKind = "new" | "reactivation";

export type CheckoutLeaseRow = {
  leaseKey: string;
  email: string;
  siteKey: string;
  kind: string;
  monitoringSubscriptionId: string | null;
  status: string;
  attempt: number;
  stripeCheckoutSessionId: string | null;
  checkoutUrl: string | null;
  expiresAt: Date;
};

export interface CheckoutLeaseStore {
  get(leaseKey: string): Promise<CheckoutLeaseRow | null>;
  /** INSERT; false when the key already exists (unique primary key). */
  insert(row: CheckoutLeaseRow): Promise<boolean>;
  /**
   * Conditional takeover of a finished or expired lease at `expectedAttempt`.
   * Null when another request took it first or it is still open and live.
   */
  takeover(leaseKey: string, expectedAttempt: number, now: Date, next: Omit<CheckoutLeaseRow, "leaseKey" | "email" | "siteKey">): Promise<CheckoutLeaseRow | null>;
  attachSession(leaseKey: string, attempt: number, sessionId: string, url: string): Promise<void>;
  /** checkout.session.completed → the lease is done. */
  completeBySession(sessionId: string): Promise<void>;
  /** Session creation failed → free the lease immediately. */
  release(leaseKey: string, attempt: number): Promise<void>;
}

export function leaseKeyFor(email: string, siteKey: string): string {
  return createHash("sha256").update(`${email.trim().toLowerCase()}|${siteKey}`, "utf8").digest("hex");
}

export function checkoutIdempotencyKey(lease: Pick<CheckoutLeaseRow, "leaseKey" | "attempt" | "kind">): string {
  return `geoviz-monitoring-checkout-${lease.kind}-${lease.leaseKey.slice(0, 32)}-${lease.attempt}`;
}

export type AcquireResult =
  | { status: "acquired"; lease: CheckoutLeaseRow }
  | { status: "reuse"; url: string }
  | { status: "in_progress" };

const isLive = (row: CheckoutLeaseRow, now: Date) => row.status === "open" && row.expiresAt.getTime() > now.getTime();

export async function acquireCheckoutLease(
  args: { email: string; siteKey: string; kind: CheckoutKind; monitoringSubscriptionId: string | null },
  store: CheckoutLeaseStore,
  now: Date,
): Promise<AcquireResult> {
  const leaseKey = leaseKeyFor(args.email, args.siteKey);
  const fresh = {
    kind: args.kind,
    monitoringSubscriptionId: args.monitoringSubscriptionId,
    status: "open",
    stripeCheckoutSessionId: null,
    checkoutUrl: null,
    expiresAt: new Date(now.getTime() + CHECKOUT_LEASE_TTL_MS),
  };

  let row = await store.get(leaseKey);
  if (!row) {
    const lease: CheckoutLeaseRow = { leaseKey, email: args.email.trim().toLowerCase(), siteKey: args.siteKey, attempt: 1, ...fresh };
    if (await store.insert(lease)) return { status: "acquired", lease };
    row = await store.get(leaseKey);
    if (!row) return { status: "in_progress" };
  }
  if (isLive(row, now)) return row.checkoutUrl ? { status: "reuse", url: row.checkoutUrl } : { status: "in_progress" };

  const taken = await store.takeover(leaseKey, row.attempt, now, { ...fresh, attempt: row.attempt + 1 });
  if (taken) return { status: "acquired", lease: taken };
  const current = await store.get(leaseKey);
  if (current && isLive(current, now) && current.checkoutUrl) return { status: "reuse", url: current.checkoutUrl };
  return { status: "in_progress" };
}

export type LeasedCheckoutResult = { status: "created" | "reused"; url: string } | { status: "in_progress" };

/**
 * Create (or reuse) the single Checkout session for this business under
 * the lease. `buildParams` supplies the product-specific session params.
 */
export async function createCheckoutUnderLease(args: {
  email: string;
  siteKey: string;
  kind: CheckoutKind;
  monitoringSubscriptionId: string | null;
  buildParams: () => Stripe.Checkout.SessionCreateParams;
  createSession: (params: Stripe.Checkout.SessionCreateParams, idempotencyKey: string) => Promise<{ id: string; url: string | null }>;
  store: CheckoutLeaseStore;
  now: () => Date;
  /** How long a losing request waits for the winner's URL. */
  waitMs?: number;
}): Promise<LeasedCheckoutResult> {
  const acquired = await acquireCheckoutLease(args, args.store, args.now());
  if (acquired.status === "reuse") return { status: "reused", url: acquired.url };
  if (acquired.status === "in_progress") {
    const deadline = Date.now() + (args.waitMs ?? 4000);
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      const row = await args.store.get(leaseKeyFor(args.email, args.siteKey));
      if (row && isLive(row, args.now()) && row.checkoutUrl) return { status: "reused", url: row.checkoutUrl };
    }
    return { status: "in_progress" };
  }

  const { lease } = acquired;
  const base = args.buildParams();
  const params: Stripe.Checkout.SessionCreateParams = {
    ...base,
    expires_at: Math.floor((args.now().getTime() + CHECKOUT_SESSION_TTL_MS) / 1000),
    metadata: { ...(base.metadata ?? {}), checkoutLeaseKey: lease.leaseKey, checkoutAttempt: String(lease.attempt) },
  };
  let session: { id: string; url: string | null };
  try {
    session = await args.createSession(params, checkoutIdempotencyKey(lease));
  } catch (err) {
    await args.store.release(lease.leaseKey, lease.attempt).catch(() => undefined);
    throw err;
  }
  if (!session.url) {
    await args.store.release(lease.leaseKey, lease.attempt).catch(() => undefined);
    throw new Error("Stripe did not return a checkout URL");
  }
  await args.store.attachSession(lease.leaseKey, lease.attempt, session.id, session.url);
  return { status: "created", url: session.url };
}
