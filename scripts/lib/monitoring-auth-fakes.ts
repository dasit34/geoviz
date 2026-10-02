/**
 * In-memory `MonitoringAuthStore` for the monitoring login tests. Enforces
 * the same invariants as the Prisma store: unique customer email, unique
 * token/session hashes, atomic single-use consume, newer link invalidates
 * older unused ones, fixed-window counters.
 */
import { normalizeEmail } from "../../src/lib/monitoring/auth/tokens";
import type { MonitoringAuthStore, MonitoringCustomerRecord } from "../../src/lib/monitoring/auth/types";

type TokenRow = {
  customerId: string;
  tokenHash: string;
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
};
type SessionRow = {
  id: string;
  customerId: string;
  tokenHash: string;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
};

export type FakeAuthStore = MonitoringAuthStore & {
  customers: Map<string, MonitoringCustomerRecord>;
  tokens: TokenRow[];
  sessions: SessionRow[];
  counters: Map<string, number>;
  /** Monitoring subscriptions by email → owning customer id (null = unlinked). */
  subscriptions: Array<{ id: string; email: string; customerId: string | null }>;
  addSubscription(email: string, id?: string): void;
};

export function createFakeAuthStore(): FakeAuthStore {
  const customers = new Map<string, MonitoringCustomerRecord>();
  const tokens: TokenRow[] = [];
  const sessions: SessionRow[] = [];
  const counters = new Map<string, number>();
  const subscriptions: FakeAuthStore["subscriptions"] = [];
  let seq = 0;
  const byEmail = (email: string) => [...customers.values()].find((c) => c.email === email) ?? null;

  return {
    customers,
    tokens,
    sessions,
    counters,
    subscriptions,
    addSubscription(email, id = `msub_${++seq}`) {
      subscriptions.push({ id, email: normalizeEmail(email), customerId: null });
    },
    async findCustomerByEmail(email) {
      return byEmail(normalizeEmail(email));
    },
    async findCustomerById(id) {
      return customers.get(id) ?? null;
    },
    async ensureCustomerForEmail(raw, stripeCustomerId) {
      const email = normalizeEmail(raw);
      const subs = subscriptions.filter((s) => s.email === email);
      if (subs.length === 0) {
        const existing = byEmail(email);
        return existing && subscriptions.some((s) => s.customerId === existing.id) ? existing : null;
      }
      let c = byEmail(email);
      if (!c) {
        c = { id: `cust_${++seq}`, email, stripeCustomerId: stripeCustomerId ?? null, lastSignInAt: null, createdAt: new Date(0) };
        customers.set(c.id, c);
      } else if (!c.stripeCustomerId && stripeCustomerId) {
        c = { ...c, stripeCustomerId };
        customers.set(c.id, c);
      }
      for (const s of subs) if (s.customerId === null) s.customerId = c.id;
      return c;
    },
    async issueLoginToken({ customerId, tokenHash, purpose, expiresAt, now }) {
      if (tokens.some((t) => t.tokenHash === tokenHash)) throw new Error("unique tokenHash");
      for (const t of tokens) if (t.customerId === customerId && !t.consumedAt && !t.invalidatedAt) t.invalidatedAt = now;
      tokens.push({ customerId, tokenHash, purpose, expiresAt, consumedAt: null, invalidatedAt: null });
    },
    async consumeLoginToken(tokenHash, now) {
      const t = tokens.find((x) => x.tokenHash === tokenHash);
      if (!t || t.consumedAt || t.invalidatedAt || t.expiresAt.getTime() <= now.getTime()) return null;
      t.consumedAt = now;
      return { customerId: t.customerId };
    },
    async createSession({ customerId, tokenHash, expiresAt, now, userAgent }) {
      if (sessions.some((s) => s.tokenHash === tokenHash)) throw new Error("unique session hash");
      sessions.push({ id: `sess_${++seq}`, customerId, tokenHash, expiresAt, lastSeenAt: now, revokedAt: null, userAgent });
    },
    async findActiveSession(tokenHash, now) {
      const s = sessions.find((x) => x.tokenHash === tokenHash);
      if (!s || s.revokedAt || s.expiresAt.getTime() <= now.getTime()) return null;
      return { sessionId: s.id, customerId: s.customerId, expiresAt: s.expiresAt, lastSeenAt: s.lastSeenAt };
    },
    async touchSession(id, now) {
      const s = sessions.find((x) => x.id === id);
      if (s) s.lastSeenAt = now;
    },
    async revokeSession(tokenHash, now) {
      const s = sessions.find((x) => x.tokenHash === tokenHash && !x.revokedAt);
      if (s) s.revokedAt = now;
    },
    async revokeAllSessions(customerId, now) {
      let n = 0;
      for (const s of sessions) if (s.customerId === customerId && !s.revokedAt) { s.revokedAt = now; n += 1; }
      return n;
    },
    async markSignedIn(customerId, now) {
      const c = customers.get(customerId);
      if (c) customers.set(customerId, { ...c, lastSignInAt: now });
    },
    async hitRateLimit(key, windowStart) {
      const k = `${key}@${windowStart.toISOString()}`;
      const n = (counters.get(k) ?? 0) + 1;
      counters.set(k, n);
      return n;
    },
  };
}
