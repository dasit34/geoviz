/**
 * Monitoring customer login — persistence seam. Prisma implementation in
 * `prisma-auth-store.ts`; in-memory fake in `scripts/lib/monitoring-auth-fakes.ts`
 * enforces the same invariants so every rule is testable without a database.
 */
import type { LoginLinkPurpose } from "./tokens";

export type MonitoringCustomerRecord = {
  id: string;
  email: string;
  stripeCustomerId: string | null;
  lastSignInAt: Date | null;
  createdAt: Date;
};

export type ActiveSession = {
  sessionId: string;
  customerId: string;
  expiresAt: Date;
  lastSeenAt: Date;
};

export interface MonitoringAuthStore {
  findCustomerByEmail(email: string): Promise<MonitoringCustomerRecord | null>;
  findCustomerById(id: string): Promise<MonitoringCustomerRecord | null>;
  /**
   * The account for `email`, creating it if needed and linking every
   * not-yet-linked monitoring subscription bought with that email.
   * Returns null when the email has no monitoring subscription at all —
   * only monitoring customers ever get an account.
   */
  ensureCustomerForEmail(email: string, stripeCustomerId?: string | null): Promise<MonitoringCustomerRecord | null>;

  /** Stores a new link and invalidates every older unused link for the customer. */
  issueLoginToken(args: {
    customerId: string;
    tokenHash: string;
    purpose: LoginLinkPurpose;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;
  /**
   * Atomically marks the link used. Returns the customer only for the one
   * caller that consumed an unused, unexpired, non-superseded link.
   */
  consumeLoginToken(tokenHash: string, now: Date): Promise<{ customerId: string } | null>;

  createSession(args: { customerId: string; tokenHash: string; expiresAt: Date; now: Date; userAgent: string | null }): Promise<void>;
  /** Unrevoked, unexpired session for this cookie hash. */
  findActiveSession(tokenHash: string, now: Date): Promise<ActiveSession | null>;
  touchSession(sessionId: string, now: Date): Promise<void>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  revokeAllSessions(customerId: string, now: Date): Promise<number>;
  markSignedIn(customerId: string, now: Date): Promise<void>;

  /** Increments the fixed-window counter and returns the new count. */
  hitRateLimit(key: string, windowStart: Date): Promise<number>;
}
