/**
 * Monitoring customer login — the rules (no Next.js / Prisma imports, so
 * everything here runs against in-memory fakes in tests).
 *
 * Flow: purchase → welcome link (24 h) · sign-in page → requested link
 * (15 min) · link page → "Continue" (POST) → session (30 days).
 *
 * - Links and sessions: random 256-bit secrets, SHA-256 stored, single use.
 * - A newer link invalidates every older unused link for that customer.
 * - Requesting a link never reveals whether an email has an account: the
 *   result is identical, and unknown emails are rate-limited the same way.
 * - Limits are database-backed fixed windows, per IP and per email, so
 *   they hold across Vercel function instances.
 */
import { z } from "zod";

import {
  LINK_TTL_MS,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
  generateSecret,
  hashSecret,
  isWellFormedSecret,
  normalizeEmail,
  rateLimitKey,
  type LoginLinkPurpose,
} from "./tokens";
import type { MonitoringAuthStore, MonitoringCustomerRecord } from "./types";

export type RateRule = { limit: number; windowMs: number };

export const AUTH_RATE_LIMITS = {
  requestPerIp: { limit: 10, windowMs: 15 * 60_000 },
  requestPerEmail: { limit: 5, windowMs: 60 * 60_000 },
  verifyPerIp: { limit: 30, windowMs: 15 * 60_000 },
} satisfies Record<string, RateRule>;

export type SendLinkArgs = {
  to: string;
  url: string;
  purpose: LoginLinkPurpose;
  expiresAt: Date;
};

export type AuthDeps = {
  store: MonitoringAuthStore;
  now: () => Date;
  /** Absolute base URL of this deployment (links point here). */
  baseUrl: string;
  sendLink: (args: SendLinkArgs) => Promise<void>;
  newSecret?: () => string;
};

/** The emailed URL. The secret rides in the fragment — never sent to a server. */
export function buildSignInUrl(baseUrl: string, secret: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/monitoring/auth/verify#t=${secret}`;
}

/** Fixed-window check. True when the request is allowed. */
export async function allowRequest(
  store: MonitoringAuthStore,
  key: string,
  rule: RateRule,
  now: Date,
): Promise<boolean> {
  const windowStart = new Date(Math.floor(now.getTime() / rule.windowMs) * rule.windowMs);
  const count = await store.hitRateLimit(key, windowStart);
  return count <= rule.limit;
}

/** Issue + email a single-use link for an existing customer. */
export async function issueLoginLink(
  customer: Pick<MonitoringCustomerRecord, "id" | "email">,
  purpose: LoginLinkPurpose,
  deps: AuthDeps,
): Promise<{ expiresAt: Date }> {
  const now = deps.now();
  const secret = (deps.newSecret ?? generateSecret)();
  const expiresAt = new Date(now.getTime() + LINK_TTL_MS[purpose]);
  await deps.store.issueLoginToken({ customerId: customer.id, tokenHash: hashSecret(secret), purpose, expiresAt, now });
  await deps.sendLink({ to: customer.email, url: buildSignInUrl(deps.baseUrl, secret), purpose, expiresAt });
  return { expiresAt };
}

const emailSchema = z.string().trim().min(3).max(254).email();

export type RequestLinkResult =
  /** Shown identically whether or not the email has monitoring. */
  | { outcome: "accepted" }
  | { outcome: "invalid_email" }
  | { outcome: "rate_limited" };

/** Sign-in page: "email me a link". */
export async function requestSignInLink(
  args: { email: string; clientKey: string },
  deps: AuthDeps,
): Promise<RequestLinkResult> {
  const parsed = emailSchema.safeParse(args.email);
  if (!parsed.success) return { outcome: "invalid_email" };
  const email = normalizeEmail(parsed.data);
  const now = deps.now();

  // Both limits are checked for every request — known or unknown email —
  // so the response never depends on whether an account exists.
  const ipOk = await allowRequest(deps.store, rateLimitKey("link-ip", args.clientKey), AUTH_RATE_LIMITS.requestPerIp, now);
  const emailOk = await allowRequest(deps.store, rateLimitKey("link-email", email), AUTH_RATE_LIMITS.requestPerEmail, now);
  if (!ipOk || !emailOk) return { outcome: "rate_limited" };

  const customer = await deps.store.ensureCustomerForEmail(email);
  if (customer) await issueLoginLink(customer, "sign_in", deps);
  return { outcome: "accepted" };
}

export type VerifyResult =
  | { ok: true; customerId: string; sessionSecret: string; sessionExpiresAt: Date }
  | { ok: false; reason: "invalid_link" | "rate_limited" };

/** "Continue" button POST: consume the link, start a session. */
export async function verifySignInLink(
  args: { secret: unknown; clientKey: string; userAgent: string | null },
  deps: AuthDeps,
): Promise<VerifyResult> {
  const now = deps.now();
  if (!(await allowRequest(deps.store, rateLimitKey("verify-ip", args.clientKey), AUTH_RATE_LIMITS.verifyPerIp, now))) {
    return { ok: false, reason: "rate_limited" };
  }
  if (!isWellFormedSecret(args.secret)) return { ok: false, reason: "invalid_link" };

  const consumed = await deps.store.consumeLoginToken(hashSecret(args.secret), now);
  if (!consumed) return { ok: false, reason: "invalid_link" };

  const sessionSecret = (deps.newSecret ?? generateSecret)();
  const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await deps.store.createSession({
    customerId: consumed.customerId,
    tokenHash: hashSecret(sessionSecret),
    expiresAt: sessionExpiresAt,
    now,
    userAgent: args.userAgent ? args.userAgent.slice(0, 200) : null,
  });
  await deps.store.markSignedIn(consumed.customerId, now);
  return { ok: true, customerId: consumed.customerId, sessionSecret, sessionExpiresAt };
}

/** Cookie secret → signed-in customer id, or null. */
export async function resolveSessionCustomerId(
  sessionSecret: unknown,
  deps: Pick<AuthDeps, "store" | "now">,
): Promise<string | null> {
  if (!isWellFormedSecret(sessionSecret)) return null;
  const now = deps.now();
  const session = await deps.store.findActiveSession(hashSecret(sessionSecret), now);
  if (!session) return null;
  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    await deps.store.touchSession(session.sessionId, now);
  }
  return session.customerId;
}

export async function signOut(sessionSecret: unknown, deps: Pick<AuthDeps, "store" | "now">): Promise<void> {
  if (!isWellFormedSecret(sessionSecret)) return;
  await deps.store.revokeSession(hashSecret(sessionSecret), deps.now());
}

/**
 * After a monitoring purchase: make sure the buyer has an account (linking
 * this and any earlier subscriptions bought with the same email) and email
 * the 24-hour welcome link.
 */
export async function sendWelcomeLink(
  sub: { email: string; stripeCustomerId: string | null },
  deps: AuthDeps,
): Promise<{ sent: boolean }> {
  const customer = await deps.store.ensureCustomerForEmail(normalizeEmail(sub.email), sub.stripeCustomerId);
  if (!customer) return { sent: false };
  await issueLoginLink(customer, "welcome", deps);
  return { sent: true };
}
