/* eslint-disable no-console */
/**
 * Local Stripe checkout probe.
 *
 * Reads the same env vars the checkout route reads
 * (`src/app/api/checkout/route.ts:52`), then makes ONE read-only
 * Stripe API call (`prices.retrieve`) against the configured
 * STRIPE_PRICE_ID. Reports presence + shape (never secret values),
 * the price's active flag, currency, unit_amount, and product — so
 * the operator can disambiguate archived / wrong-account /
 * wrong-mode / missing without poking around the dashboard blindly.
 *
 * Does not mutate Stripe state. Does not write to disk. Does not
 * read .env values into the report — only prefixes + lengths.
 */
import "dotenv/config";
import Stripe from "stripe";
import { getStripe } from "../src/lib/stripe";

type KeyMode = "test" | "live" | "unknown" | "missing";

type Report = {
  ok: boolean;
  envPresent: {
    STRIPE_SECRET_KEY: boolean;
    STRIPE_SECRET_KEY_prefix: string | null;
    STRIPE_SECRET_KEY_length: number;
    STRIPE_PRICE_ID: boolean;
    STRIPE_PRICE_ID_prefix: string | null;
    STRIPE_PRICE_ID_length: number;
    STRIPE_WEBHOOK_SECRET: boolean;
    NEXT_PUBLIC_APP_URL: boolean;
  };
  keyMode: KeyMode;
  checkoutRouteEnvVarName: "STRIPE_PRICE_ID";
  priceFound: boolean | null;
  priceActive: boolean | null;
  priceCurrency: string | null;
  priceUnitAmount: number | null;
  priceProduct: string | null;
  priceLivemode: boolean | null;
  errorType: string | null;
  errorCode: string | null;
  safeMessage: string | null;
  diagnosis: string;
  exactFix: string;
};

function classifyMode(secret: string | undefined): KeyMode {
  if (!secret) return "missing";
  if (secret.startsWith("sk_test_") || secret.startsWith("rk_test_")) return "test";
  if (secret.startsWith("sk_live_") || secret.startsWith("rk_live_")) return "live";
  return "unknown";
}

function redact(message: string): string {
  return message
    .replace(/sk_(test|live)_[A-Za-z0-9]+/g, "sk_$1_<REDACTED>")
    .replace(/rk_(test|live)_[A-Za-z0-9]+/g, "rk_$1_<REDACTED>");
}

async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  const report: Report = {
    ok: false,
    envPresent: {
      STRIPE_SECRET_KEY: Boolean(secret),
      STRIPE_SECRET_KEY_prefix: secret ? secret.slice(0, 8) : null,
      STRIPE_SECRET_KEY_length: secret ? secret.length : 0,
      STRIPE_PRICE_ID: Boolean(priceId),
      STRIPE_PRICE_ID_prefix: priceId ? priceId.slice(0, 6) : null,
      STRIPE_PRICE_ID_length: priceId ? priceId.length : 0,
      STRIPE_WEBHOOK_SECRET: Boolean(webhookSecret && webhookSecret.length > 0),
      NEXT_PUBLIC_APP_URL: Boolean(appUrl),
    },
    keyMode: classifyMode(secret),
    checkoutRouteEnvVarName: "STRIPE_PRICE_ID",
    priceFound: null,
    priceActive: null,
    priceCurrency: null,
    priceUnitAmount: null,
    priceProduct: null,
    priceLivemode: null,
    errorType: null,
    errorCode: null,
    safeMessage: null,
    diagnosis: "",
    exactFix: "",
  };

  if (!secret) {
    report.diagnosis = "STRIPE_SECRET_KEY missing — checkout route returns 503 before touching Stripe.";
    report.exactFix = "Set STRIPE_SECRET_KEY in .env (and Vercel Production) to your sk_test_… key.";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  if (!priceId) {
    report.diagnosis = "STRIPE_PRICE_ID missing — checkout route returns 503 before touching Stripe.";
    report.exactFix = "Set STRIPE_PRICE_ID in .env to the active $97 audit price ID (price_…) from Stripe dashboard.";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch (err) {
    const e = err as Error;
    report.errorType = e.name || "InitError";
    report.safeMessage = redact(e.message || String(err));
    report.diagnosis = "Stripe SDK failed to initialize.";
    report.exactFix = "Confirm STRIPE_SECRET_KEY value is intact (no whitespace, no quotes).";
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  try {
    const price = await stripe.prices.retrieve(priceId);
    report.priceFound = true;
    report.priceActive = price.active;
    report.priceCurrency = price.currency;
    report.priceUnitAmount = price.unit_amount;
    report.priceProduct = typeof price.product === "string" ? price.product : price.product?.id ?? null;
    report.priceLivemode = price.livemode;

    const modeMismatch =
      (report.keyMode === "test" && price.livemode === true) ||
      (report.keyMode === "live" && price.livemode === false);

    if (modeMismatch) {
      report.diagnosis = `Test/live mismatch — secret key is ${report.keyMode}-mode but price livemode=${price.livemode}.`;
      report.exactFix =
        report.keyMode === "test"
          ? "Pick a TEST-mode price from Stripe dashboard (toggle Test mode on, Products → AI Visibility Audit → copy active price_… ID). Update STRIPE_PRICE_ID."
          : "Pick a LIVE-mode price from Stripe dashboard (Test mode toggled off). Update STRIPE_PRICE_ID.";
    } else if (!price.active) {
      report.diagnosis = "Price is ARCHIVED in Stripe — checkout.sessions.create rejects archived prices with 'No such price'.";
      report.exactFix =
        "Stripe dashboard → Products → AI Visibility Audit → copy the active $97 price's price_… ID. Update STRIPE_PRICE_ID in .env and Vercel Production. Restart dev / redeploy.";
    } else if (price.currency !== "usd" || price.unit_amount !== 9700) {
      report.diagnosis = `Price exists and is active but resolves to ${price.currency?.toUpperCase()} ${price.unit_amount} (cents) — not the expected USD 9700 ($97).`;
      report.exactFix =
        "Confirm the intended product (audit vs Foundation Fix $497) and pick the correct active $97 audit price. Update STRIPE_PRICE_ID.";
      report.ok = true;
    } else {
      report.ok = true;
      report.diagnosis = "Price is active, USD, $97 — local Stripe config is correct.";
      report.exactFix =
        "Local config looks good. If the regression only manifests on Vercel, check Vercel Production STRIPE_PRICE_ID matches local exactly and redeploy.";
    }
  } catch (err) {
    const e = err as {
      type?: string;
      code?: string;
      message?: string;
      statusCode?: number;
      rawType?: string;
    };
    report.priceFound = false;
    report.errorType = e.type || e.rawType || (err as Error).name || "UnknownStripeError";
    report.errorCode = e.code || null;
    report.safeMessage = redact(e.message || String(err));

    if (e.code === "resource_missing") {
      report.diagnosis = `STRIPE_PRICE_ID ('price_…') does not exist in the Stripe account that STRIPE_SECRET_KEY (${report.keyMode}-mode) authenticates against. Likely cause: test/live mismatch, wrong account, or copy-paste typo.`;
      report.exactFix = `Confirm Stripe dashboard mode toggle matches '${report.keyMode}-mode'. Then Products → AI Visibility Audit → copy the active $97 price_… ID. Update STRIPE_PRICE_ID.`;
    } else if (e.type === "StripeAuthenticationError" || e.statusCode === 401) {
      report.diagnosis = "STRIPE_SECRET_KEY is invalid or rotated — Stripe rejected the auth.";
      report.exactFix = "Stripe dashboard → Developers → API keys → reveal/rotate the test secret key. Paste into .env and Vercel.";
    } else if (e.type === "StripePermissionError") {
      report.diagnosis = "Secret key lacks 'prices:read' permission — likely a restricted key with too narrow a scope.";
      report.exactFix = "Use a Standard secret key, not a restricted key — or grant 'Prices: read' on the restricted key.";
    } else {
      report.diagnosis = `Stripe API returned an unexpected error (${report.errorType}).`;
      report.exactFix = "Inspect safeMessage; check Stripe status page; retry.";
    }
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  const e = err as Error;
  console.log(
    JSON.stringify(
      {
        ok: false,
        envPresent: { STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY) },
        diagnosis: `Fatal error: ${e.name}`,
        exactFix: "Inspect safeMessage and check Node / dotenv setup.",
        safeMessage: redact(e.message || String(err)),
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
