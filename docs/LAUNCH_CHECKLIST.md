# GeoViz Launch Checklist

Pre-flight for the controlled pilot. Walk every item before the first paid customer in production. Tick `[x]` as each is verified.

> Sign off on this file as a commit when the pilot opens. Re-run any item that changes between cohorts.

## Environment & Configuration

- [ ] **All required env vars set** in Vercel project settings — match `.env.example` exactly:
  - [ ] `DATABASE_URL` (production Postgres, not dev)
  - [ ] `STRIPE_SECRET_KEY` (live, not `sk_test_`)
  - [ ] `STRIPE_WEBHOOK_SECRET` (live `whsec_...` from the production webhook endpoint)
  - [ ] `STRIPE_PRICE_ID` (live $97 price object)
  - [ ] `RESEND_API_KEY` + `RESEND_EMAIL_FROM` (verified domain)
  - [ ] `AUDIT_NOTIFICATION_EMAIL` (the inbox the operator monitors)
  - [ ] `EMAIL_FROM`, `EMAIL_TO` (env validator-required)
  - [ ] `ANTHROPIC_API_KEY` (validated `sk-ant-` prefix)
  - [ ] `ADMIN_PASSWORD` (legacy `/admin` page)
  - [ ] `ADMIN_SECRET` (newer `/admin/reports` + admin API routes)
  - [ ] `NEXT_PUBLIC_APP_URL` (production hostname, no trailing slash)
- [ ] **Worker host** is provisioned (Railway recommended). `npm run geo-worker` runs with `GEO_AUDIT_MODE=api` and the same env as the web app. Without this, paid orders queue forever.
- [ ] **Worker → Web DB fingerprint matches.** Open `/admin/reports?key=...`, expand `Debug DB`, and compare the host/database against the worker's startup log line. They MUST match.

## Stripe

- [ ] **Live mode confirmed.** `STRIPE_SECRET_KEY` starts with `sk_live_`, NOT `sk_test_`.
- [ ] **Live webhook endpoint registered** at `https://<your-domain>/api/stripe/webhook` with `checkout.session.completed` enabled. Webhook signing secret matches `STRIPE_WEBHOOK_SECRET`.
- [ ] **Stripe Price object price = $97.00 USD.** Open the Price in the Stripe dashboard and verify; the codebase doesn't hardcode the amount.
- [ ] **Test charge run end-to-end on staging** (or use Stripe test mode against the staging deploy) before flipping production live.

## Deferred production smoke checks (recorded 2026-09-30 — launch items, not merge blockers)

After merging #42–#44 every read-only post-deploy check passed (Production Ready, worker clean start, `migrate status` up to date, intelligence summary/cost populated, data counts unchanged, unsigned webhook → 400). Two checks could not be completed without a production write or live-Stripe access and were deliberately deferred:

- [ ] **Authenticated Stripe test webhook returns 200.** Stripe Dashboard → Developers → Webhooks → production endpoint → "Send test webhook" (or a real order) and confirm the delivery shows HTTP 200. The only local Stripe key is test-mode and the live key is a Vercel sensitive var, so this was not verifiable from the CLI.
- [ ] **One real production audit completes end-to-end.** Queue one audit through the product (a real order, or `/admin/calibration` with the production `ADMIN_SECRET` — the local `.env` value does not match production) and confirm `queued → running → generated`, then review + delivery. Do not insert orders directly into the production database.

## Subscription monitoring (before enabling `GEO_MODULE_MONITORING_ENABLED` in Production)

- [ ] Create a **recurring** monthly Stripe price for monitoring (amount per the documented $29–79/mo Stage 2 range — decided in Stripe, not code) and set `STRIPE_MONITORING_MONTHLY_PRICE_ID`.
- [ ] Add `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted` to the production webhook endpoint's events (alongside `checkout.session.completed`).
- [ ] Configure the **Stripe Customer Portal** (cancellation + payment-method update allowed) — `/api/monitoring/portal` depends on it.
- [ ] Approve and apply migration `20260930170000_add_subscription_monitoring` to Production (runs automatically in the Vercel production build when the PR merges).
- [ ] Create a Railway **cron service** running `npm run monitoring:scheduler` every 15 minutes with the worker's env (same pattern as `market-study:daily-cron`).
- [ ] End-to-end on Preview/staging with Stripe test mode: subscribe → status page → first audit queued → approve → score shown → portal cancel → no further audits.
- [ ] Only then set `GEO_MODULE_MONITORING_ENABLED="true"` in Vercel Production AND on the scheduler cron service.

## Audit Engine

- [ ] **Audit command confirmed working.** Manually queue an audit for a known URL via `/admin/reports` and confirm `reportStatus` advances `pending → queued → running → generated`.
- [ ] **`reportMarkdown` is non-empty** on the resulting row.
- [ ] **No traceback / stderr** in the worker logs for that run.

## Report Delivery

- [ ] **Hosted report URL works.** `https://<your-domain>/report/<id>/print` for a paid+generated row renders without admin controls leaking onto the page.
- [ ] **PDF download works.** `https://<your-domain>/api/report/<id>/pdf?key=<ADMIN_SECRET>` returns a clean A4 PDF — no broken card splits, no half-page dead zones, CTA not orphaned.
- [ ] **PDF visually matches hosted view.** Both should look the same — they share the same `/print` source.
- [ ] **Report email sends successfully.** Trigger via admin **Send Report** on a test order; verify Resend dashboard logs the send.
- [ ] **`AUDIT_NOTIFICATION_EMAIL` receives the CC.** Inbox shows the customer email + admin copy.
- [ ] **`sentTo` / `sentCc` / `reportSentToCustomerAt`** persist to the DB row after a send.

## Admin Surface

- [ ] **`ADMIN_SECRET` works.** `/admin/reports?key=<ADMIN_SECRET>` loads the dashboard.
- [ ] **Wrong / missing key returns the styled 401**, not a 404 or blank page.
- [ ] **Admin actions all wired** on a generated test order: Run GEO Audit, View Report, Download PDF, Mark Reviewed, Send Report, force resend.
- [ ] **Failed-audit visibility tested.** Create a row with `reportStatus = "failed"` + a `reportError` and confirm the red stderr block shows expanded by default and the **Re-run GEO Audit** button label appears.

## Public Site

- [ ] **No `$147` references except the strikethrough** on the pricing card. `git grep '\$147' src/` should match only the historical-price reference at `src/app/page.tsx` line 412 (and any deliberate "Normally $147" copy).
- [ ] **No `$197` or other inconsistent prices.** `git grep '\$1[0-9][0-9]' src/`.
- [ ] **Sample report link works.** `/sample-report` loads and renders the bundled sample.
- [ ] **`/order` form submits** and redirects to Stripe Checkout.
- [ ] **`/checkout/success` and `/checkout/cancel` both render** when hit directly.
- [ ] **Mobile landing page checked.** Open `/` at 360 px and 414 px widths in DevTools — no horizontal scroll, no overlapping orange blur circles, all CTAs reachable, hero typography legible.
- [ ] **Proof section ("See what an AI visibility audit looks like")** renders with the 3 finding cards, score example, and both CTAs.

## Honesty / Compliance

- [ ] **No fake testimonials, named customers, or invented metrics anywhere on the site.** The "Foundation Fix typically delivers" section is illustrative and labeled as such.
- [ ] **No fake claims** about platforms / partnerships. Claims about ChatGPT / Claude / Perplexity / Gemini / AI Overviews are about audit *coverage*, not endorsements.
- [ ] **Pricing copy** says "Normally $147 — currently $97 for early customers" consistently. The strike-through is honest framing, not bait.

## Sign-off

| Item | Owner | Date |
|---|---|---|
| Environment & Configuration | | |
| Stripe | | |
| Audit Engine | | |
| Report Delivery | | |
| Admin Surface | | |
| Public Site | | |
| Honesty / Compliance | | |

When every box above is `[x]`, the pilot is cleared to take its first paid order.
