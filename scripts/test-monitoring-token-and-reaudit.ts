/* eslint-disable no-console */
/**
 * scripts/test-monitoring-token-and-reaudit.ts — customer access rules
 * (signed-in monitoring accounts; legacy private links only redirect to
 * sign-in), and preservation of the existing $59 manual re-audit.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { harness } from "./lib/monitoring-fakes";
import { buildReAuditCheckoutSessionParams } from "../src/lib/audit-orders/reaudit-checkout-params";
import { findSubscriptionByToken } from "../src/lib/monitoring/prisma-store";
import { MONITORING_PLANS } from "../src/lib/monitoring/plans";
import { generateAccessToken } from "../src/lib/monitoring/subscription-sync";
import { isMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-token-and-reaudit");

(async () => {
  console.log("[monitoring-token-and-reaudit] running...");

  await h.check("access tokens are long, random, URL-safe, and unique", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateAccessToken()));
    assert.equal(tokens.size, 200);
    for (const t of tokens) assert.match(t, /^[A-Za-z0-9_-]{43}$/);
  });

  await h.check("malformed tokens are rejected before any database lookup", async () => {
    for (const bad of ["", "short", "has spaces in it 1234567890", "../../etc/passwd", "x".repeat(200), "'; drop table x; --"]) {
      assert.equal(await findSubscriptionByToken(bad), null, bad);
    }
  });

  await h.check("every customer monitoring data route requires a session + ownership and is flag-gated", () => {
    for (const f of [
      "src/app/(future)/monitoring/account/[subscriptionId]/page.tsx",
      "src/app/api/monitoring/tracking/route.ts",
      "src/app/api/monitoring/improvements/route.ts",
      "src/app/api/monitoring/improvements/draft/route.ts",
      "src/app/api/monitoring/portal/route.ts",
      "src/app/api/monitoring/account/route.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      assert.match(src, /isMonitoringEnabled\(\)/, `${f} flag-gated`);
      assert.match(src, /requireOwnedSubscription\(/, `${f} session + ownership checked`);
      assert.doesNotMatch(src, /findSubscriptionByToken\(/, `${f} must not accept bearer tokens`);
      assert.match(src, /robots|applyApiRateLimit|checkPageRateLimit/, `${f} rate-limited or noindex`);
    }
  });

  await h.check("legacy /monitoring/<token> links redirect to sign-in without looking the token up", () => {
    const src = readFileSync("src/app/(future)/monitoring/[token]/page.tsx", "utf8");
    assert.match(src, /isMonitoringEnabled\(\)/);
    assert.match(src, /redirect\("\/monitoring\/sign-in\?from=link"\)/);
    assert.doesNotMatch(src, /findSubscriptionByToken|prisma/);
  });

  await h.check("$59 re-audit checkout is unchanged: one-time payment, its own price, RE_AUDIT metadata", () => {
    const p = buildReAuditCheckoutSessionParams({
      previousOrder: { id: "ord_prev", websiteUrl: "https://rockroofing.com", businessName: "Rock Roofing", email: "o@r.com" } as never,
      emailOverride: "",
      priceId: "price_reaudit_59",
      siteUrl: "https://geoviz.example",
    });
    assert.equal(p.mode, "payment");
    assert.deepEqual(p.line_items, [{ price: "price_reaudit_59", quantity: 1 }]);
    assert.equal(p.metadata?.productType, "RE_AUDIT");
    assert.equal(p.metadata?.previousOrderId, "ord_prev");
    assert.equal(p.success_url, "https://geoviz.example/checkout/success?session_id={CHECKOUT_SESSION_ID}");
  });

  await h.check("$59 re-audit checkout events stay on the one-time webhook path, never the monitoring branch", () => {
    const evt = { id: "evt_r", type: "checkout.session.completed", data: { object: { mode: "payment", metadata: { productType: "RE_AUDIT" } } } };
    assert.equal(isMonitoringStripeEvent(evt), false);
  });

  await h.check("monitoring plans never reuse the one-time audit or re-audit price env vars", () => {
    for (const plan of MONITORING_PLANS) {
      assert.notEqual(plan.priceEnvVar, "STRIPE_PRICE_ID");
      assert.notEqual(plan.priceEnvVar, "STRIPE_REAUDIT_PRICE_ID");
    }
  });

  await h.check("$59 re-audit route, eligibility, and checkout params are untouched on this branch", () => {
    for (const f of ["src/app/api/checkout/re-audit/route.ts", "src/lib/audit-orders/reaudit-eligibility.ts", "src/lib/audit-orders/reaudit-checkout-params.ts"]) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /monitoring|tracking/i, `${f} must not reference monitoring`);
    }
  });

  h.done();
})();
