# GeoViz — Phase 1 Hardening Plan

> A focused, action-oriented launch readiness plan. Converts the
> findings in `SYSTEM_AUDIT.md` into priorities for shipping a
> credible Phase 1.
>
> **Source of truth:** `CLAUDE.md` (Scoring Freeze, MVP Scope,
> Strategic Direction, Phase 1→4 roadmap) and `CLAUDE_DESIGN.md`
> (visual identity).
>
> **Scope constraints (per user instructions):**
> - Do not redesign the whole product.
> - Do not rebalance the scoring rubric (frozen per CLAUDE.md).
> - Do not add new features.
> - Do not build the WordPress / CMS plugin yet.
> - Do not build monitoring yet.
>
> **Priority legend:**
> - **LAUNCH BLOCKER** — must ship before the first paid customer (or block customers from paying).
> - **HIGH PRIORITY** — should ship before public launch; doesn't block first paid customers.
> - **NICE TO HAVE** — improves the product; defer if launch timing is tight.
> - **V2** — explicitly out of scope for Phase 1; tracked here so the team has a single place to point to.

## Executive summary

GeoViz is structurally close to launch. The paid flow (Stripe → webhook → worker → markdown → operator review → customer delivery) works end-to-end. Scoring is frozen and test-covered. V2 intelligence layers (Stage 1 ingest, Stage 2 render, Preflight) are persisting silently. The Foundation Fix CTA is a real form, not a mailto.

The ship-blocking work is narrow: **five LAUNCH BLOCKER items** across customer-visible UX (the 404 on early report click), Stripe webhook coverage (silent refund handling), email infrastructure (placeholder FROM fallback), production env validation (lazy instead of fail-loud), and one git-hygiene fix (Prisma migration lock not tracked). All five are 1–3 hour fixes individually.

The HIGH PRIORITY tier is mostly polish + trust-signal work: branded failure states, success-page improvements, legal-page styling, an About/Company surface, an operations runbook. The NICE TO HAVE tier is real but defer-able. V2 items are explicitly carved out per user instruction.

---

## 1. Audit/report reliability

### LAUNCH BLOCKER

- **`/report/[id]/print` returns 404 when `reportMarkdown` is null.**
  Why it matters: The customer's confirmation email contains a report link. If they click it before the worker finishes (queued → running) or if the audit failed, they hit a generic 404 instead of a branded "your audit is being prepared" or "we hit a problem" page. Worst customer impression after paying $97.
  Files: `src/app/report/[id]/print/page.tsx:58` (the `notFound()` call).
  Approach: Replace the `notFound()` branch with three states — `queued`/`running` shows a branded "being prepared" page with auto-poll every 10s; `failed` shows a branded "we'll fix it" page with the operator's email; only true 404 (no row) shows actual 404. Likely a small new client component (`ReportInFlight.tsx`) that polls `/api/admin/orders/[id]` — but with a CUSTOMER-safe endpoint, not the admin-gated one.

### HIGH PRIORITY

- **Customer-facing failure copy when `reportStatus === "failed"`.**
  Why it matters: Today the customer just sees 404. They have no idea their audit failed, no recourse, no understanding the operator was notified.
  Files: `src/app/report/[id]/print/page.tsx`, `src/lib/customer-emails.ts`.
  Approach: Branded failure state in the report page + leverage the existing `customer-failure-mapping.ts` to surface the right copy band.

### NICE TO HAVE

- **Surface estimated completion time on the in-flight state.**
  Files: `src/app/report/[id]/print/page.tsx` (in-flight component).
  Approach: Use rolling 7-day median `workerRuntimeMs` from `AuditOrder` as the estimate.

### V2

- **Real-time push (websocket / server-sent events) when audit completes.** Auto-poll covers Phase 1 needs.

---

## 2. Score consistency and calibration

The scoring path is largely **BUILT and frozen**: 6-category rubric, Calibration v2.2, 5-of-6 derived fill, canonical-vs-declared reconciliation. Test coverage is 13 score-consistency assertions.

### HIGH PRIORITY

- **Reconcile the `Calibration v2` vs `Calibration v2.2` version-string drift.**
  Why it matters: Audit prompt says `Calibration v2`; `audit-intelligence.ts` writes `scoringVersion = "Calibration v2.2"`. Operators reading reports and DB rows see inconsistent version anchors. Not a bug today but a future audit-engine bump becomes error-prone.
  Files: `scripts/geo-worker.ts` (around lines 259 + 880 in the rubric block), `src/lib/audit-intelligence.ts:79`.
  Approach: Pick one canonical version label (either bump the prompt to v2.2 or document the v2 → v2.2 suffix represents the projector revision history). Per CLAUDE.md change protocol, this is a **copy-only** edit — no rubric, weight, or band change.

- **Decide whether `GEO_PREFLIGHT_PROMPT=on` ships enabled.**
  Why it matters: Preflight stage (PR #19) persists structured signals but the Claude prompt doesn't see them. PARTIAL state — the moat is silently building but the audit quality isn't improving from it.
  Files: env config; `scripts/geo-worker.ts:~1500` (the flag check + prompt augmentation block).
  Approach: Enable in dev → run calibration probe (`npx tsx scripts/calibration-recalc.ts --archetypes`) on 1 weak + 1 average + 1 strong site → measure cost-per-audit delta and score-shift → flip in prod only if score shifts stay within ±2 across all three. Decision logged in CLAUDE.md.

### NICE TO HAVE

- **Periodic re-validation of the Structural Synergy Bonus against fresh audit data.**
  Files: `scripts/calibration-recalc.ts`, `scripts/geo-worker.ts`.
  Approach: Quarterly run + log. Per CLAUDE.md change protocol.

### V2

- **Multi-cohort scoring normalization** (industry percentile insights surfaced to customers).
- **Calibration v3** if real-world data shows the rubric needs broader adjustment.

---

## 3. Report copy quality

Test coverage: 24 assertions in `test:report-copy-defensibility` (all passing). Recipe abstraction landed in PR #17. Worker prompt copy-only fix for "AI tools" / "Google and AI tools" landed in PR #18.

### HIGH PRIORITY

- **End-to-end customer-eye read of a real generated report against `CLAUDE.md` Tone & Positioning rules.**
  Why it matters: Automated tests catch banned phrases, but not soft hype, generic-startup tone, or "guaranteed" leakage in dynamic Claude outputs.
  Files: spot-check via `npm run test:report-copy-defensibility` + manual read of 3 recent live reports.
  Approach: Operator does one read-through pre-launch; flag any phrasing that should be added to the banned-phrase test as a regression lock.

### NICE TO HAVE

- **A11y review of report HTML.**
  Why it matters: `<RadarChart>` is pure SVG with no `<title>` / `<desc>` / `aria-label`. Screen readers see nothing. Color contrast in score bands (e.g., the `bad` tier) hasn't been measured against WCAG AA.
  Files: `src/components/RadarChart.tsx`, `src/components/AuditReportContent.tsx`, `src/app/report/[id]/print/print.css`.
  Approach: Add ARIA labels to RadarChart; run Lighthouse accessibility audit; fix any AA-fail color pairs.

### V2

- **A/B copy testing harness** for prompt iterations.

---

## 4. PDF/customer report rendering

PDF render path exists and is tested: 60s `maxDuration`, clean JSON 500 on failure, browser always closed in `finally`.

### HIGH PRIORITY

- **Improve customer-facing PDF failure messaging.**
  Why it matters: Customer clicks "Download PDF" button → gets a generic JSON 500. No retry guidance, no operator-contact path.
  Files: `src/app/api/report/[id]/pdf/route.ts:104–127`.
  Approach: Add `Retry-After: 30` header + customer-visible error message via the calling UI; surface a "try again or email support@geoviz.ai" path.

- **Smoke-test puppeteer on edge-case content.**
  Why it matters: Long reports (10k+ chars), non-Latin business names, em-dashes, customer URLs with redirects — any of these could trigger render failures discovered first by a real customer.
  Files: `src/lib/generate-pdf.ts` + a new fixture-based smoke test in `scripts/test-pdf-edge-cases.ts`.
  Approach: Build 4-5 fixture markdown files exercising the edge cases; run puppeteer locally + on Railway pre-launch; document any failures + fix or document workarounds.

### NICE TO HAVE

- **PDF caching with CDN-friendly headers** for repeat downloads.
  Files: `src/app/api/report/[id]/pdf/route.ts`.
  Approach: Add `Cache-Control: public, max-age=31536000, immutable` after first render; key by report ID. Most customers download once — low impact.

### V2

- **Branded PDF preview thumbnails** on the report page.
- **Sharable PDF link** with separate access token (vs the order-ID one).

---

## 5. Landing page/design polish

Marketing + report surfaces are intelligence-grade per CLAUDE_DESIGN.md (PR #20 alignment audit). Legal pages and the dangling HeroForm are the open items.

### LAUNCH BLOCKER

- **Resolve `HeroForm.tsx` dangling reference.**
  Why it matters: `CLAUDE_DESIGN.md` lists `HeroForm.tsx` as a reusable component, but no current imports exist. Either dead code or a broken doc pointer. Both are bad signals for a first-time codebase reader.
  Files: `src/components/HeroForm.tsx`, `CLAUDE_DESIGN.md`.
  Approach: Two-option decision — (a) re-link it in the homepage hero flow if that was the original intent, or (b) delete the file + remove the CLAUDE_DESIGN.md reference. 30 minutes either way.

### HIGH PRIORITY

- **Visual polish pass on `/privacy`, `/terms`, `/refund-policy`.**
  Why it matters: Currently generic legal prose in a dark container. Rest of the site is intelligence-grade; legal pages read as "boilerplate SaaS." Out-of-band visual quality drop reduces trust.
  Files: `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, `src/app/refund-policy/page.tsx`.
  Approach: Wrap each section in the same `.section-eyebrow` + dark-premium card pattern the rest of the site uses. Pure framing — no content change.

- **Add a credible "About / Company" page or footer block.**
  Why it matters: $97 paid product. Footer today has only `mailto:support@geoviz.ai`. No team identification, no business address, no "who we are." US local-service businesses (the target customer per CLAUDE.md) are trust-sensitive; missing identifier signals look like a fly-by-night operation.
  Files: new `src/app/about/page.tsx` OR augmented `src/components/Footer.tsx`.
  Approach: At minimum — 1-paragraph "who we are," business address, support email, founder identification. Footer can also gain a "Company" link section.

### NICE TO HAVE

- **Extract inline marketing sub-components.**
  Why it matters: `src/app/page.tsx` defines `WhatCard`, `HowItWorksStep`, `MeasureCard`, `ProblemCard`, `PricingBullet`, etc. inline. Per CLAUDE_DESIGN.md convention, these should live under `src/components/marketing/` for consistency + reuse.
  Files: `src/app/page.tsx` + new `src/components/marketing/*.tsx`.
  Approach: Mechanical extraction; no behavior change. Improves discoverability for future contributors.

- **`rounded-xl` audit per CLAUDE_DESIGN.md.**
  Why it matters: 31 instances across the codebase vs "reserve heavier rounding for special elements" guidance. Most are in admin/report contexts (justified by density). Marketing surfaces should be re-verified.
  Files: ripgrep `rounded-xl` across `src/`.
  Approach: Spot-check marketing pages only; admin/report contexts are domain-appropriate.

### V2

- **Marketing-page redesign / case studies / testimonial section** — explicitly deferred. Today's intelligence-grade copy is adequate for Phase 1.

---

## 6. Foundation Fix positioning

All form + API + email flow **BUILT** in PRs #17 + #18.

### HIGH PRIORITY

- **Verify `/refund-policy` covers $497 Foundation Fix terms.**
  Why it matters: Customer pays $497 for the Foundation Fix expecting a 3–5 business day delivery. If they request a refund, the policy needs explicit language: when can they cancel, when can't they, what's a "complex site requires custom scoping" carve-out.
  Files: `src/app/refund-policy/page.tsx`.
  Approach: Read-through + augment any missing terms. No new infrastructure.

- **Regression test: confirm in-PDF CTA actually links to a working `/foundation-fix?orderId=…` URL.**
  Why it matters: The CTA is rendered via `ReportCtaCard` inside the puppeteer-rendered PDF. If the URL construction is broken in the printed PDF (vs the screen view), the customer's $497 next-step path is dead. Tested in component but not in the PDF output specifically.
  Files: `src/components/ReportCtaCard.tsx`, `src/lib/generate-pdf.ts`.
  Approach: Add to the PDF smoke-test (Category 4) — assert the generated PDF text contains the expected `/foundation-fix?orderId=…` href.

### NICE TO HAVE

- **A "what's included / what's not" sub-page.**
  Why it matters: Foundation Fix CTA links straight to the form. Some customers will want a scope-clarification surface before submitting.
  Files: new `src/app/foundation-fix/scope/page.tsx`; CTA optionally links to it.
  Approach: Single-page scope clarification. Optional — current CTA + email reply covers it for most customers.

### V2

- **AI Visibility Layer install-pack** — single-tag JSON-LD snippet prototype per CLAUDE.md "AI Visibility Layer Direction." **Explicitly deferred per user instruction (do not build WordPress plugin yet).** Scope-only for Phase 1.

---

## 7. Stripe/payment flow

`/api/stripe/webhook` is HMAC-verified, dedup'd on `stripeSessionId` UNIQUE, and the happy path works. But event coverage is narrow.

### LAUNCH BLOCKER

- **`/api/stripe/webhook` ignores everything except `checkout.session.completed`.**
  Why it matters: Refunds, disputes, payment failures all log to console and silently no-op. If a customer requests a refund through Stripe directly, the operator won't see it in the admin queue. Worst case: customer gets refund + operator still sends them a delivered report, then writes a follow-up bill.
  Files: `src/app/api/stripe/webhook/route.ts:71–112`.
  Approach: At minimum, add a `charge.refunded` branch that (a) logs visibly, (b) emails the admin with the refund context, (c) optionally flags the `AuditOrder` with a `refundIssued` admin note. Not a refund-automation system — just a "operator can't miss it" alert.

### HIGH PRIORITY

- **`/checkout/success` is a static "thanks" page with no Stripe session lookup.**
  Why it matters: Customer pays $97 → gets a generic confirmation with zero order details. No order reference number, no "your report will arrive at `<email>`" personalization, no recourse if the confirmation email fails to deliver.
  Files: `src/app/checkout/success/page.tsx`.
  Approach: Add Stripe session lookup via `session_id` query param (already passed in `success_url`); display order ID, business name, "report will arrive at `<email>`", + a small "didn't get your email? contact support@geoviz.ai" footer.

- **Add `charge.dispute.created` log + admin email.**
  Why it matters: Disputes have short response windows. An unread dispute becomes a chargeback. Operator needs to know immediately.
  Files: `src/app/api/stripe/webhook/route.ts`.
  Approach: Same shape as the `charge.refunded` handler — log + email admin + flag `AuditOrder.adminNotes`.

### NICE TO HAVE

- **`payment_intent.payment_failed` handler.**
  Why it matters: Pattern of failures could indicate Stripe config drift or fraud attempts.
  Files: `src/app/api/stripe/webhook/route.ts`.
  Approach: Log + optional operator alert if frequency exceeds N/hour.

### V2

- **Self-serve refund flow** — customer-facing UI to request a refund and trigger the Stripe refund automatically. Manual operator workflow is fine for Phase 1.

---

## 8. Email/report delivery

5 Resend send sites covering customer confirmations, admin notifications, report delivery, failure notices, and operator alerts. All wrapped in try/catch.

### LAUNCH BLOCKER

- **`FROM_EMAIL` falls back to `geoviz.local` placeholder.**
  Why it matters: Production deploy without `RESEND_EMAIL_FROM` / `EMAIL_FROM` / `RESEND_FROM_EMAIL` set will send from `GeoViz <orders@geoviz.local>` — an invalid placeholder Resend will reject. Today the only safeguard is a `console.warn` at module-load. The first audit that hits the failure path is the diagnostic event.
  Files: `src/lib/resend.ts:27–45`.
  Approach: In production, throw at module-load if no FROM env is set (or fail loud during the startup-env check from Category 10). The placeholder should ONLY be allowed in `NODE_ENV !== "production"`.

### HIGH PRIORITY

- **Customer email retry mechanism.**
  Why it matters: If `getResend().emails.send()` fails after a successful audit, the customer never receives their report. Today logs go to operator inbox; no auto-retry.
  Files: `src/lib/customer-emails.ts`, `src/app/api/admin/orders/[id]/send-report/route.ts`.
  Approach: Two options — (a) a simple retry-after-N-min queue in the worker, OR (b) prominently surface the failure state in the admin queue with a "Resend" button. Option (b) is lower complexity for Phase 1.

- **Per-order email audit panel in admin.**
  Why it matters: Operator currently can't see which emails an order has sent. Dedup fields exist (`adminEmailSentAt`, `customerConfirmationSentAt`, etc.) but no UI.
  Files: extend `src/components/AdminReportCard.tsx`.
  Approach: Single panel — "every email this order has sent, when, status, retry button." Maps directly to existing fields.

### NICE TO HAVE

- **Resend webhook handler for delivery / bounce / complaint events.**
  Files: new `src/app/api/resend/webhook/route.ts`.
  Approach: Log + optional operator alert for bounces; helps catch deliverability issues fast.

- **Email signature / from-address consistency across all 5 Resend send sites.**
  Files: `src/lib/resend.ts`, every site that calls `getResend().emails.send()`.
  Approach: One canonical sender block; each site differs only in subject + body.

### V2

- **Multi-channel delivery** (SMS / in-app).

---

## 9. Admin review flow

All BUILT for V1 — operator can review, approve, send, calibrate.

### HIGH PRIORITY

- **Document the operator review SLA.**
  Why it matters: Today's flow is "operator looks when they look." No visible signal when a report has been sitting in `generated` state for >2h without being sent. Customer expectation: "delivered within minutes" (per `/order` copy).
  Files: `src/components/AdminReportCard.tsx`, new section in `CLAUDE.md` or `OPERATIONS.md`.
  Approach: Define the SLA (e.g., 2h max from `reportGeneratedAt` to `reportSentToCustomerAt`); add a visible "stale review" badge on cards older than the SLA.

- **Bulk action: "approve and send all pending generated reports."**
  Why it matters: During launch traffic spikes, per-card clicks become operator-time burden.
  Files: `src/app/admin/reports/page.tsx`.
  Approach: A single button that approves + sends every report currently in `reportStatus = "generated"` AND `reviewStatus = pending` AND not yet sent. Add a confirmation dialog with the count.

- **Operator quickstart in `OPERATIONS.md`.**
  Why it matters: New operator needs a single doc to understand the daily review loop, the "what to look for" checklist, and the calibration tagging convention. No such doc exists.
  Files: new `OPERATIONS.md`.
  Approach: 1-2 pages — review loop, checklist, calibration tagging guide, escalation paths.

### NICE TO HAVE

- **Decompose `CalibrationDashboard.tsx` (2011 LOC).**
  Why it matters: Not urgent — it's an internal tool, not customer-facing. Will need decomposition before the next major calibration revision.
  Files: `src/components/CalibrationDashboard.tsx`.
  Approach: Extract logical sub-components incrementally as it grows.

### V2

- **Operator queue routing** for multiple operators (ownership, hand-off, audit-trail).

---

## 10. Deployment/production risks

### LAUNCH BLOCKER

- **`prisma/migrations/migration_lock.toml` not committed to git history.**
  Why it matters: Works today because only the `postgresql` provider is used. The next contributor on a different machine (or a non-postgres prisma dev environment) will regenerate the lock with a different provider AND ship a migration. Conflict surface that will only break when it breaks.
  Files: `prisma/migrations/migration_lock.toml`.
  Approach: `git add prisma/migrations/migration_lock.toml` + commit. Single-line fix.

- **Web app does NOT call `checkServerEnv()` at boot.**
  Why it matters: Missing prod env vars (DATABASE_URL, RESEND_API_KEY, STRIPE_SECRET_KEY, etc.) fail lazily at first customer request instead of failing loud at deploy time. The Railway worker has a preflight check (`preflightOrExit` in `geo-worker.ts:2480+`) but the Vercel-side Next.js app does not.
  Files: new `src/app/instrumentation.ts` (Next.js convention for startup hooks), or extend `src/lib/env.ts`.
  Approach: Call `checkServerEnv()` from `instrumentation.ts` so the deploy fails before serving the first request if any required env is missing. Next.js automatically invokes `instrumentation.ts` if `experimental.instrumentationHook = true` in `next.config.mjs` (Next 14) — or just ship as `instrumentation.ts` for Next 15+ behavior.

### HIGH PRIORITY

- **`scripts/diagnose-recent-audits.ts` is perpetually untracked across recent branches.**
  Why it matters: Shows up in every `git status` from recent work. Either it's a real operator tool worth committing, or it's a developer-local debug script that should be ignored.
  Files: `scripts/diagnose-recent-audits.ts` + `.gitignore`.
  Approach: Decide + act. If commit, also add to `package.json` scripts under `diagnose:recent-audits`. If gitignore, add `scripts/diagnose-*.ts` pattern.

- **Operations runbook for launch-week failure scenarios.**
  Why it matters: Operator needs a single doc covering: (a) failed audit recovery, (b) stuck queue resolution, (c) Stripe webhook outage handling, (d) Resend outage handling.
  Files: same new `OPERATIONS.md` from Category 9.
  Approach: One section per scenario — symptom → diagnosis command → recovery action.

- **Verify `ADMIN_PASSWORD` vs `ADMIN_SECRET` division in production envs.**
  Why it matters: Two-tier admin auth is correct (UI cookie vs API header) but easy to misconfigure. If only one is set, half the admin surface is wide-open or hard-locked.
  Files: `CLAUDE.md` operational verification section.
  Approach: Add a verification step to `## Operational Verification (post-deploy)` — pre-launch checklist item that both envs are set in Railway AND Vercel.

### NICE TO HAVE

- **Worker queue-depth + cost-spike alerting.**
  Why it matters: Today the only telemetry is `[geo-cost]` log lines. No proactive alerting on (a) queue backlog growing, (b) cost-per-audit spiking, (c) worker silent failures.
  Files: Railway log-based triggers (no code change) OR a small `scripts/health-check.ts` that runs on cron.
  Approach: Phase 1 can rely on operator log-grep; alerting is V2-adjacent.

### V2

- **Multi-region deployment** (latency optimization + redundancy).
- **Active-active worker pool** (currently single-shot worker per Railway service).
- **Database replication / read replicas** for the analytics-style admin queries.

---

## Prioritized launch checklist (cross-category)

Pulling the **LAUNCH BLOCKER** items from above into a single ranked list:

| # | Item | Category | Effort |
|---|---|---|---|
| 1 | Branded "audit being prepared" + "audit failed" UI on `/report/[id]/print` | 1 | 2–3h |
| 2 | `prisma/migrations/migration_lock.toml` commit | 10 | 5min |
| 3 | Web-app `checkServerEnv()` startup hook (`instrumentation.ts`) | 10 | 1h |
| 4 | `FROM_EMAIL` fail-loud in production (no placeholder fallback) | 8 | 30min |
| 5 | Stripe `charge.refunded` log + admin email handler | 7 | 1–2h |
| 6 | `HeroForm.tsx` dangling reference resolution | 5 | 30min |

Total LAUNCH BLOCKER effort: ~6–8 hours of focused work. Phase 1 is genuinely close.

---

## Explicitly deferred (V2 — not Phase 1)

Per user instruction, the following are tracked but **not built in Phase 1**:

- AI Visibility Layer install-pack (single-tag JSON-LD prototype)
- WordPress / Wix / Shopify CMS plugins
- Recurring monitoring / scheduled re-audits / change detection
- Multi-cohort scoring normalization (industry percentile insights)
- Operator queue routing for multiple operators
- Self-serve refund flow
- Real-time push for audit completion
- Multi-channel delivery (SMS / in-app)
- Multi-region deployment / database replication
- Worker queue alerting / cost-spike alerting (full system)

All of these are architected for in `CLAUDE.md` (V2/V3 sections + System Architecture Principles). Phase 1 ships the V1 audit + Foundation Fix form; everything else is intentional roadmap.

---

> End of plan. Generated 2026-05-16 against `main` branch state
> post-PR #21 (SYSTEM_AUDIT.md). Cross-references: `SYSTEM_AUDIT.md`
> for the descriptive snapshot, `CLAUDE.md` for strategic +
> operational rules, `CLAUDE_DESIGN.md` for visual identity.
