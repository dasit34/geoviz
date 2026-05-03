# GeoViz

Lean MVP that sells **AI Visibility Audits** ($147) for local service businesses. GeoViz audits whether ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews can find, understand, and recommend a business.

This repo is the customer-facing site + order flow + admin queue. **Audit fulfillment is manual.**

## Stack
- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS
- Prisma + PostgreSQL
- Stripe Checkout (one-time $147)
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
   - `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFY_EMAIL` — Resend
   - `ADMIN_PASSWORD` — admin page password
   - `NEXT_PUBLIC_APP_URL` — your deployed URL (or `http://localhost:3000`)

3. **Stripe setup**
   - Create a one-time Product/Price for **$147** in the Stripe dashboard. Use the Price ID for `STRIPE_PRICE_ID`.
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
2. `stripe-webhook` saves the order to Postgres.
3. Resend emails `ADMIN_NOTIFY_EMAIL`.
4. Admin runs the audit manually and emails the report.
5. Admin marks the order `completed` in `/admin`.

## Deploy (Vercel)
- Push to GitHub, import in Vercel.
- Add the same env vars in the Vercel project settings.
- Set the Stripe webhook endpoint to `https://YOUR_DOMAIN/api/stripe/webhook` and put the live `whsec_...` in `STRIPE_WEBHOOK_SECRET`.
- Vercel will run `prisma generate` via `postinstall`.
# GeoViz
