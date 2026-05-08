# GeoViz

Lean MVP that sells **AI Visibility Audits** at **$97 (early-customer pricing; normally $147)** for local service businesses. GeoViz audits whether ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews can find, understand, and recommend a business.

> GeoViz measures AI readability and recommendation readiness, not business popularity or Google rankings.

This repo is the customer-facing site + order flow + admin queue. **Audit fulfillment is manual.**

## Stack
- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS
- Prisma + PostgreSQL
- Stripe Checkout (one-time $97; the Stripe Price object must be set to $97 separately on the Stripe dashboard)
- Resend (admin email notification)

## Pages
- `/` — landing page
- `/order` — order form
- `/checkout/success` — post-payment confirmation
- `/checkout/cancel` — cancelled checkout
- `/sample-report` — example audit report
- `/admin` — password-gated order queue

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in:
   - `DATABASE_URL` — Postgres (Neon, Supabase, Railway, etc.)
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` — Stripe
   - `RESEND_API_KEY`, `RESEND_EMAIL_FROM`, `AUDIT_NOTIFICATION_EMAIL` — Resend (canonical names; legacy `RESEND_FROM_EMAIL` / `ADMIN_NOTIFY_EMAIL` still read as fallbacks)
   - `EMAIL_FROM`, `EMAIL_TO` — required by the env validator; also used by the `verify-system` health check
   - `ANTHROPIC_API_KEY` — required; the audit worker calls Anthropic directly in `api` mode
   - `ADMIN_PASSWORD` — gates the legacy `/admin` page
   - `ADMIN_SECRET` — gates `/admin/reports` and the admin API routes (separate from `ADMIN_PASSWORD`; both must be set)
   - `NEXT_PUBLIC_APP_URL` — your deployed URL (or `http://localhost:3000`)

3. **Stripe setup**
   - Create a one-time Product/Price for **$97** in the Stripe dashboard. Use the Price ID for `STRIPE_PRICE_ID`. (The site copy frames this as "Normally $147 — currently $97 for early customers.")
   - For local webhook testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and copy the `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

4. **Database**
   ```bash
   npx prisma db push
   ```

5. **Run dev server**
   ```bash
   npm run dev
   ```

## Fulfillment Flow
1. Customer pays through Stripe Checkout.
2. `stripe-webhook` upserts the order into Postgres and (for paid orders) flips `reportStatus` to `queued`.
3. Resend emails `AUDIT_NOTIFICATION_EMAIL` so the operator knows an order arrived.
4. The **GEO worker** (separate process, not Vercel — see below) picks up `queued` orders, generates the report, and writes `reportMarkdown` + `reportStatus = "generated"`.
5. Operator opens `/admin/reports?key=<ADMIN_SECRET>`, reviews the report, and clicks **Send Report** to email the customer (hosted link + PDF).
6. Operator marks the order reviewed in `/admin/reports`.

## GeoViz Manual Pilot Operating Procedure

The per-order runbook for the controlled pilot. Nine steps, in order, every time. The admin card at `/admin/reports?key=<ADMIN_SECRET>` shows a single status banner per order so you can read state at a glance.

1. **Watch for new Stripe / admin order.** A new paid order appears at `/admin/reports?key=<ADMIN_SECRET>` and pings `AUDIT_NOTIFICATION_EMAIL`. Banner reads `Paid — report not generated`. Confirm the website URL is reachable, the customer email is well-formed, and the business name matches. If anything looks off, email the customer before running the audit.
2. **Run GEO Audit.** Click **Run GEO Audit**. Banner moves through `Queued — waiting on worker` → `Generating report` → `Report ready — needs review`. The worker is the separate process described in the Production Worker section — make sure it's running, or the order will stay queued.
3. **Review the report.** When the banner flips to `Report ready — needs review`, the report auto-expands. Read it end to end. Open the **QA review** panel to record internal notes and a 0–10 quality score.
4. **Confirm recipient email.** In the **Send-time recipient** field, verify the address (or paste a different one if the customer asked to be reached at a different inbox). Click **Confirm recipient**. Editing the field after confirming resets the gate — re-confirm.
5. **Download / check PDF.** Click **Download PDF**. Open the file and confirm it renders cleanly — same content as the hosted report, no broken sections, no missing pages, no orphaned cards or dead-zone whitespace.
6. **Approve.** Walk the Launch QA Checklist (business name, URL, report clean, no hallucinations, PDF works, recipient confirmed). When all six are ticked, click **Mark Reviewed**. Banner flips to `Approved — ready to send`. If it isn't ready, set the review to **Needs changes**, fix the underlying issue, and re-run.
7. **Send report.** Click **Send Report**. The button is gated client- *and* server-side: it only fires when `reportStatus = generated`, `reviewStatus = approved`, the recipient is confirmed, and every checklist item is ticked. The send route persists `sentTo`, `sentCc`, and `reportSentToCustomerAt`. Banner should now read `Sent to customer`. Confirm the timestamp on the card matches the moment you sent.
8. **Log customer feedback.** When the customer replies, capture the substance in the **Admin notes** field on the QA review panel — what they liked, what was confusing, anything they corrected. That's our pilot incident log. Fold patterns into the next prompt revision after the cohort closes.
9. **If the customer asks for fixes, offer the GEO Foundation Fix.** Reply with the $497 Foundation Fix scope (schema, llms.txt, robots.txt, FAQ structure, per-location signals, re-audit). Most local cases are flat $497; complex sites get quoted upfront. The audit report itself ends with this CTA — point them back to it.

If the audit fails the banner reads `Audit failed — needs attention` and the red stderr block is expanded by default — do not collapse it. Read the error, fix the underlying issue, then click **Re-run GEO Audit**.

## GeoViz Controlled Pilot Launch Checklist

Tick every item before sharing the public URL. Fuller checklist at [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md); this is the abbreviated launch-day list.

1. **Buy domain.** Pick the production hostname (e.g., `geoviz.ai`).
2. **Connect domain to Vercel.** Add the domain in Project → Settings → Domains. Wait for the DNS to verify and the certificate to issue. Confirm `https://<your-domain>` returns the landing page.
3. **Production sender email.** In Resend, add and verify the production sending domain. Set `RESEND_EMAIL_FROM` (and the legacy aliases) to `GeoViz <reports@yourdomain>` or similar. **Critical:** the local `.env` uses `onboarding@resend.dev` (Resend's test sender, which only delivers to the account owner). That value must NOT carry into production — Resend will silently drop sends to arbitrary customer inboxes.
4. **Switch Stripe live keys.** Replace `STRIPE_SECRET_KEY` (`sk_live_…`) and `STRIPE_PRICE_ID` (a price object on the **live** account, $97.00 USD) in Vercel env. Re-deploy.
5. **Verify webhook.** Create a live-mode webhook in the Stripe dashboard pointing at `https://<your-domain>/api/stripe/webhook`, subscribed to `checkout.session.completed`. Copy the new `whsec_…` into `STRIPE_WEBHOOK_SECRET`. Hit "Send test webhook" from the dashboard and confirm a 200 response.
6. **Run live payment test.** Self-buy with a real card. Confirm: order appears at `/admin/reports?key=<ADMIN_SECRET>` with `Paid · Audit Pending`; the operator's inbox receives the new-order notification at `AUDIT_NOTIFICATION_EMAIL`.
7. **Verify report delivery.** Run the audit on the test order. Confirm: status moves to `Generated`, the report content is sane, and approve → send delivers the customer email.
8. **Verify PDF.** Open the email's PDF link and the in-app **Download PDF** button. Confirm: A4 layout, no broken card splits, no half-page dead zones, CTA not orphaned.
9. **Verify admin access.** Confirm `/admin/reports?key=<ADMIN_SECRET>` works on the live domain. Confirm `/admin/reports?key=wrong` returns the styled 401, not a 404.
10. **Monitor first 10 customer reports manually.** Walk every order through the Manual Pilot Operating Procedure above. Log feedback in the Admin notes field. Don't widen the cohort or automate the customer send until the first ten are clean.

## Production Worker (REQUIRED)

**Vercel cannot fulfill audits on its own.** The worker (`scripts/geo-worker.ts`) is a long-running Node process that polls Postgres for `reportStatus = "queued"` rows and runs the audit out-of-band. Without it, paid orders queue forever and customers get nothing.

Run it on **Railway** (recommended) or any always-on host alongside the Vercel deployment:

```bash
GEO_AUDIT_MODE=api npm run geo-worker
```

- Use `GEO_AUDIT_MODE=api` in production. The alternate `cli` mode shells out to `scripts/run-geo-audit.sh`, which requires the Claude Code CLI on PATH and a local skills directory — local-only.
- The worker needs the same `DATABASE_URL`, `ANTHROPIC_API_KEY`, and Resend env vars as the web app.
- One worker is enough for the MVP; the queue uses an atomic claim so multiple workers are safe but unnecessary.

## Deploy (Vercel)
- Push to GitHub, import in Vercel.
- Add the same env vars in the Vercel project settings (everything in `.env.example`).
- Set the Stripe webhook endpoint to `https://YOUR_DOMAIN/api/stripe/webhook` and put the live `whsec_...` in `STRIPE_WEBHOOK_SECRET`.
- Vercel will run `prisma generate` via `postinstall`.
- **Then deploy the worker separately** per the section above. A Vercel-only deploy will accept payments but never deliver reports.
# GeoViz
