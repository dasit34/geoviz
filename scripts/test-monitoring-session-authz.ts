/* eslint-disable no-console */
/**
 * scripts/test-monitoring-session-authz.ts — cross-customer isolation and
 * route-level guards for the monitoring-only customer login:
 * every customer data route needs a session AND ownership; every
 * state-changing route checks the request origin; signed-out visitors are
 * sent to sign-in; legacy bearer links grant nothing; the $97/$59 flows
 * stay account-free.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { harness } from "./lib/monitoring-fakes";
import { ownsSubscription } from "../src/lib/monitoring/auth/session";

const h = harness("monitoring-session-authz");
const read = (f: string) => readFileSync(f, "utf8");

const CUSTOMER_POST_ROUTES = [
  "src/app/api/monitoring/tracking/route.ts",
  "src/app/api/monitoring/improvements/route.ts",
  "src/app/api/monitoring/portal/route.ts",
  "src/app/api/monitoring/account/route.ts",
];
const AUTH_POST_ROUTES = [
  "src/app/api/monitoring/auth/request-link/route.ts",
  "src/app/api/monitoring/auth/verify/route.ts",
  "src/app/api/monitoring/auth/sign-out/route.ts",
];

(async () => {
  console.log("[monitoring-session-authz] running...");

  await h.check("ownership: a customer can only reach its own records", () => {
    assert.equal(ownsSubscription("cust_a", { customerId: "cust_a" }), true);
    assert.equal(ownsSubscription("cust_a", { customerId: "cust_b" }), false, "another customer's record");
    assert.equal(ownsSubscription("cust_a", { customerId: null }), false, "unlinked record");
    assert.equal(ownsSubscription("cust_a", null), false, "unknown id");
  });

  await h.check("unknown ids and other customers' ids are indistinguishable (both not_found → 404)", () => {
    const session = read("src/lib/monitoring/auth/session.ts");
    assert.match(session, /if \(!ownsSubscription\(customerId, sub\)\) return \{ status: "not_found" \}/);
    const page = read("src/app/(future)/monitoring/account/[subscriptionId]/page.tsx");
    assert.match(page, /owned\.status === "not_found"\) notFound\(\)/);
    assert.match(page, /owned\.status === "signed_out"\) redirect\("\/monitoring\/sign-in\?error=session"\)/);
  });

  await h.check("every state-changing customer route: flag → same-origin → session+ownership → action", () => {
    for (const f of CUSTOMER_POST_ROUTES) {
      const src = read(f);
      const flag = src.indexOf("isMonitoringEnabled()");
      const origin = src.indexOf("isSameOriginRequest(req)");
      const owner = src.indexOf("requireOwnedSubscription(");
      assert.ok(flag > 0 && origin > flag && owner > origin, `${f}: guard order`);
      assert.match(src, /signedOutResponse\(req\)/, `${f}: signed-out → sign-in`);
      assert.doesNotMatch(src, /findSubscriptionByToken|accessToken/, `${f}: no bearer token`);
    }
  });

  await h.check("auth routes are POST-only, flag-gated, and origin-checked", () => {
    for (const f of AUTH_POST_ROUTES) {
      const src = read(f);
      assert.match(src, /export async function POST/);
      assert.doesNotMatch(src, /export async function GET/);
      assert.match(src, /isMonitoringEnabled\(\)/);
      assert.match(src, /isSameOriginRequest\(req\)/);
    }
  });

  await h.check("draft download requires session + ownership (no token query parameter)", () => {
    const src = read("src/app/api/monitoring/improvements/draft/route.ts");
    assert.match(src, /requireOwnedSubscription\(params\.get\("subscriptionId"\)\)/);
    assert.doesNotMatch(src, /params\.get\("token"\)/);
  });

  await h.check("dashboard components no longer embed bearer tokens in forms or links", () => {
    for (const f of ["src/components/MonitoringDashboard.tsx", "src/components/ImprovementsSection.tsx", "src/components/WebsiteChangesSection.tsx"]) {
      const src = read(f);
      assert.doesNotMatch(src, /name="token"|\?token=|\/monitoring\/\$\{token\}/, f);
    }
  });

  await h.check("multiple businesses: chooser lists only the customer's own records; single business goes straight in", () => {
    const page = read("src/app/(future)/monitoring/account/page.tsx");
    assert.match(page, /listCustomerSubscriptions\(customerId\)/);
    assert.match(page, /subs\.length === 1 && searchParams\?\.choose !== "1"\) redirect/);
    assert.match(page, /if \(!customerId\) redirect\("\/monitoring\/sign-in\?error=session"\)/);
    const session = read("src/lib/monitoring/auth/session.ts");
    assert.match(session, /findMany\(\{ where: \{ customerId \}/);
  });

  await h.check("success page grants nothing from the Stripe session id (sign-in link only)", () => {
    const src = read("src/app/(future)/monitoring/success/page.tsx");
    assert.doesNotMatch(src, /checkout\.sessions\.retrieve|accessToken|redirect\(`\/monitoring\/\$\{/);
  });

  await h.check("$97 audit and $59 re-audit stay account-free (no monitoring auth anywhere in their paths)", () => {
    for (const f of [
      "src/app/api/checkout/route.ts",
      "src/app/api/checkout/re-audit/route.ts",
      "src/lib/audit-orders/reaudit-eligibility.ts",
      "src/lib/audit-orders/reaudit-checkout-params.ts",
    ]) {
      assert.doesNotMatch(read(f), /monitoring\/auth|requireOwnedSubscription|getSignedInCustomerId/, f);
    }
  });

  await h.check("admin 'Send sign-in link' requires admin auth and never returns the link", () => {
    const src = read("src/app/api/admin/monitoring-customers/route.ts");
    assert.match(src, /if \(!isAuthed\(\) && !isValidAdminKey\(key\)\) return/);
    assert.match(src, /issueLoginLink\(customer, "admin"/);
    assert.doesNotMatch(src, /buildSignInUrl|generateSecret/, "operator never sees a usable link");
  });

  h.done();
})();
