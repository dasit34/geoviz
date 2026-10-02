/* eslint-disable no-console */
/**
 * scripts/test-monitoring-checkout.ts — plan resolution, input validation,
 * and the Stripe subscription checkout session params. No network, no DB.
 */
import "./lib/require-nonprod-db";
import assert from "node:assert/strict";

import { harness } from "./lib/monitoring-fakes";
import {
  buildMonitoringCheckoutSessionParams,
  monitoringCheckoutInputSchema,
} from "../src/lib/monitoring/checkout";
import {
  MONITORING_PLANS,
  configuredPlans,
  formatPlanPrice,
  isMonitoringEnabled,
  resolvePlan,
} from "../src/lib/monitoring/plans";
import { isMonitoringStripeEvent } from "../src/lib/monitoring/webhook";

const h = harness("monitoring-checkout");

(async () => {
  console.log("[monitoring-checkout] running...");
  const env = { STRIPE_MONITORING_MONTHLY_PRICE_ID: "price_monthly_test" };

  await h.check("feature flag is off unless exactly \"true\"", () => {
    assert.equal(isMonitoringEnabled({}), false);
    assert.equal(isMonitoringEnabled({ GEO_MODULE_MONITORING_ENABLED: "1" }), false);
    assert.equal(isMonitoringEnabled({ GEO_MODULE_MONITORING_ENABLED: "true" }), true);
  });

  await h.check("plan without its price env var is not offered (no invented prices)", () => {
    assert.equal(resolvePlan("monthly", {}), null);
    assert.deepEqual(configuredPlans({}), []);
    assert.ok(MONITORING_PLANS.every((p) => !("amount" in p) && !("price" in p)), "plans carry no hardcoded amount");
  });

  await h.check("configured plan resolves its Stripe price id from env", () => {
    const plan = resolvePlan("monthly", env);
    assert.equal(plan?.priceId, "price_monthly_test");
    assert.equal(plan?.cadenceDays, 30);
    assert.equal(resolvePlan("does-not-exist", env), null);
  });

  await h.check("display price comes from the Stripe price object; non-recurring prices rejected", () => {
    assert.deepEqual(formatPlanPrice({ unit_amount: 4900, currency: "usd", recurring: { interval: "month", interval_count: 1 } }), {
      amountLabel: "$49",
      intervalLabel: "per month",
    });
    assert.equal(formatPlanPrice({ unit_amount: 9700, currency: "usd", recurring: null }), null);
  });

  await h.check("input validation reuses the order-form rules and drops competitor fields", () => {
    const ok = monitoringCheckoutInputSchema.parse({
      planKey: "monthly",
      websiteUrl: "rockroofing.example",
      email: "Owner@RockRoofing.Example",
      businessName: "",
      competitorUrl: "https://competitor.example",
    });
    assert.equal(ok.websiteUrl, "https://rockroofing.example");
    assert.equal(ok.email, "owner@rockroofing.example");
    assert.equal(ok.businessName, undefined);
    assert.equal("competitorUrl" in ok, false);
    assert.equal(monitoringCheckoutInputSchema.safeParse({ planKey: "monthly", websiteUrl: "x", email: "bad" }).success, false);
  });

  await h.check("session params: subscription mode, server-side price, metadata on session AND subscription", () => {
    const plan = resolvePlan("monthly", env)!;
    const input = monitoringCheckoutInputSchema.parse({ planKey: "monthly", websiteUrl: "https://rockroofing.example", email: "o@r.example", businessName: "Rock Roofing" });
    const p = buildMonitoringCheckoutSessionParams({ plan, input, siteUrl: "https://geoviz.example" });
    assert.equal(p.mode, "subscription");
    assert.deepEqual(p.line_items, [{ price: "price_monthly_test", quantity: 1 }]);
    assert.equal(p.success_url, "https://geoviz.example/monitoring/success?session_id={CHECKOUT_SESSION_ID}");
    assert.equal(p.cancel_url, "https://geoviz.example/monitoring");
    assert.equal(p.metadata?.geoviz_product, "monitoring");
    assert.deepEqual(p.subscription_data?.metadata, p.metadata);
    assert.equal(p.subscription_data?.metadata?.websiteUrl, "https://rockroofing.example");
    assert.equal("payment_intent_data" in p, false, "subscription checkout must not set payment_intent_data");
  });

  await h.check("webhook routing: subscription checkouts go to monitoring, one-time checkouts never do", () => {
    const sub = { id: "evt_1", type: "checkout.session.completed", data: { object: { mode: "subscription" } } };
    const oneTime = { id: "evt_2", type: "checkout.session.completed", data: { object: { mode: "payment" } } };
    assert.equal(isMonitoringStripeEvent(sub), true);
    assert.equal(isMonitoringStripeEvent(oneTime), false);
    assert.equal(isMonitoringStripeEvent({ id: "evt_3", type: "charge.refunded", data: { object: {} } }), false);
    assert.equal(isMonitoringStripeEvent({ id: "evt_4", type: "customer.subscription.deleted", data: { object: {} } }), true);
  });

  h.done();
})();
