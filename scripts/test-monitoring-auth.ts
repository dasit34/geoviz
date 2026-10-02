/* eslint-disable no-console */
/**
 * scripts/test-monitoring-auth.ts — monitoring customer login rules:
 * hashed single-use links with the right lifetimes, scanner-safe links,
 * no account enumeration, database-style rate limits, 30-day sessions,
 * sign-out, cookie hardening, and the same-origin (CSRF) check.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { createFakeAuthStore } from "./lib/monitoring-auth-fakes";
import { harness } from "./lib/monitoring-fakes";
import { buildSignInEmail } from "../src/lib/monitoring/emails";
import {
  clearedSessionCookieOptions,
  isSameOriginRequest,
  sessionCookieName,
  sessionCookieOptions,
} from "../src/lib/monitoring/auth/http";
import {
  AUTH_RATE_LIMITS,
  buildSignInUrl,
  issueLoginLink,
  requestSignInLink,
  resolveSessionCustomerId,
  sendWelcomeLink,
  signOut,
  verifySignInLink,
  type AuthDeps,
  type SendLinkArgs,
} from "../src/lib/monitoring/auth/service";
import { LINK_TTL_MS, SESSION_TTL_MS, generateSecret, hashSecret } from "../src/lib/monitoring/auth/tokens";

const h = harness("monitoring-auth");
const T0 = new Date("2026-10-04T12:00:00.000Z");
const MIN = 60_000;

function setup(email = "owner@rockroofing.example") {
  const store = createFakeAuthStore();
  store.addSubscription(email);
  const clock = { now: T0 };
  const sent: SendLinkArgs[] = [];
  const deps: AuthDeps = {
    store,
    now: () => clock.now,
    baseUrl: "https://preview.geoviz.example",
    sendLink: async (a) => {
      sent.push(a);
    },
  };
  return { store, clock, sent, deps, email };
}

const secretFrom = (url: string) => /#t=([A-Za-z0-9_-]{43})$/.exec(url)![1]!;
const advance = (clock: { now: Date }, ms: number) => {
  clock.now = new Date(clock.now.getTime() + ms);
};

async function signIn(s: ReturnType<typeof setup>, clientKey = "ip_a") {
  await requestSignInLink({ email: s.email, clientKey }, s.deps);
  const secret = secretFrom(s.sent.at(-1)!.url);
  return verifySignInLink({ secret, clientKey, userAgent: "test" }, s.deps);
}

(async () => {
  console.log("[monitoring-auth] running...");

  await h.check("secrets are 256-bit, URL-safe; only the SHA-256 is stored", async () => {
    const all = new Set(Array.from({ length: 200 }, () => generateSecret()));
    assert.equal(all.size, 200);
    for (const s of all) assert.match(s, /^[A-Za-z0-9_-]{43}$/);
    const s = setup();
    await requestSignInLink({ email: s.email, clientKey: "ip" }, s.deps);
    const secret = secretFrom(s.sent[0]!.url);
    assert.equal(s.store.tokens.length, 1);
    assert.equal(s.store.tokens[0]!.tokenHash, hashSecret(secret));
    assert.ok(!JSON.stringify(s.store.tokens).includes(secret), "raw secret never stored");
  });

  await h.check("link lifetimes: welcome 24 h, requested 15 min, admin 24 h", async () => {
    assert.equal(LINK_TTL_MS.welcome, 24 * 60 * MIN);
    assert.equal(LINK_TTL_MS.sign_in, 15 * MIN);
    assert.equal(LINK_TTL_MS.admin, 24 * 60 * MIN);
    const s = setup();
    await sendWelcomeLink({ email: s.email, stripeCustomerId: "cus_1" }, s.deps);
    assert.equal(s.sent[0]!.purpose, "welcome");
    assert.equal(s.sent[0]!.expiresAt.getTime() - T0.getTime(), 24 * 60 * MIN);
    await requestSignInLink({ email: s.email, clientKey: "ip" }, s.deps);
    assert.equal(s.sent[1]!.purpose, "sign_in");
    assert.equal(s.sent[1]!.expiresAt.getTime() - T0.getTime(), 15 * MIN);
  });

  await h.check("requested link expires after 15 minutes", async () => {
    const s = setup();
    await requestSignInLink({ email: s.email, clientKey: "ip" }, s.deps);
    const secret = secretFrom(s.sent[0]!.url);
    advance(s.clock, 15 * MIN + 1);
    const r = await verifySignInLink({ secret, clientKey: "ip", userAgent: null }, s.deps);
    assert.deepEqual(r, { ok: false, reason: "invalid_link" });
  });

  await h.check("requested link works at 14 minutes; welcome link works at 23 h and fails after 24 h", async () => {
    const a = setup();
    await requestSignInLink({ email: a.email, clientKey: "ip" }, a.deps);
    advance(a.clock, 14 * MIN);
    assert.equal((await verifySignInLink({ secret: secretFrom(a.sent[0]!.url), clientKey: "ip", userAgent: null }, a.deps)).ok, true);
    const b = setup();
    await sendWelcomeLink({ email: b.email, stripeCustomerId: null }, b.deps);
    advance(b.clock, 23 * 60 * MIN);
    assert.equal((await verifySignInLink({ secret: secretFrom(b.sent[0]!.url), clientKey: "ip", userAgent: null }, b.deps)).ok, true);
    const c = setup();
    await sendWelcomeLink({ email: c.email, stripeCustomerId: null }, c.deps);
    advance(c.clock, 24 * 60 * MIN + 1);
    assert.equal((await verifySignInLink({ secret: secretFrom(c.sent[0]!.url), clientKey: "ip", userAgent: null }, c.deps)).ok, false);
  });

  await h.check("links are single use: the second press of Continue fails", async () => {
    const s = setup();
    await requestSignInLink({ email: s.email, clientKey: "ip" }, s.deps);
    const secret = secretFrom(s.sent[0]!.url);
    const first = await verifySignInLink({ secret, clientKey: "ip", userAgent: null }, s.deps);
    const second = await verifySignInLink({ secret, clientKey: "ip", userAgent: null }, s.deps);
    assert.equal(first.ok, true);
    assert.deepEqual(second, { ok: false, reason: "invalid_link" });
    assert.equal(s.store.sessions.length, 1, "exactly one session");
  });

  await h.check("concurrent Continue presses: exactly one session is created", async () => {
    const s = setup();
    await requestSignInLink({ email: s.email, clientKey: "ip" }, s.deps);
    const secret = secretFrom(s.sent[0]!.url);
    const results = await Promise.all(Array.from({ length: 5 }, () => verifySignInLink({ secret, clientKey: "ip", userAgent: null }, s.deps)));
    assert.equal(results.filter((r) => r.ok).length, 1);
    assert.equal(s.store.sessions.length, 1);
  });

  await h.check("a newer link invalidates older unused links (incl. the welcome link)", async () => {
    const s = setup();
    await sendWelcomeLink({ email: s.email, stripeCustomerId: null }, s.deps);
    await requestSignInLink({ email: s.email, clientKey: "ip" }, s.deps);
    const welcome = secretFrom(s.sent[0]!.url);
    const fresh = secretFrom(s.sent[1]!.url);
    assert.equal((await verifySignInLink({ secret: welcome, clientKey: "ip", userAgent: null }, s.deps)).ok, false);
    assert.equal((await verifySignInLink({ secret: fresh, clientKey: "ip", userAgent: null }, s.deps)).ok, true);
  });

  await h.check("malformed or forged secrets never reach a session", async () => {
    const s = setup();
    for (const bad of [undefined, null, "", "short", "x".repeat(43), "a".repeat(44), "../../etc", 42, generateSecret()]) {
      const r = await verifySignInLink({ secret: bad, clientKey: "ip", userAgent: null }, s.deps);
      assert.equal(r.ok, false, String(bad));
    }
    assert.equal(s.store.sessions.length, 0);
  });

  await h.check("no account enumeration: unknown email → same 'accepted' result, nothing sent, no account created", async () => {
    const s = setup();
    const known = await requestSignInLink({ email: s.email, clientKey: "ip1" }, s.deps);
    const unknown = await requestSignInLink({ email: "stranger@example.com", clientKey: "ip2" }, s.deps);
    assert.deepEqual(known, { outcome: "accepted" });
    assert.deepEqual(unknown, { outcome: "accepted" });
    assert.equal(s.sent.length, 1);
    assert.equal(s.store.customers.size, 1);
    assert.ok(![...s.store.customers.values()].some((c) => c.email === "stranger@example.com"));
  });

  await h.check("only monitoring buyers get accounts; $97/$59 buyers (no monitoring subscription) never do", async () => {
    const s = setup();
    const r = await requestSignInLink({ email: "audit-only@example.com", clientKey: "ip" }, s.deps);
    assert.deepEqual(r, { outcome: "accepted" });
    assert.equal(await s.store.ensureCustomerForEmail("audit-only@example.com"), null);
  });

  await h.check("email is case/space-insensitive and links every subscription bought with it", async () => {
    const s = setup("Owner@RockRoofing.example");
    s.store.addSubscription("owner@rockroofing.example");
    await requestSignInLink({ email: "  OWNER@rockroofing.EXAMPLE ", clientKey: "ip" }, s.deps);
    assert.equal(s.sent.length, 1);
    assert.equal(s.sent[0]!.to, "owner@rockroofing.example");
    const ids = new Set(s.store.subscriptions.map((x) => x.customerId));
    assert.equal(ids.size, 1, "both subscriptions linked to one account");
    assert.notEqual([...ids][0], null);
  });

  await h.check("rate limit: 5 links per email per hour, then refused for known AND unknown emails alike", async () => {
    const s = setup();
    for (let i = 0; i < AUTH_RATE_LIMITS.requestPerEmail.limit; i++) {
      assert.deepEqual(await requestSignInLink({ email: s.email, clientKey: `ip${i}` }, s.deps), { outcome: "accepted" });
    }
    assert.deepEqual(await requestSignInLink({ email: s.email, clientKey: "ip_new" }, s.deps), { outcome: "rate_limited" });
    for (let i = 0; i < 5; i++) await requestSignInLink({ email: "ghost@example.com", clientKey: `g${i}` }, s.deps);
    assert.deepEqual(await requestSignInLink({ email: "ghost@example.com", clientKey: "g_new" }, s.deps), { outcome: "rate_limited" });
    advance(s.clock, 60 * MIN);
    assert.deepEqual(await requestSignInLink({ email: s.email, clientKey: "ip_later" }, s.deps), { outcome: "accepted" });
  });

  await h.check("rate limit: 10 link requests per IP per 15 minutes across different emails", async () => {
    const s = setup();
    for (let i = 0; i < AUTH_RATE_LIMITS.requestPerIp.limit; i++) {
      assert.deepEqual(await requestSignInLink({ email: `x${i}@example.com`, clientKey: "same_ip" }, s.deps), { outcome: "accepted" });
    }
    assert.deepEqual(await requestSignInLink({ email: "y@example.com", clientKey: "same_ip" }, s.deps), { outcome: "rate_limited" });
  });

  await h.check("rate limit: link verification is limited per IP (30 / 15 min)", async () => {
    const s = setup();
    for (let i = 0; i < AUTH_RATE_LIMITS.verifyPerIp.limit; i++) {
      await verifySignInLink({ secret: generateSecret(), clientKey: "brute", userAgent: null }, s.deps);
    }
    const r = await verifySignInLink({ secret: generateSecret(), clientKey: "brute", userAgent: null }, s.deps);
    assert.deepEqual(r, { ok: false, reason: "rate_limited" });
  });

  await h.check("rate-limit keys are hashed (no raw email or IP stored)", async () => {
    const s = setup();
    await requestSignInLink({ email: s.email, clientKey: "203.0.113.9" }, s.deps);
    const keys = [...s.store.counters.keys()].join(" ");
    assert.ok(!keys.includes(s.email) && !keys.includes("203.0.113.9"), keys);
  });

  await h.check("sessions: 30-day absolute lifetime, resolved by cookie secret, stored hashed", async () => {
    const s = setup();
    const r = await signIn(s);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.sessionExpiresAt.getTime() - T0.getTime(), SESSION_TTL_MS);
    assert.equal(SESSION_TTL_MS, 30 * 24 * 60 * MIN);
    assert.ok(!JSON.stringify(s.store.sessions).includes(r.sessionSecret));
    assert.equal(await resolveSessionCustomerId(r.sessionSecret, s.deps), r.customerId);
    advance(s.clock, SESSION_TTL_MS - MIN);
    assert.equal(await resolveSessionCustomerId(r.sessionSecret, s.deps), r.customerId);
    advance(s.clock, 2 * MIN);
    assert.equal(await resolveSessionCustomerId(r.sessionSecret, s.deps), null, "expired after 30 days");
  });

  await h.check("sign out revokes the session server-side (a copied cookie stops working)", async () => {
    const s = setup();
    const r = await signIn(s);
    if (!r.ok) throw new Error("sign-in failed");
    await signOut(r.sessionSecret, s.deps);
    assert.equal(await resolveSessionCustomerId(r.sessionSecret, s.deps), null);
  });

  await h.check("admin 'sign out everywhere' revokes every session for the customer", async () => {
    const s = setup();
    const a = await signIn(s, "ip1");
    const b = await signIn(s, "ip2");
    if (!a.ok || !b.ok) throw new Error("sign-in failed");
    assert.equal(await s.store.revokeAllSessions(a.customerId, s.clock.now), 2);
    assert.equal(await resolveSessionCustomerId(a.sessionSecret, s.deps), null);
    assert.equal(await resolveSessionCustomerId(b.sessionSecret, s.deps), null);
  });

  await h.check("admin link: 24 h, single use, emailed to the account's own address", async () => {
    const s = setup();
    const customer = (await s.store.ensureCustomerForEmail(s.email))!;
    await issueLoginLink(customer, "admin", s.deps);
    assert.equal(s.sent[0]!.to, s.email);
    assert.equal(s.sent[0]!.purpose, "admin");
    const secret = secretFrom(s.sent[0]!.url);
    assert.equal((await verifySignInLink({ secret, clientKey: "ip", userAgent: null }, s.deps)).ok, true);
    assert.equal((await verifySignInLink({ secret, clientKey: "ip", userAgent: null }, s.deps)).ok, false);
  });

  await h.check("scanner safety: the secret travels in the URL fragment of a GET-only confirmation page", () => {
    const url = buildSignInUrl("https://x.example/", "A".repeat(43));
    assert.equal(url, `https://x.example/monitoring/auth/verify#t=${"A".repeat(43)}`);
    assert.equal(new URL(url).search, "", "nothing in the query string (server logs / Referer)");
    const page = readFileSync("src/app/(future)/monitoring/auth/verify/page.tsx", "utf8");
    assert.match(page, /referrer: "no-referrer"/);
    assert.doesNotMatch(page, /verifySignInLink|consumeLoginToken/, "opening the page consumes nothing");
    const form = readFileSync("src/components/MonitoringVerifyForm.tsx", "utf8");
    assert.match(form, /window\.location\.hash/);
    assert.match(form, /replaceState/, "fragment removed from the address bar");
    assert.match(form, /method="POST"/);
    const route = readFileSync("src/app/api/monitoring/auth/verify/route.ts", "utf8");
    assert.match(route, /export async function POST/);
    assert.doesNotMatch(route, /export async function GET/, "links can't be consumed by GET");
  });

  await h.check("emails: link included with its lifetime; secret never in the subject", () => {
    const url = buildSignInUrl("https://x.example", "B".repeat(43));
    const w = buildSignInEmail({ to: "a@b.c", url, purpose: "welcome", expiresAt: T0 });
    assert.ok(w.text.includes(url) && /24 hours/.test(w.text) && /works once/.test(w.text));
    assert.ok(!w.subject.includes("B".repeat(43)));
    const r = buildSignInEmail({ to: "a@b.c", url, purpose: "sign_in", expiresAt: T0 });
    assert.ok(r.text.includes(url) && /15 minutes/.test(r.text));
    assert.ok(r.text.includes("https://x.example/monitoring/sign-in"));
  });

  await h.check("secrets and links are never logged by the auth code", () => {
    for (const f of [
      "src/lib/monitoring/auth/service.ts",
      "src/lib/monitoring/auth/prisma-auth-store.ts",
      "src/lib/monitoring/auth/session.ts",
      "src/lib/monitoring/emails.ts",
      "src/app/api/monitoring/auth/request-link/route.ts",
      "src/app/api/monitoring/auth/verify/route.ts",
      "src/app/api/monitoring/auth/sign-out/route.ts",
      "src/app/api/admin/monitoring-customers/route.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/console\.(log|warn|error|info)\(([^;]*)\);/g)) {
        assert.doesNotMatch(m[2]!, /secret|sessionSecret|\burl\b|args\.url|tokenHash|\bt\b\)/i, `${f}: ${m[0]}`);
      }
    }
  });

  await h.check("session cookie: __Host- prefix, HttpOnly, Secure, SameSite=Lax, Path=/, 30-day expiry (production)", () => {
    const env = process.env as Record<string, string | undefined>;
    const prev = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      assert.equal(sessionCookieName(), "__Host-geoviz_monitoring");
      const exp = new Date(T0.getTime() + SESSION_TTL_MS);
      assert.deepEqual(sessionCookieOptions(exp), { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: exp });
      assert.equal(clearedSessionCookieOptions().maxAge, 0);
    } finally {
      env.NODE_ENV = prev;
    }
  });

  await h.check("CSRF: state-changing posts must come from our own origin", () => {
    const req = (headers: Record<string, string>) => new Request("https://app.example/api/x", { method: "POST", headers });
    assert.equal(isSameOriginRequest(req({ host: "app.example", origin: "https://app.example" })), true);
    assert.equal(isSameOriginRequest(req({ host: "app.example", origin: "https://evil.example" })), false);
    assert.equal(isSameOriginRequest(req({ host: "app.example", origin: "null" })), false);
    assert.equal(isSameOriginRequest(req({ host: "app.example" })), false, "no Origin, no Sec-Fetch-Site → refused");
    assert.equal(isSameOriginRequest(req({ host: "app.example", "sec-fetch-site": "same-origin" })), true);
    assert.equal(isSameOriginRequest(req({ host: "app.example", "sec-fetch-site": "cross-site" })), false);
  });

  h.done();
})();
