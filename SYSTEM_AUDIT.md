# GeoViz — System Audit

> Read-only system snapshot. Source-of-truth framing: `CLAUDE.md`
> (strategic + operational rules + Scoring Freeze + Phase 1→4 roadmap)
> and `CLAUDE_DESIGN.md` (visual identity). This document measures
> the current codebase against those two docs and reports what is
> built, partial, planned, or risky. **No code changes accompany
> this audit.**
>
> **Status label legend:**
> - **BUILT** — fully implemented + working in production.
> - **PARTIAL** — exists but limited / behind a flag / not customer-surfaced.
> - **PLANNED** — explicitly on the roadmap (CLAUDE.md V2/V3 sections); no code yet.
> - **RISK** — live in production with a fragility or gap to track.

## Executive summary

GeoViz today is a working V1 audit product with a structured V2
intelligence layer already operational underneath. Customer payment,
audit generation, report rendering, PDF delivery, and operator
review are all **BUILT**. The 6-category Calibration v2.2 rubric is
frozen and reconciled across declared / canonical / per-category
score paths. V2 layers — Stage 1 intelligence ingest, Stage 2 render
intelligence (headless puppeteer), and the just-added Preflight
intelligence stage (4 Node-side analyzers persisted to
`AuditIntelligence.preflightSignals`) — are wired into every audit
and silently building the longitudinal dataset that becomes the moat.

The Foundation Fix has moved from a mailto link to a real form
route (`/foundation-fix` + `/api/foundation-fix`) with structured
capture, rate limiting, and admin/customer emails — **BUILT**. The
broader AI Visibility Layer (script/snippet installs, CMS plugins,
discoverability monitoring) is **PLANNED** in CLAUDE.md; no code yet.

Top risks: the preflight prompt-augmentation flag is off in
production (PARTIAL — built and persisting but not feeding Claude
yet), the stale-job recovery script has no documented schedule
(RISK), and the legal pages haven't received the intelligence-grade
visual treatment the rest of the site has (PARTIAL).

---

## 1. Current stack

| Layer | Stack | Status |
|---|---|---|
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS | **BUILT** |
| Backend | Next.js API routes (server-only utilities under `src/lib/`) | **BUILT** |
| Database | PostgreSQL via Prisma (schema in `prisma/schema.prisma`) | **BUILT** |
| Hosting (web) | Vercel — runs `npm run start` (Next.js server) | **BUILT** |
| Hosting (worker) | Railway — Dockerfile `node:20-bookworm-slim`, start command `npm run geo-worker:dev` (loop mode) | **BUILT** |
| Payments | Stripe (checkout sessions + signed webhook) | **BUILT** |
| Email | Resend (singleton client in `src/lib/resend.ts`) | **BUILT** |
| AI / Audit engine | Anthropic Messages API (`claude-sonnet-4-6` default) with the `web_search_20250305` server-side tool. Worker calls it directly; no proxy. | **BUILT** |
| Headless browser | `puppeteer-core` + `@sparticuz/chromium` for PDF render + V2 Stage 2 render intelligence | **BUILT** |
| Schema validation deps | `@mozilla/readability`, `jsdom`, `schema-dts` — used by V2 preflight stage | **BUILT** |

Tech-stack rule from `CLAUDE.md`: "Do not introduce unnecessary
libraries." Current dependency footprint matches that rule — every
runtime dep is load-bearing.

---

## 2. Application architecture

### 2.1 Page routes

| Route | File | Purpose | Status |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Marketing homepage — hero, what-we-measure, how-it-works, pricing, foundation-fix offer | **BUILT** |
| `/order` | `src/app/order/page.tsx` | Order form → `/api/checkout` → Stripe | **BUILT** |
| `/checkout/success` | `src/app/checkout/success/page.tsx` | Post-payment confirmation | **BUILT** |
| `/checkout/cancel` | `src/app/checkout/cancel/page.tsx` | Abandoned-checkout landing | **BUILT** |
| `/foundation-fix` | `src/app/foundation-fix/page.tsx` | Foundation Fix request form (replaces prior mailto) | **BUILT** |
| `/sample-report` | `src/app/sample-report/page.tsx` | Public sample-report index | **BUILT** |
| `/sample-report/[slug]` | `src/app/sample-report/[slug]/page.tsx` | Individual sample report (uses `AuditReportContent`) | **BUILT** |
| `/report-preview` | `src/app/report-preview/page.tsx` | Dev preview of report rendering | **BUILT** |
| `/test-report` | `src/app/test-report/page.tsx` | Dev test endpoint without Stripe | **BUILT** |
| `/report/[id]` | `src/app/report/[id]/page.tsx` | Bare report URL — redirects to `/print` (eliminates 307-vs-404 info leak) | **BUILT** |
| `/report/[id]/print` | `src/app/report/[id]/print/page.tsx` | Customer-facing report — same surface used for screen + Puppeteer PDF | **BUILT** |
| `/admin` | `src/app/admin/page.tsx` | Admin orders queue (gated by `ADMIN_PASSWORD` cookie) | **BUILT** |
| `/admin/reports` | `src/app/admin/reports/page.tsx` | Report review queue + cost aggregates | **BUILT** |
| `/admin/calibration` | `src/app/admin/calibration/page.tsx` | Operator calibration workbench | **BUILT** |
| `/privacy` | `src/app/privacy/page.tsx` | Legal — Privacy Policy | **PARTIAL** (generic prose; see §5) |
| `/terms` | `src/app/terms/page.tsx` | Legal — Terms of Service | **PARTIAL** |
| `/refund-policy` | `src/app/refund-policy/page.tsx` | Legal — Refund Policy | **PARTIAL** |

### 2.2 API routes

| Method | Path | File | Purpose | Auth |
|---|---|---|---|---|
| POST | `/api/checkout` | `src/app/api/checkout/route.ts` | Mint Stripe checkout session | Rate-limit only (5/10min/IP) |
| POST | `/api/test-audit` | `src/app/api/test-audit/route.ts` | Queue a no-payment test order (dev) | Rate-limit |
| POST | `/api/stripe/webhook` | `src/app/api/stripe/webhook/route.ts` | `checkout.session.completed` handler; queues audit + sends customer/admin emails | Stripe HMAC |
| POST | `/api/foundation-fix` | `src/app/api/foundation-fix/route.ts` | Capture Foundation Fix request; append to `AuditOrder.adminNotes` if `orderId` provided; admin + customer email | Rate-limit |
| GET | `/api/admin/orders/[id]` | `src/app/api/admin/orders/[id]/route.ts` | Reconciliation poll — current status / markdown / error | `ADMIN_SECRET` |
| POST | `/api/admin/orders/[id]/run-geo-audit` | `src/app/api/admin/orders/[id]/run-geo-audit/route.ts` | Manually enqueue order (flip `reportStatus` to `queued`) | `ADMIN_SECRET` |
| POST | `/api/admin/orders/[id]/send-report` | `src/app/api/admin/orders/[id]/send-report/route.ts` | Trigger customer delivery email + PDF attachment | `ADMIN_SECRET` |
| POST | `/api/admin/orders/[id]/review` | `src/app/api/admin/orders/[id]/review/route.ts` | Review-status + quality-score update | `ADMIN_SECRET` |
| GET | `/api/admin/audit-intelligence/[id]` | `src/app/api/admin/audit-intelligence/[id]/route.ts` | Read V2 `AuditIntelligence` row | `ADMIN_SECRET` |
| GET/POST | `/api/admin/calibration/[id]` | `src/app/api/admin/calibration/[id]/route.ts` | Operator verdict / confidence / benchmark tag | `ADMIN_SECRET` |
| POST | `/api/admin/calibration` | `src/app/api/admin/calibration/route.ts` | Bulk calibration ops | `ADMIN_SECRET` |
| GET | `/api/report/[id]/pdf` | `src/app/api/report/[id]/pdf/route.ts` | Server-side Puppeteer PDF render of `/report/[id]/print` | Rate-limit (5/5min/IP) |

Two-tier admin auth: `ADMIN_PASSWORD` cookie gates the `/admin` UI;
`ADMIN_SECRET` header/query gates the `/api/admin/*` routes. Keep the
two distinct — they protect different surfaces.

### 2.3 Report generation flow

Trace from customer click to delivered report (file:line refs):

1. **Order submit.** `src/components/OrderForm.tsx:47` POSTs to `/api/checkout`.
2. **Stripe session.** `src/app/api/checkout/route.ts:109` calls `getStripe().checkout.sessions.create()`; returns session URL.
3. **Customer pays on Stripe.** Stripe POSTs `checkout.session.completed` to `/api/stripe/webhook`.
4. **Webhook receiver.** `src/app/api/stripe/webhook/route.ts:56` verifies HMAC, `:80` upserts `AuditOrder`, `:168–178` flips `reportStatus` to `"queued"`, `:97` sends customer confirmation, `:105` sends admin notification.
5. **Worker claim.** `scripts/geo-worker.ts:processOneJob` (~line 2072) fetches a `queued` row, then `updateMany` WHERE `id` + `reportStatus="queued"` — atomic claim, zero matches = lost the race.
6. **Audit prompt build.** `scripts/geo-worker.ts:172` `buildAuditPrompt(websiteUrl, competitorUrl, {fast})`.
7. **(Optional) Preflight prompt augmentation.** If `GEO_PREFLIGHT_PROMPT=on`, `scripts/geo-worker.ts:~1500` runs `runPreflight()` and prepends a "Validated preflight signals" markdown block. Default off.
8. **Claude API call.** `scripts/geo-worker.ts:1524` `client.messages.create()` with `model: ANTHROPIC_MODEL`, `tools: [web_search_20250305]`, `AbortController` timeout.
9. **Sanitize markdown.** `scripts/geo-worker.ts:~2148` `sanitizeReportMarkdown()` strips preamble + replaces `<GENERATED_DATE>`.
10. **Persist markdown.** `scripts/geo-worker.ts:~2207` `prisma.auditOrder.update()` with `reportStatus="generated"`, `reportMarkdown`, cost telemetry, runtime.
11. **V2 intelligence persistence.** `scripts/geo-worker.ts:~2283` `persistAuditIntelligence()` → `src/lib/audit-intelligence.ts:171` upsert. Inside it: Stage 1 ingest → Preflight stage → Stage 2 render. Each in try/catch, all non-fatal.
12. **Operator notify.** `scripts/geo-worker.ts:~2310` `notifyOperatorReportReady()` → operator email.
13. **Customer delivery.** Operator clicks "Send Report" in admin → `/api/admin/orders/[id]/send-report` → `src/lib/generate-pdf.ts` renders `/report/[id]/print` to PDF → Resend email with attachment.

### 2.4 Audit pipeline flow (Claude-side)

Inside the Claude call (step 8 above), the model receives:

- **Input prompt**: business URL, competitor URL, the frozen Calibration v2.2 rubric with explicit ladder anchors per category, defensible-language guardrails, output-format mandate.
- **Tool**: `web_search` to fetch homepage / robots.txt / sitemap.xml / llms.txt.
- **Output**: 6-section markdown (Executive summary, Category breakdown, Top strengths / Best current signals, Diagnosis, Action plan, Business impact) — typically 600–900 words full mode, 350–550 words fast mode.

### 2.5 Scoring flow

Parser path (`src/lib/parse-report.ts:157–301`):

- **Two-stage regex per category** — strict + tolerant patterns extract `n/max`.
- **5-of-6 derived fill** — if exactly one sub-score is null AND declared overall exists, derive it as `overall - sum(other five)` when in valid range. Prevents one-missing-score from blanking the breakdown.
- **Canonical-vs-declared reconciliation** — `rubricSum` = sum of all six when fully parsed; `overall = rubricSum ?? declaredOverall`. Mismatches log `[geo-score-consistency] mismatch`. The admin surface always reads canonical, never declared.

---

## 3. Database models

### 3.1 Prisma models (current state)

| Model | Field count | Purpose | Status |
|---|---|---|---|
| `AuditOrder` | 23+ | Customer order + payment transaction + V1 report state machine + cost telemetry. The canonical write target for `reportMarkdown`. | **BUILT** |
| `AuditIntelligence` | 33+ | V2 normalized data foundation — one row per generated audit, never customer-facing. Written by `persistAuditIntelligence()` in try/catch after `reportMarkdown` succeeds. | **BUILT** |

### 3.2 `AuditOrder` highlights

- Identity: `id`, `websiteUrl`, `email`, `businessName`, `competitorUrl`, `stripeSessionId` (unique).
- V1 state machine: `paymentStatus`, `auditStatus`, `reportStatus`, `reportError`, `reportQueuedAt`, `reportStartedAt`, `reportGeneratedAt`, `reportSentToCustomerAt`, `reviewStatus`, `adminNotes`, `qualityScore`.
- Operational: `failureReason`, `retryCount`, `lastRetryAt`, `customerFailureNotifiedAt`.
- Cost telemetry: `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `modelUsed`, `estimatedCostUsd` (`Decimal(10,6)?`), `workerRuntimeMs`.

### 3.3 `AuditIntelligence` highlights

- Scores (0..100 nullable): `overallScore`, `semanticClarityScore`, `crawlerAccessibilityScore`, `trustSignalScore`, `structuredIdentityScore`, `recommendationReadinessScore`, `renderabilityScore`.
- V2 JSON columns:
  - `preflightSignals Json?` — Node-side preflight stage output (see §4.7). **BUILT in PR #19.**
  - `rawSignalSnapshot Json` — full parser output for debugging.
  - `scoreProvenance Json?` — per-dimension reasons + signals.
  - `extractedEntities Json?` — string[] business names, services, locations.
  - `aiReadabilityFlags`, `majorIssueCategories`, `majorFixCategories`, `topObservedStrengths`, `topObservedWeaknesses` — categorization arrays (always written, can be empty).
  - `benchmarkTags Json?` — SYSTEM-set cohort tags (distinct from operator-set `benchmarkTag` scalar).
- V2 Stage 1 fields: `cmsDetected`, `frameworkDetected`, `schemaTypes`, `aiReadabilityScore`, `contentDensity`, `renderRequired`, `renderAttempted`, `renderSuccessful`, `renderEngineVersion`.
- V2 Stage 2 render: `renderDurationMs`, `renderedHtmlLength`, `renderedTextLength`, `renderedSchemaTypes`, `hydrationDetected`, `blankShellRisk`, `clientOnlyContentDetected`, `renderConfidence`, `renderFailureReason`, `rawTextLength`, `rawSchemaTypes`, `schemaDeltaDetected`, `contentDeltaDetected`.
- Operator calibration: `operatorVerdict` (`accurate`|`slightly_high`|`too_high`|`slightly_low`|`too_low`), `operatorConfidence` (`high`|`medium`|`low`), `benchmarkTag` (`excellent_example`|`average_example`|`weak_example`|`edge_case`), `calibrationNotes`, `operatorReviewed`, `operatorNotes`.
- Versioning: `auditEngineVersion`, `scoringVersion="Calibration v2.2"`, `promptVersion?`, `confidenceLevel`.

### 3.4 Migration timeline

13 migrations under `prisma/migrations/`:

| Migration | Adds |
|---|---|
| `20260508000000_baseline` | Initial schema — `AuditOrder`, payment + audit enums |
| `20260508000001_add_sent_to_columns` | `sentTo`, `sentCc` |
| `20260509000000_add_customer_confirmation_sent_at` | `customerConfirmationSentAt` |
| `20260512000000_add_audit_intelligence` | `AuditIntelligence` table |
| `20260513000000_add_industry_taxonomy` | `industryCategoryRaw`, `industryCategoryNormalized`, `industryTaxonomyVersion` |
| `20260514000000_add_processing_status_fields` | `failureReason`, `retryCount`, `lastRetryAt` |
| `20260515000000_add_token_usage_tracking` | Cost telemetry fields on `AuditOrder` |
| `20260516000000_add_worker_runtime_ms` | `workerRuntimeMs` |
| `20260516134336_add_preflight_signals_to_audit_intelligence` | `preflightSignals Json?` (PR #19) |
| `20260517000000_add_calibration_intelligence` | Operator calibration fields |
| `20260518000000_add_v2_intelligence_fields` | Stage 1: cms / framework / schemaTypes / aiReadabilityScore / contentDensity / render flags / benchmarkTags / extractedEntities / scoreProvenance |
| `20260519000000_add_stage2_render_intelligence` | Stage 2 render-comparison fields |
| `20260520000000_add_customer_failure_notified_at` | `customerFailureNotifiedAt` |

Pattern is strictly additive — every column added since baseline is
nullable. No destructive migrations. Matches `CLAUDE.md` "Prefer
additive nullable fields."

---

## 4. Audit engine

### 4.1 Crawl flow — **BUILT** (in-Claude) + **BUILT** (Node-side)

Two crawl surfaces coexist:

- **In-Claude crawl** (the primary path) — the model's `web_search` tool fetches the homepage + `/robots.txt` during the API call. The prompt explicitly bounds it to those URLs ("Do NOT crawl. Do NOT fabricate findings"). Fetches happen inside the Anthropic API call; no Node-side HTML reaches the worker.
- **Node-side crawl** (V2 — supplementary) — preflight stage (§4.7) and render intelligence (§4.8) each do their own `fetch()` of the homepage. Independent of the Claude call, fail-soft.

### 4.2 Readability extraction — **BUILT**

`src/lib/intelligence/preflight/extractReadableContent.ts` — uses
`@mozilla/readability` via `jsdom`. Strips nav/footer/scripts before
returning cleaned readable text. Falls back to bare `<body>` text
when Readability can't parse the page. Never throws. Result:
`{textLength, parsedByReadability, fallbackUsed, articleTitle, wordCount, preview}`.

### 4.3 Schema validation — **BUILT**

`src/lib/intelligence/preflight/schemaValidation.ts` — parses every
`<script type="application/ld+json">` block, recursively walks
`@graph` arrays, detects LocalBusiness-family `@type`s
(RoofingContractor, Restaurant, Dentist, MedicalBusiness, etc.),
runtime-checks the six required entity fields: `name`, `address`,
`telephone`, `url`, `geo`, `openingHours`. Returns
`{score, presentFields, missingFields, malformedFields, detectedTypes, rawJsonLdCount, notes}`.

### 4.4 Crawlability checks — **BUILT**

`src/lib/intelligence/preflight/crawlabilityAudit.ts` — direct
Node-side checks:
- Homepage `<meta name="robots">` for `noindex`.
- Homepage `<link rel="canonical">` presence + same-origin check.
- `/robots.txt` fetch + parse for "User-agent: * + Disallow: /" block-all pattern.
- `/sitemap.xml` fetch + XML-shape sniff.

Returns `{score, findings, warnings, passedChecks, failedChecks}`.

### 4.5 Entity consistency — **BUILT**

`src/lib/intelligence/preflight/entityConsistency.ts` — extracts
`(name, phone, address)` from three surfaces (schema, homepage prose,
footer) and normalizes for comparison. Phone normalized to digits-only;
address comparison uses prefix-match (homepage often has just street,
schema has full street+locality+region). Returns
`{score, extractedEntities, inconsistencies, confidence}`.

### 4.6 AI prompt flow — **BUILT** (frozen)

`scripts/geo-worker.ts:buildAuditPrompt()` lines 172–791 (fast mode)
+ 880–1020 (full mode). Frozen surfaces (per `CLAUDE.md` Scoring
Freeze):

- Six category weights: Schema 25, Crawler 20, Trust 20, Content 15, Brand 10, Tech 10.
- Five score bands: 0–25 / 26–45 / 46–65 / 66–80 / 81–100.
- Calibration v2 ladder anchors per category with partial credit between rungs.
- Structural Synergy Bonus: +3 to Schema (capped 25) when Content≥12 AND Brand≥8 AND Tech≥7 AND Crawler≥15 AND at least one machine-readable signal.
- Defensible-language block, distinct-section-roles block, score-framing block.

### 4.7 Preflight intelligence (V2) — **BUILT** (persistence) + **PARTIAL** (prompt augmentation off by default)

The Preflight stage runs once per audit between Stage 1 ingest and
Stage 2 render. One `fetch()` of the homepage HTML, then four
analyzers in parallel via `Promise.all`. Consolidated
`PreflightSignals` JSON persisted to `AuditIntelligence.preflightSignals`.

| Analyzer | File | Status |
|---|---|---|
| Readability extraction | `src/lib/intelligence/preflight/extractReadableContent.ts` | **BUILT** |
| Schema validation | `src/lib/intelligence/preflight/schemaValidation.ts` | **BUILT** |
| Crawlability audit | `src/lib/intelligence/preflight/crawlabilityAudit.ts` | **BUILT** |
| Entity consistency | `src/lib/intelligence/preflight/entityConsistency.ts` | **BUILT** |
| Orchestrator | `src/lib/intelligence/preflight/runPreflight.ts` | **BUILT** |
| Prompt augmentation flag | `scripts/geo-worker.ts` (gated by `GEO_PREFLIGHT_PROMPT=on`) | **PARTIAL** — default off; Claude doesn't see ground-truth signals yet |

### 4.8 Render intelligence (V2 Stage 2) — **BUILT**

`src/lib/intelligence/render/` — real puppeteer-core + Chromium
(via `@sparticuz/chromium`) headless rendering. Gated by
`GEO_RENDER_ENABLED`. Eligibility gate in `renderEligibility.ts`
(framework signals, content density, blank-shell heuristics).
Compares raw HTML vs rendered HTML; detects hydration, blank-shell
risk, client-only content, schema deltas, content deltas. Fail-soft:
render failure stores `renderFailureReason` and leaves render fields
null; never blocks audit completion.

### 4.9 Scoring rubric logic — **BUILT** (frozen)

`src/lib/parse-report.ts` — `parseReportScoreBreakdown` parses
markdown scores, applies 5-of-6 derived-fill, reconciles canonical
vs declared. `scoringVersion = "Calibration v2.2"` persisted to
every `AuditIntelligence` row. See §2.5 for the flow.

---

## 5. Design system status

### 5.1 Visual identity foundation — **BUILT**

`tailwind.config.ts` + `src/app/globals.css` define a coherent token
set:

- Palette: `ink-950`/`ink-900`/`ink-800`/`ink-700`/`ink-600` (dark surfaces) + `accent` (#ff7a18 orange) + `accent-glow` + `accent-blue` (#2b8bff).
- Utility classes: `.container-page`, `.btn-primary`, `.btn-ghost`, `.input-field`, `.card`, `.card-hover`, `.pill`, `.section-eyebrow`, `.h1`/`.h2`/`.h3`, `.muted`, `.report-prose`.
- Backgrounds: `.bg-radial-orange`, `.grid-bg`.
- Animations: `animate-pulseSoft` (hero badge), `animate-floatY` (report preview).
- Shadows: `shadow-glow`, `shadow-glow-blue`, `shadow-card`.

### 5.2 Page-by-page alignment with `CLAUDE_DESIGN.md`

| Page | Aesthetic match | Status |
|---|---|---|
| `/` | Modular sub-components, `.section-eyebrow`, `.h1`, `bg-radial-orange`, inline SVG icons, `animate-floatY` preview | **BUILT** |
| `/order` | Dark-premium, `.section-eyebrow`, form-focused, `.input-field` utilities | **BUILT** |
| `/foundation-fix` | Mirrors `/order` structure — `bg-radial-orange`, `.section-eyebrow`, matching form | **BUILT** |
| `/sample-report/[slug]` | Shared `AuditReportContent` template | **BUILT** |
| `/report/[id]/print` | Same `AuditReportContent` — works for screen + Puppeteer PDF | **BUILT** |
| `/checkout/success` | `.pill`, `.h2`, emerald success icon, numbered steps | **BUILT** |
| `/checkout/cancel` | `.pill`, `.h2`, minimal recovery copy | **BUILT** |
| `/admin/*` | Dense but scannable; `.pill` for status, rounded panels for data | **BUILT** (operator tooling — density appropriate) |
| `/privacy` | Dark container but generic legal prose, no card framing | **PARTIAL** |
| `/terms` | Same — generic legal prose | **PARTIAL** |
| `/refund-policy` | Same — generic legal prose | **PARTIAL** |

### 5.3 Component inventory

| Component | Status | Notes |
|---|---|---|
| `Header.tsx`, `Footer.tsx`, `Logo.tsx` | **BUILT** | Reused on 8+ pages |
| `OrderForm.tsx` | **BUILT** | Client component; used on `/order` |
| `FoundationFixForm.tsx` | **BUILT** | Sibling of `OrderForm`; used on `/foundation-fix` |
| `ReportCtaCard.tsx` | **BUILT** | Replaced prior mailto with internal `/foundation-fix?orderId=…` link |
| `AuditReportContent.tsx` | **BUILT** | Shared report template (715 LOC — domain-justified) |
| `ReportScoreCard.tsx`, `CategoryScoreCard.tsx`, `RadarChart.tsx`, `StrengthCard.tsx`, `PlatformVisibilityRow.tsx` | **BUILT** | Report sub-components |
| `AdminReportCard.tsx` | **BUILT** | Admin queue card (1281 LOC — internal tool) |
| `CalibrationDashboard.tsx` | **BUILT** | Operator workbench (2011 LOC — internal tool) |
| `RateLimitedNotice.tsx` | **BUILT** | 429 page |
| `HeroForm.tsx` | **RISK** | Referenced in CLAUDE_DESIGN.md but no active imports — either deprecated leftover or broken link |

### 5.4 Highest-impact UI fixes (PARTIAL → BUILT candidates)

1. **Legal pages** — wrap `/privacy`, `/terms`, `/refund-policy` in the
   same dark-premium section-card pattern the rest of the site uses
   without changing content. Pure framing.
2. **Inline marketing sub-components.** `src/app/page.tsx` defines
   `WhatCard`, `HowItWorksStep`, `MeasureCard`, `ProblemCard`,
   `PricingBullet` inline. Per `CLAUDE_DESIGN.md` convention, extract
   to `src/components/marketing/` for consistency. Cosmetic; not
   urgent.
3. **`rounded-xl` audit.** 31 instances across the codebase, mostly
   in admin/report contexts where density is appropriate. Per
   `CLAUDE_DESIGN.md` ("reserve heavier rounding for special
   elements"), the marketing surfaces should be re-verified — they
   currently use `rounded-md`/`rounded-lg` correctly, but spot-check
   any future additions.

---

## 6. Foundation Fix system

### 6.1 Current implementation — **BUILT** (form + API + email)

- **Form**: `src/app/foundation-fix/page.tsx` + `src/app/foundation-fix/FoundationFixForm.tsx`. Captures `businessName`, `websiteUrl`, `contactEmail` (required), `auditOrderId` (optional, prefilled from `?orderId=`), `notes` (optional). Prefilled from query string when linked from in-report CTA.
- **API**: `src/app/api/foundation-fix/route.ts` (POST).
  - Zod validation (`foundationFixInputSchema` in `src/lib/validation.ts`).
  - Rate limit: 5/10min per IP.
  - **Persistence (`adminNotes` behavior)**: when `auditOrderId` is provided AND the DB is reachable AND the order exists, appends a structured timestamped block to `AuditOrder.adminNotes` (`[foundation-fix request · ISO timestamp]\nbusiness: …\nwebsite: …\ncontact: …\nnotes: …`). When `orderId` is absent or order not found, persistence is skipped and only the emails fire.
  - **Emails (via Resend)**:
    - Admin notification → `ADMIN_NOTIFY_EMAIL`, `replyTo: contactEmail`.
    - Customer confirmation → `contactEmail`.
  - **Failure behavior**: returns `{ok: true}` even if Resend or DB is degraded (logs warnings, customer sees success). No infrastructure errors surfaced to the customer.
- **In-report CTA**: `src/components/ReportCtaCard.tsx` — links to `/foundation-fix?orderId=…&businessName=…`. Replaces prior `mailto:` (which lost customers between click + email compose).

### 6.2 AI Visibility Layer — **PLANNED**

Per `CLAUDE.md` "AI Visibility Layer Direction", the Foundation Fix
is the manual on-ramp to a broader productized **AI Visibility
Layer**:

| Capability | Status |
|---|---|
| Schema generation (templated per archetype) | **PLANNED** (preflight `schemaValidation` already builds the validation half — generation half is unbuilt) |
| `llms.txt` generation | **PLANNED** |
| AI-readable business blocks (services, hours, trust signals) | **PLANNED** |
| Script / snippet installs (one-tag drop-in) | **PLANNED** |
| CMS plugins (WordPress / Wix / Shopify) | **PLANNED** |
| Discoverability monitoring (recurring scans + change detection) | **PLANNED** — architected for in `## Monitoring & Intelligence Module (V2)` of `CLAUDE.md`'s System Architecture |
| Automated entity optimization (V3 — agents propose + with approval deploy changes) | **PLANNED** — `## Automation & Action Module (V3)` |

**Explicit guardrail (from `CLAUDE.md`):** "The AI Visibility Layer
is **not** an attempt to rebuild customer websites. We are not a
CMS. We are not a site builder. We're a thin, focused,
machine-readable context layer that sits alongside whatever the
customer already has."

---

## 7. Deployment and operations

### 7.1 Vercel (web tier) — **BUILT**

- Runs `npm run start` (Next.js server).
- Auto-deploys on push.
- `next.config.mjs` marks `@sparticuz/chromium` + `puppeteer-core` as external (preserves on-disk binary paths).
- No `vercel.json` — Next.js detection is automatic.
- Auto-injected: `VERCEL_URL`, `VERCEL_ENV`.

### 7.2 Railway (worker tier) — **BUILT**

- Dockerfile: `node:20-bookworm-slim`. `npm ci` triggers postinstall (`prisma generate`). Copies full source.
- Start command: `npm run geo-worker:dev` (loop mode). Polls `queued` rows every `GEO_WORKER_POLL_MS` (default 12s). Graceful SIGINT/SIGTERM.
- Health: worker logs `[geo-worker]` prefix for every poll + claim + completion. `[geo-cost]` log line per audit.

### 7.3 Environment variables

**Required in production:**

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres (shared by Vercel + Railway) |
| `ANTHROPIC_API_KEY` | Direct Anthropic Messages API (worker only) |
| `ADMIN_SECRET` | Admin API auth (header / query) |
| `RESEND_API_KEY` | All outbound email |
| `STRIPE_SECRET_KEY` | Checkout session creation |
| `STRIPE_PRICE_ID` | $97 audit price |
| `STRIPE_WEBHOOK_SECRET` | Webhook HMAC verification |

**Optional / fallbacks:**

| Variable | Purpose |
|---|---|
| `RESEND_EMAIL_FROM` / `EMAIL_FROM` | FROM address (falls back to `geoviz.local` placeholder — **RISK** if not set in prod) |
| `ADMIN_NOTIFY_EMAIL` / `EMAIL_TO` | Operator notification inbox |
| `ADMIN_PASSWORD` | `/admin` UI cookie auth (separate from `ADMIN_SECRET`) |
| `NEXT_PUBLIC_SITE_URL` / `SITE_URL` / `NEXT_PUBLIC_APP_URL` | Site URL resolution (falls back to `VERCEL_URL`) |
| `GEO_AUDIT_MODE` | `api` (prod) or `cli` (dev) |
| `GEO_WORKER_POLL_MS` / `GEO_WORKER_TIMEOUT_MS` / `GEO_WORKER_SLOW_WARN_MS` | Worker tuning |
| `ANTHROPIC_MODEL` / `ANTHROPIC_MAX_TOKENS` | Model selection / output budget |
| `GEO_RENDER_ENABLED` / `GEO_RENDER_TIMEOUT_MS` | V2 Stage 2 render gate |
| `GEO_PREFLIGHT_PROMPT` | **PARTIAL** — when `on`, prepends preflight signals to Claude prompt; default off |
| `CUSTOMER_SUPPORT_EMAIL` | Reply-to override |
| `FIX_REQUEST_EMAIL` | (legacy — Foundation Fix mailto, now unused after PR #18) |

### 7.4 Stripe webhook risks — **BUILT** (mostly)

- HMAC verification via `getStripe().webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET)`.
- Dedup via `AuditOrder.stripeSessionId` UNIQUE constraint (replays no-op on upsert).
- Always returns 200 to Stripe so failed handlers don't trigger infinite retry loops; failures logged.
- Customer confirmation email fires before admin notification (so "we got your order" lands before "new order ping").
- Webhook is intentionally NOT rate-limited (Stripe retries from shared IPs; a 429 could lock out real payment events).

### 7.5 Resend risks — **RISK** (monitorable)

- No per-FROM rate limiting at app level (relies on Resend account-level limits).
- No per-recipient dedup beyond DB unique constraints (`adminEmailSentAt`, `customerConfirmationSentAt`, `customerFailureNotifiedAt`, `reportSentToCustomerAt` — each is set in an atomic `updateMany` claim before send).
- 5 distinct call sites (see below). Each wrapped in try/catch; failures log + continue, never throw.
- **`FROM_EMAIL` fallback to `geoviz.local`** — production must set `RESEND_EMAIL_FROM` or Resend will reject. The wrapper logs a warning at module-load if running in prod with no FROM set.

Resend call sites (5):

1. `src/app/api/stripe/webhook/route.ts` — order confirmation + admin notification.
2. `src/app/api/foundation-fix/route.ts` — Foundation Fix admin notification.
3. `src/app/api/foundation-fix/route.ts` — Foundation Fix customer confirmation.
4. `src/lib/customer-emails.ts` — customer failure notification (audit failed post-payment).
5. `src/lib/notify-operator-report-ready.ts` — operator "report ready for review" email.

### 7.6 Production readiness gaps

| Gap | Status |
|---|---|
| `recover-stale-jobs.ts` execution schedule undocumented | **RISK** |
| `GEO_PREFLIGHT_PROMPT` decision (flip on or stay off) | **PARTIAL** (decision pending) |
| `HeroForm.tsx` dangling reference | **RISK** (broken pointer, no runtime impact) |
| Legal pages styling | **PARTIAL** |
| `FROM_EMAIL` fallback to placeholder if env not set | **RISK** (warning logged but doesn't fail loudly) |

### 7.7 Operational verification protocol

Per `CLAUDE.md`, Railway CLI is installed + linked. Post-deploy:

- `npx @railway/cli logs` — worker startup + `[geo-worker-version]` + intelligence ingest lines.
- `npx @railway/cli run npx prisma migrate status` — migration health.
- `npm run intelligence:summary` — ingestion populating.
- `npm run intelligence:cost` — cost telemetry reporting.

---

## 8. Technical debt

### 8.1 Code-quality indicators (current)

| Indicator | Count | Notes |
|---|---|---|
| `TODO` / `FIXME` / `XXX` / `HACK` comments | 1 | `src/app/api/report/[id]/pdf/route.ts` — "TODO(rate-limit): This is the most expensive public route…" — already rate-limited; comment is doc-style. |
| `eslint-disable` lines | 15 | All `no-console` waivers for structured-logging prefixes (`[geo-worker]`, `[foundation-fix]`, etc.). Justified. |
| Dynamic `require()` (`@typescript-eslint/no-require-imports`) | 1 | `src/lib/intelligence/render/renderIntelligence.ts` lazy-loads `cheerio`. Justified (tree-shaking). |
| `as any` / `@ts-ignore` / `@ts-expect-error` | 0 | Clean. |
| `console.log` without structured prefix | 0 | Every log line uses a `[name]` prefix. |
| Bare debugging leftovers | 0 | None found. |

### 8.2 Large files (>1000 LOC) — all justified

| File | LOC | Why it's large |
|---|---|---|
| `src/components/CalibrationDashboard.tsx` | 2011 | Internal operator workbench — domain complexity |
| `scripts/generate-visibility-report.ts` (older path) | 1398 | Report generation harness |
| `src/lib/parse-report.ts` | 1347 | Score parsing + 5-of-6 derived fill + canonical reconciliation + section parsers |
| `src/components/AdminReportCard.tsx` | 1281 | Admin queue card with embedded report viewer + PDF preview |

None are obvious refactor candidates; each maps to one bounded
domain concern.

### 8.3 Fragile / monitor-worthy areas

| Area | Status |
|---|---|
| `HeroForm.tsx` referenced in `CLAUDE_DESIGN.md` but no active imports | **RISK** — dangling reference; either re-link or delete. |
| `GEO_PREFLIGHT_PROMPT` default-off | **PARTIAL** — preflight modules + persistence built; prompt augmentation unused. Need calibration probe + cost impact before flipping. |
| `recover-stale-jobs.ts` execution schedule undocumented | **RISK** — script exists; operational verification protocol doesn't say when/how it runs. |
| 31× `rounded-xl` instances vs `CLAUDE_DESIGN.md` ("reserve heavier rounding for special elements") | **PARTIAL** — concentrated in admin/report contexts where density is appropriate; marketing pages mostly use `rounded-md`. Spot-check future additions. |
| `scripts/diagnose-recent-audits.ts` shows as untracked across recent working trees | **RISK** — appears in every `git status` but never committed. Decide: commit it as a tool, add to `.gitignore`, or delete. |
| `prisma/migrations/migration_lock.toml` never committed | **RISK** — Prisma convention is to commit the lock file. Currently untracked; works because the project has only one provider (`postgresql`) but a contributor on a different DB could create chaos. |
| Legal pages styling | **PARTIAL** — see §5.4. |

### 8.4 Unclear scoring / unverified assumptions

- **5-of-6 derived fill behavior** — exhaustively tested (`scripts/test-category-breakdown-no-placeholders.ts`), but the derivation assumes the model's declared overall is trustworthy. The canonical reconciliation path (always preferring `rubricSum` when fully parsed) mitigates this.
- **Calibration v2.2 vs Calibration v2** version drift — the prompt anchors say "Calibration v2", `audit-intelligence.ts` writes `scoringVersion = "Calibration v2.2"`. The `.2` suffix tracks the calibration-recalc projector history but is invisible in the prompt. Not a bug, but a future audit-engine version bump should align both surfaces.
- **Structural Synergy Bonus** — only fires when 5 simultaneous gates hit. Worth re-validating against actual data periodically (per `CLAUDE.md`: "Validate it. Run `npx tsx scripts/calibration-recalc.ts --archetypes` first").

### 8.5 Launch blockers — **None identified**

Every customer-visible flow has a tested happy-path + a tested
failure mode (`test:customer-failure-safety` covers 30 assertions
across status messaging + email idempotency + legacy mapping).
Stripe checkout, webhook, audit generation, intelligence persistence,
operator review, customer delivery are all working.

---

## 9. Strategic summary

### 9.1 What GeoViz is today

A **paid AI Visibility Audit** delivered by email within minutes,
backed by a structured Node-side V2 intelligence layer that's quietly
building cohort data with every audit. The Foundation Fix form is
the manual on-ramp to a productized AI Visibility Layer that hasn't
been built yet but is fully architected for in `CLAUDE.md`.

Per `CLAUDE.md` framing: **the audit is customer acquisition; the
AI Visibility Layer is the platform; monitoring will be the
recurring revenue; telemetry is the moat.**

### 9.2 What's already working — **BUILT**

- End-to-end paid flow: order → Stripe → webhook → worker queue → audit → markdown save → operator review → customer delivery (with PDF).
- Worker pipeline with atomic claim, retry classification, customer-failure-safety, stale-job recovery (script exists).
- Frozen Calibration v2.2 rubric, score parser with 5-of-6 derived fill + canonical-vs-declared reconciliation.
- V2 Stage 1 intelligence ingest (CMS / framework / readability / entities / score provenance) — persisted to every audit.
- V2 Stage 2 render intelligence (real puppeteer + Chromium delta comparison) — gated by `GEO_RENDER_ENABLED`.
- V2 Preflight stage (PR #19) — 4 analyzers, `AuditIntelligence.preflightSignals` JSON column, fail-soft contract.
- Foundation Fix form replaces mailto with structured capture + adminNotes append + Resend admin/customer emails.
- Cost telemetry on every audit (tokens, cost USD, runtime, model used) surfaced in `/admin/reports`.
- Operator calibration intelligence (verdict / confidence / benchmark tag / notes).
- Test coverage: 7 test suites totalling 100+ assertions, plain `tsx` + `node:assert`.

### 9.3 What's partially built — **PARTIAL**

- **Preflight prompt augmentation** — modules persist signals, but `GEO_PREFLIGHT_PROMPT` is off in production. Claude doesn't yet see the validated ground-truth context.
- **AI Visibility Layer** — only the Foundation Fix manual form exists. The productized layer (snippets, CMS plugins, monitoring) is architected in `CLAUDE.md` but not yet coded.
- **Legal pages** — content is correct; visual framing is generic compared to marketing pages.
- **Inline marketing sub-components** — `WhatCard`, `HowItWorksStep`, `MeasureCard`, etc. defined in `page.tsx` rather than extracted under `src/components/marketing/`.

### 9.4 What should wait until V2 — **PLANNED**

Per `CLAUDE.md` Phase 3 + System Architecture "Monitoring & Intelligence Module":

- **Recurring monitoring** — scheduled re-audits + change detection.
- **Competitor comparisons** — head-to-head visibility rankings.
- **Historical trend tracking** — longitudinal score deltas.
- **Benchmark dataset surfacing** — exposing the V2 cohort intelligence (via `AuditIntelligence` JSON columns) to customers as "you're at the 73rd percentile for roofers in your region" style insights.
- **Scoring normalization across cohorts** — needs more data before customer-surfacing.

Per `CLAUDE.md` Phase 4 + "Automation & Action Module (V3)":

- **Schema deployment automation** — agents propose + (with approval) deploy.
- **CMS integrations** — WordPress / Wix / Shopify plugin shape.
- **Automated GEO workflows** — continuous recommendation testing.
- **Site change detection + alerting** — proactive monitoring.

### 9.5 Where the moat is forming

The longitudinal dataset compounding in `AuditIntelligence`:

- **Industry-tagged scores** (`industryCategoryNormalized` × all 7 score columns) — enables cohort percentile claims.
- **Operator calibration verdicts** (`operatorVerdict` × `operatorConfidence` × `benchmarkTag`) — captures human ground truth that lets future scoring versions self-correct against operator memory.
- **Preflight signals** (`preflightSignals` JSON) — Node-side ground-truth checks (schema validation, crawlability, entity consistency) that are reproducible across re-audits, unlike model-generated prose.
- **Render deltas** (`schemaDeltaDetected`, `contentDeltaDetected`, `blankShellRisk`, etc.) — captures the post-JS layer that headless rendering exposes but the model can't see directly.
- **Cost telemetry** (`estimatedCostUsd`, `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`, `modelUsed`, `workerRuntimeMs`) — enables COGS modeling per audit and per cohort.

Every audit silently extends the dataset. Per `CLAUDE.md`: this
becomes the foundational AI-readable layer for local business
websites — defensibility no competitor can replicate from a cold
start.

---

## Prioritized next-action list

A short, ranked list — operator can re-rank. Not a roadmap commitment;
"if you had to pick the next 5 things, here they are."

1. **Decide whether to flip `GEO_PREFLIGHT_PROMPT=on` in production.**
   PARTIAL today. The preflight stage is fully built and persisted;
   the prompt-augmentation flag is off so Claude doesn't see the
   ground-truth signals yet. Validation path: enable in dev, run one
   calibration probe (1 weak + 1 average + 1 strong site), measure
   cost-per-audit delta and score-shift via `npx tsx
   scripts/calibration-recalc.ts --archetypes`. Flip only if score
   shifts stay within ±2 across all three.

2. **Resolve the `HeroForm.tsx` dangling reference.**
   RISK-adjacent. CLAUDE_DESIGN.md lists `HeroForm.tsx` as a
   reusable component, but no current import exists. Two options:
   re-link it on the homepage hero flow (the most likely original
   intent) or delete the file + remove the CLAUDE_DESIGN.md
   reference. ~30 minutes either way.

3. **Document scheduled execution of `scripts/recover-stale-jobs.ts`.**
   RISK. The script exists and is idempotent; the operational
   verification protocol doesn't say when it runs. Either add a
   Railway cron job (every 10 minutes, age-based mode), or document
   the manual trigger in `CLAUDE.md` under Operational Verification.

4. **Visual polish pass on `/privacy`, `/terms`, `/refund-policy`.**
   PARTIAL. Wrap the existing legal prose in the same
   `.section-eyebrow` + dark-premium card pattern the rest of the
   site uses. No content changes. Pure framing — pages stop looking
   "generic" relative to the rest of the product.

5. **Begin scoping the AI Visibility Layer install-pack.**
   PLANNED. Per `CLAUDE.md` "AI Visibility Layer Direction," the
   next concrete deliverable beyond the Foundation Fix form is a
   single-tag JSON-LD injection prototype — the simplest possible
   version of "drop this snippet on your homepage and AI tools see
   you better." Scope a one-week prototype: a templated JSON-LD
   generator (reusing the preflight `schemaValidation` field set)
   that produces a `<script type="application/ld+json">` block
   tailored to the audit's findings, plus a copy-paste install flow.

---

> End of audit. Document generated 2026-05-16 against
> `main` branch state post-PR #19 (preflight intelligence layer)
> and post-PR #20 (CLAUDE.md strategic merge + CLAUDE_DESIGN.md
> stub).
