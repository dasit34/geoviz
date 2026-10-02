# GeoViz — Build Rules

## Product
GeoViz is a service that audits whether businesses are visible and recommended in AI search tools like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews.

Core promise:
“Find out if AI tools recommend your business.”

IMPORTANT:
We are NOT building a full SaaS yet.
We are building a lean MVP that sells paid AI Visibility Reports with manual fulfillment.

## Brand Name
GeoViz

## Tone & Positioning Language

The voice of GeoViz across product, copy, prompt, and code comments
is **intelligence-grade**: evidence-driven, serious, technically
credible, machine-aware. Treat the language list below as binding
across customer-facing surfaces, the worker prompt, internal
comments, and any new docs.

**Prefer:**
- "AI visibility"
- "AI readability"
- "entity clarity"
- "machine-readable trust signals"
- "discoverability confidence"
- "retrieval confidence"
- "recommendation readiness"
- "AI visibility intelligence"
- "entity readiness analysis"
- "machine-readable business infrastructure"

**Avoid:**
- generic startup language ("game-changing", "revolutionary",
  "unlock", "supercharge")
- fake AI hype ("magic", "AI-powered", "instant AI optimization")
- fluffy SEO terminology ("rank higher", "boost rankings",
  "dominate search", "10x your visibility")
- overpromising ("guaranteed", "always works", "every time")

**Never claim:**
- guaranteed rankings
- guaranteed AI recommendations
- guaranteed indexing
- direct platform-query results (e.g., "ChatGPT will say…")

This list complements the existing customer-positioning rules in
`## Positioning (CRITICAL)` below and the worker-prompt defensible-
language block in `scripts/geo-worker.ts`.

## Positioning (CRITICAL)
Do NOT lead with “GEO.”
Do NOT assume users understand AI search.

Always frame as:
- “AI visibility”
- “Being recommended by ChatGPT”
- “Showing up when customers ask AI who to hire”

Primary headline:
“Search is shifting from links to answers. We measure whether AI recommends your business.”

Strap above the headline (intelligence-grade framing beat):
“Visibility is no longer just ranking. It’s interpretation.”

Subhead (names the four-model platform so the specifics still land):
“Modern AI systems like ChatGPT, Claude, Gemini, and Perplexity increasingly shape how customers discover businesses. GeoViz measures how clearly your business can be understood, trusted, and surfaced inside AI-generated answers.”

## Strategic Direction — AI Visibility Infrastructure

The MVP scope (`## MVP Scope (STRICT)` below) is intentionally lean —
audits, manual fulfillment, no dashboards. But every product
decision and every architectural choice should be evaluated against
the longer arc GeoViz is building toward: **AI Visibility
Infrastructure** for local businesses.

**Business-model framing.** The pieces fit together as:
- The **audit** is customer acquisition. Low-friction entry point,
  delivers immediate intelligence value.
- The **AI Visibility Layer** (Foundation Fix evolution — see
  `## AI Visibility Layer Direction` below) is the platform. The
  thing that actually changes a business's machine-readable
  footprint.
- **Monitoring** becomes recurring revenue. Once a business has
  invested in the layer, ongoing visibility tracking + change
  detection becomes a natural subscription.
- **Telemetry** becomes the moat. Cohort data, before/after deltas,
  industry benchmarks, AI-crawler behavior patterns — the
  longitudinal dataset compounds into defensibility no one else has.

**Phase evolution.** The product moves through four phases. Each
phase strictly preserves the previous phase's working surface
(scoring freeze, customer-facing report shape, delivery flow).

| Phase | Focus | Status |
|---|---|---|
| 1 | AI visibility audits — directional reports, reviewed delivery | Current; v1 scoring frozen per `## Scoring Freeze`. |
| 2 | AI Visibility Layer / Foundation Fix delivery | Active development; see `## AI Visibility Layer Direction`. |
| 3 | Monitoring + telemetry — recurring scans, longitudinal tracking, change detection | Architected for in `## Monitoring & Intelligence Module (V2)` of the System Architecture. |
| 4 | AI visibility infrastructure — automated entity optimization, plugin/snippet installs, persistent AI-readable layers | Long-term; see `## Automation & Action Module (V3)`. |

**What this means for engineering decisions.** When a new feature is
proposed, ask: "Does this strengthen the audit, the layer,
monitoring, or telemetry — and does it stay additive across the
phase boundary?" Avoid choices that lock the product into phase 1
shape (e.g., schemas that can only describe one-time audits, UI that
hides recurring data, prompts that fabricate signals that
monitoring can't reproduce).

## Target Customers
Local service businesses:
- roofers
- HVAC companies
- contractors
- lawyers
- dentists
- med spas
- real estate agents

## Core Offer
AI Visibility Audit — $97 (early-customer pricing; normally $147)

User provides:
- website URL
- email
- optional business name
- optional competitor URL

They receive:
- AI Visibility Score (0–100)
- plain-English breakdown
- key visibility issues
- why it matters
- top priority fixes
- professional PDF report

## Upsell
GEO Foundation Fix — $497 (more complex cases quoted upfront)

Includes:
- schema implementation or repair
- llms.txt creation
- robots.txt optimization for AI crawlers
- homepage clarity improvements
- service page clarity improvements
- FAQ structure for AI readability
- before/after comparison

## AI Visibility Layer Direction

The Foundation Fix is the on-ramp to a broader **AI Visibility
Layer** product — a lightweight machine-readable infrastructure
layer that businesses install once and benefit from across every AI
retrieval system. The Fix delivers it manually today; the platform
direction is to make that layer reproducible, monitorable, and
incrementally automatable.

**Capability evolution** (current → near → longer):
- **Schema generation**: today, hand-crafted JSON-LD per business.
  Near: templated generators per business archetype + entity-field
  validation (already shipped — see preflight `schemaValidation`).
  Longer: schema served dynamically from a small AI-readable
  snippet the customer drops in.
- **llms.txt generation**: today, hand-crafted. Near: a templated
  generator using audit findings + business profile. Longer:
  auto-regenerates when the customer's services/locations change.
- **AI-readable business blocks**: lightweight machine-readable
  context (services, service area, hours, trust signals)
  pre-formatted for AI retrieval. Designed to coexist with — not
  replace — the customer's existing site.
- **Script / snippet installs**: a single tag the customer drops
  in to bring the AI-readable layer onto their site. Mirrors the
  installation pattern of analytics tags / Hotjar / similar.
- **CMS plugins**: WordPress / Wix / Shopify plugins that drop
  the layer in without a code change. Aligns with the most common
  installations seen in V2 intelligence's `cmsDetected` field.
- **Discoverability monitoring**: scheduled re-audits + change
  detection on the AI-readable layer. The natural recurring-revenue
  unit. Architected for in `## Monitoring & Intelligence Module
  (V2)`.
- **Automated entity optimization**: V3 territory — agents that
  propose + (with approval) deploy changes to the layer based on
  monitoring deltas. See `## Automation & Action Module (V3)`.

**Recurring product — "AI Visibility Monitoring" (APPROVED
2026-09-29, building in stages).** The operator explicitly approved
repositioning GeoViz around the lifecycle **Baseline Audit → Identify
Gaps → Recommend/Fix → Recheck → Track Improvement → Repeat
Monthly**. The staged plan (Stage 0 integrity fixes → schema +
enrollment → organic prompt panel → frozen scans + diff + action plan
→ operator-triggered recheck → customer status page → scheduler →
incorrect-info detection → Stripe subscription) is the source of
truth; build one stage at a time, each additive and feature-flagged.
Binding rules for monitoring work:
- The **$97 audit + $59 re-audit checkout, webhook, worker loop,
  scoring, and report rendering keep working unchanged** at every
  stage. Subscription billing ships last, as an additive Stripe
  branch that never touches the one-time payment path.
- The customer view is a **tokenized, no-login status page**
  (same access model as `/report/[id]/print`, with its own rotatable
  token) — NOT a login system or a general SaaS dashboard.
- Historical scans are **immutable** once finalized; deterministic
  measurements and LLM-written explanations are stored separately.
- Provider failures are recorded as "not measured", never as a
  0 score or a "not mentioned".
- Monitoring copy names the model + access path ("OpenAI
  gpt-4.1-mini via API, web-grounded") — never "ChatGPT says".
The report's "Questions Customers Ask AI" section (buyer-intent
questions per business — generated, not yet sent to models) and the
"Evidence AI Can Cite" concept become monitored features here.

**Subscription-monitoring architecture (first slice, `src/lib/monitoring/`,
behind `GEO_MODULE_MONITORING_ENABLED`, off in Production):**
- **Plans** (`plans.ts`): catalog keys → Stripe recurring price via env
  (`STRIPE_MONITORING_MONTHLY_PRICE_ID`, cadence 30 days). Amounts are
  read from Stripe at render time — never hardcoded.
- **Checkout** (`POST /api/checkout/monitoring`, `checkout.ts`): Stripe
  `mode: "subscription"`; metadata (`geoviz_product: "monitoring"`,
  plan, site, email) on the session AND `subscription_data`.
- **Webhook** (`webhook.ts`, branch at the top of
  `/api/stripe/webhook`): claims subscription-mode checkouts and
  `customer.subscription.*` BEFORE the one-time path. Idempotent via the
  `StripeWebhookEvent` ledger + re-reading the subscription from Stripe
  on every event (`subscription-sync.ts`), so order doesn't matter;
  failures return 500 so Stripe retries. One-time `$97`/`$59` checkout
  handling is unchanged.
- **Access** (`access.ts`): derived from Stripe status — `active` /
  `trialing` schedule audits; cancel-at-period-end schedules only inside
  the paid period; everything else pauses. Status page + past reports
  stay available in every state.
- **Scheduling** (`scheduler.ts`, `npm run monitoring:scheduler` on a
  Railway cron): due subscriptions get an ordinary queued `AuditOrder`
  (`orderType "MONITORING_RECHECK"`, amount 0, `monitoringSubscriptionId`,
  `previousAuditOrderId` chained) — the existing worker, review queue,
  report pages, verification page, and customer emails handle it.
  Deterministic `stripeSessionId` per (subscription, due date) makes
  scheduling idempotent; in-flight audits block pile-ups; max 3/tick.
- **Customer surface**: `/monitoring` (plans), `/monitoring/success`,
  `/monitoring/<token>` (status, next audit, latest/previous score and
  change from **reviewed** audits only, report links, Stripe billing
  portal via `POST /api/monitoring/portal`). No login.
- **Visibility tracking v1** (`src/lib/monitoring/tracking/`, same flag):
  durable tracked questions (`TrackedPrompt`, suggested from the audit's
  detected city/services via `buildCustomerQuestions`, or custom),
  tracked competitors (`TrackedCompetitor`, customer-entered or promoted
  from AI answers), and per-cycle runs (`MonitoringCycle` →
  `PromptRunResult`, **one row per question × AI system × sample**).
  - **Organic questions** (prompt `tracking-prompt@2.0.0`): sent exactly as
    a customer would type them — no system prompt, no evidence, no score,
    no business name, no output-format instructions — to the existing
    pinned validator models via their APIs, web-grounded where available.
    The raw provider response (text, native citations, search queries,
    usage, ids) is stored before normalization. API answers ≠ the consumer
    ChatGPT / Claude / Gemini / Perplexity apps; copy must say so.
  - **Repeated measurement:** `samplesPerPrompt` per plan (Early Access 2).
    Rates use successfully measured samples only and always show sample
    count + coverage; failures are `not_measured`, never 0.
  - **Position** only from a clear numbered recommendation list
    (`list-extractor.ts`); otherwise `no_ordered_list` / `not_in_list`
    with position null — never inferred from prose order, never 0.
  - **Comparisons** pair (question, AI system) only when the
    configuration fingerprint (prompt version, model, search settings,
    extractor/detector versions) matches; otherwise "not comparable" with
    the reason.
  - **Provider-call states:** pending → in_flight (written before the
    paid request) → completed | failed (known) | unknown (may have been
    billed: crash, timeout, dropped connection). **Guarantee: at most one
    automatic provider request per sample — NOT exactly-once billing.**
    Stale pending → re-called (nothing was sent); stale in_flight →
    retrieved by request id where supported (OpenAI Responses background
    mode) else marked `unknown`; unknown is never auto-retried — cycle
    goes `needs_review`, listed at `/admin/monitoring-cycles`, re-issued
    only via `monitoring:run-cycle --retry-unknown
    --confirm-possible-duplicate-charge`. Finished cycles rerun with 0
    calls. Anthropic, Gemini, Perplexity offer no idempotency/retrieval.
  - **Cost** per sample (`pricing.ts`, rates verified 2026-10-02):
    provider-reported where available (Perplexity), else estimated from
    usage; Gemini grounding is charged at the paid rate (conservative).
    Measured on staging: ~$0.33 per 16-sample cycle → ~$1.64 per Early
    Access cycle (10 questions × 4 AI systems × 2 samples = 80 calls).
  - **Competitor scope:** measures competitors' presence in AI answers
    only. Competitor *websites* are covered by website change tracking
    (below), only for competitors with a confirmed website.
  - Tracking metrics are separate from the GeoViz audit score and never
    feed it. Tracking is NOT stored in `Observation` (that table requires
    an audit order per row).
- **Entitlements** (`plans.ts` → `PlanEntitlements`): feature code reads
  only these numbers. Monthly (Early Access): 1 scheduled full re-audit
  per billing cycle, historical score tracking, 10 active tracked
  questions, 3 competitors, citation tracking, report history, providers
  claude/openai/gemini/perplexity, 2 samples per question per AI system.
  A new plan = a new catalog entry.
- **$59 manual re-audit vs. monthly monitoring.** The $59 re-audit is a
  separate one-time purchase (`/re-audit`, `STRIPE_REAUDIT_PRICE_ID`,
  `orderType "RE_AUDIT"`, needs an approved prior report) and is
  unchanged. Monthly monitoring is a subscription that schedules its own
  re-audits (`"MONITORING_RECHECK"`) plus question tracking. Neither
  replaces the other; `test-monitoring-token-and-reaudit` pins this.
- **Staging tools:** `npm run seed:monitoring-staging`,
  `npm run monitoring:run-cycle -- --subscription <id>` (both refuse
  production — strict DB guard, no override).
- **Released state (2026-10-02):** all of the above is merged to `main`
  and deployed (tables live, empty) but **behind the flag and OFF in
  Production** — no monitoring price, no scheduler cron, flag unset.
- **Remaining launch steps (in order):** create the recurring Stripe
  price + set `STRIPE_MONITORING_MONTHLY_PRICE_ID`; add
  `customer.subscription.*` to the production webhook; configure the
  Stripe Customer Portal; create the Railway scheduler cron
  (`monitoring:scheduler`, worker env incl. all 4 provider keys); once #48
  (and #49) are merged, also create the `monitoring:website-scans` cron
  (website scans + improvement checks); run a Stripe test-mode end-to-end
  on Preview; complete the two deferred smoke checks; then enable the flag
  in Production.
- **Website snapshots + change detection v1** (`src/lib/monitoring/website/`,
  same flag; branch `feat/website-change-tracking-v1`, PR #48, NOT merged): bounded,
  immutable snapshots of the customer's site + up to `maxCompetitorSites`
  competitors with a **confirmed** website (`TrackedCompetitor.domainConfirmedAt`,
  set only when the customer/operator supplies the URL — never inferred
  from a name; AI-detected competitors show "Add website").
  - **Safe fetch** (`safe-fetch.ts`): http/https on 80/443 only, no URL
    credentials, every DNS answer validated at connect time (blocks
    loopback/private/link-local/CGNAT/multicast/reserved, IPv6
    ULA/link-local, IPv4-mapped + NAT64 — anti-rebinding), manual
    same-site redirects (max 3, each hop re-validated), 10 s timeout,
    2 MB cap, fixed UA `GeoVizSiteScanner/1.0`. 401/403 = `access_denied`,
    never retried or bypassed.
  - **robots.txt** (`robots.ts`, RFC 9309): our group else `*`, longest
    match, `*`/`$`; 4xx → no restrictions; 5xx/network → the site is not
    scanned this time. Crawl-delay honored (min 500 ms, cap 5 s).
  - **Discovery** (`discover.ts`): homepage + same-site about/service/
    location links + sitemap (one index level, ≤ `maxSitemapUrlsRead`
    locs), ≤ `maxPagesPerSite`; previously captured pages are re-checked,
    with slots reserved for new pages.
  - **Extraction** (`extract.ts`, `SCANNER_VERSION`): title, description,
    canonical, h1–h3, noise-filtered content blocks (nav/header/footer/
    aside/forms/cookie banners removed; dates, times, copyright years,
    "x days ago" normalized out of the fingerprint), JSON-LD types +
    LocalBusiness fields (reuses preflight `validateSchema` /
    `checkEntityConsistency`), heuristic services/locations.
  - **Diff** (`diff.ts`, `DIFF_VERSION`): first scan = "Baseline
    recorded"; scanner MAJOR change = "Baseline re-recorded"; removed
    only on a direct-re-check 404/410 (timeouts/5xx/blocked = "couldn't
    check", never removed); added only when discovery worked in both
    scans; title/description/headings/schema/services/locations/identity
    (homepage) changes; material content = 5-word-shingle Jaccard < 0.85
    AND ≥ 200 changed chars. Before/after excerpts ≤ 300 chars + dates.
  - **Jobs** (`scan-job.ts`, `prisma-store.ts`): scheduler only ENQUEUES
    (`WebsiteScan`, unique per subscription/cycleKey/site; failures caught →
    `websiteErrors`, never blocking re-audits or tracking).
    `npm run monitoring:website-scans` (Railway cron, production runtime,
    flag-gated, unguarded) claims atomically, retries transient failures
    with backoff (10 min / 1 h / 6 h, max 3 attempts), re-queues stale
    running scans (30 min). Site rules (robots disallow, 401/403) are
    terminal. Snapshots + changes + scan status are written in one
    transaction and never updated.
  - **Entitlements:** `websiteTracking { enabled, maxPagesPerSite: 12,
    maxSitemapUrlsRead: 200, maxCompetitorSites: 3 }` (Early Access).
  - **Cost:** no paid APIs; `costUsd = 0` recorded with requests, bytes,
    duration per scan.
  - **Dashboard:** "Website Changes" tab — per-site cards (your website /
    competitor), changes with source URL + before/after excerpts + dates,
    "Couldn't check" list, timeline interleaving website changes with AI
    tracking runs under fixed no-causation copy. Website findings
    (lost LocalBusiness schema, confirmed removed page, identity change,
    competitor topic you don't cover — framed as an opportunity) feed
    Recommended Actions. No auto-edits, no alerts.
  - **Fixture data:** `isFixture = true` rows (staging demo,
    `scripts/monitoring-website-fixture.ts`, fake `fixture-hvac.example`
    served from memory) are badged "FIXTURE (demonstration data)", shown
    in a separate section, and never feed recommendations.
  - **Staging tools:** `npm run monitoring:scan-sites -- --subscription <id>
    [--confirm-competitor "Name=domain"]` (strictly guarded).
  - **Limits:** raw HTML only (no JS rendering — client-rendered or
    one-page sites capture little); services/locations are heuristic.
- **Supervised improvement workflows v1** (`src/lib/monitoring/improvements/`,
  same flag; branch `feat/supervised-improvements-v1`, PR #49 **stacked on
  #48**, NOT merged). Turns findings into supervised tasks; nothing edits,
  publishes to, or emails anyone.
  - **Tasks** (`ImprovementTask`): created from a recommendation id by the
    customer (status page) or operator — recommendations are recomputed
    server-side, never trusted from the client. One open task per finding
    (`openKey` unique while open); a recurring finding adds evidence +
    `occurrences`; after Verified a recurrence opens a new task; a
    Dismissed finding isn't re-created unless observed after dismissal.
    Each task: problem, evidence (text/URL/date), page URL, priority +
    reason, proposed fix, owner, dates, verification method, history
    (`ImprovementEvent`, append-only).
  - **Statuses** (`workflow.ts`): Suggested → Approved → In Progress →
    Implemented → Verified, or Dismissed (restorable). **Implemented** is a
    customer/operator claim. **Verified** only by an independent check:
    the website scanner, or — only for kinds the scanner can't check
    (citation, general) — an operator with an https evidence URL + note.
    Customers can never set Verified.
  - **Facts** (`BusinessFactSheet`, immutable versions): drafts use ONLY
    confirmed facts. Website-observed values are offered as "found on
    your website — confirm", never used directly.
  - **Drafts** (`drafts.ts`, `improvement-drafts@1.0.0`, deterministic
    templates, no LLM, immutable versions in `ImprovementDraft`): LocalBusiness
    JSON-LD, title/description suggestions (≤ 60 / ≤ 155), service/location
    page outline (only for a CONFIRMED service/area), FAQ (tracked
    questions + `buildCustomerQuestions`, answers left as writing prompts),
    identity checklist (confirmed vs observed), citation checklist (only
    domains observed in tracked answers), restore-page steps. Missing facts
    → `[MISSING: …]` + a "Needs from you" list. **Never** invents
    addresses, credentials, reviews, services, or locations.
  - **Untrusted input** (`sanitize.ts`): fetched website text is stripped of
    markup/control characters, length-capped, shown only as a quoted
    excerpt, and never placed in JSON-LD values; JSON-LD is serialized with
    `<`/`>`/`&` escaped; drafts download as `text/plain` attachments
    (`nosniff`). Implementation URLs must be on the customer's own site.
  - **Verification** (`verify.ts`, `expectations.ts`, `ImprovementVerification`
    jobs): queued when a scanner-checkable task is marked Implemented; one
    robots.txt + one page fetch through the SSRF-safe fetcher; outcomes
    **Verified** / **Change not found yet** (fetched, change absent — task
    stays Implemented) / **Already on your site before this task** /
    **Could not verify** (403, robots-blocked, unreachable after 3 attempts
    with backoff). **FAQ and new-page checks look only for the PROPOSED
    content** (drafted questions as a heading or question-sized block, ≥ 85%
    of significant words; page keyword in title/headings) — unrelated FAQ
    markup never counts — and compare it with a **baseline frozen when the
    check is queued**: the latest successful scan completed before
    `implementedAt`. New vs. baseline → Verified ("newly observed"); all
    already in baseline → `already_present`; none → "Proposed content not
    found"; no baseline, or the page existed but wasn't captured → Could not
    verify (never verified without a baseline). Operators can revoke a wrong
    verification (`verified → implemented`, note required) and re-queue. Shows expected, observed,
    URL, timestamp, plus "a change on your page doesn't mean it's
    indexed". Runs inside `npm run monitoring:website-scans`; fixture checks
    are never claimed by that runner.
  - **Before/after** (`impact.ts`): last completed tracking run before the
    implementation date vs. first after; deltas only across
    configuration-compatible pairs; coverage shown; "Awaiting next
    measurement" until a later run exists; fixed disclaimer that this
    doesn't show the change caused anything.
  - **Surfaces:** Improvements tab (facts, To do, Implemented — being
    checked, Verified, findings → "Create task", Dismissed) and "Create
    improvement task" on Recommended Actions; `POST
    /api/monitoring/improvements`, `GET /api/monitoring/improvements/draft`
    (token-scoped; writes need an active subscription); operator review at
    `/admin/improvements` + `POST /api/admin/improvements` (admin session
    or `ADMIN_SECRET`).
  - **Staging tool:** `scripts/monitoring-improvements-staging.ts
    --subscription <id> [--confirm-facts json] [--create <recId>]
    [--implement <taskId> --url <page>] [--run-checks] [--fixture-demo]`
    (strictly guarded).
  - **Limits:** template copy, not tailored writing; raw-HTML checks only;
    citation/listing checks are manual; before/after is correlation only.
- **Not built yet:** alerts, JS-rendered snapshots/verification,
  automated fixes, CMS publishing.

**What this is NOT.** The AI Visibility Layer is **not** an attempt
to rebuild customer websites. We are not a CMS. We are not a site
builder. We're a thin, focused, machine-readable context layer that
sits alongside whatever the customer already has. Keep proposals
that drift into "rewrite the customer's homepage" territory out of
scope.

## MVP Scope (STRICT)
Build ONLY:

- Landing page
- Order form
- Stripe checkout
- Success / cancel pages
- Sample report page
- Simple admin page
- Order database
- Email notification

DO NOT BUILD:
- dashboards (exception: the approved tokenized, no-login monitoring
  status page — see "Recurring product — AI Visibility Monitoring")
- login systems
- white-label features
- automation pipelines (exception: the approved monitoring recheck
  scheduler, operator review stays mandatory)
- subscription billing (exception: monitoring subscriptions, the
  final monitoring stage, additive to the one-time checkout)
- agency portals
- lead scraping systems

Manual fulfillment is allowed and expected.

## Fulfillment Flow
1. User pays
2. Order is saved
3. Admin is notified
4. Admin manually runs GEO audit tool
5. Report is sent to customer

## Tech Stack
- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Prisma
- PostgreSQL
- Stripe
- Resend
- Vercel deployment

Do not introduce unnecessary libraries.

## Intelligence Layer Vocabulary

GeoViz analyzes a fixed set of dimensions across every audit. Use
these names consistently in code, comments, prompts, and copy so
queries / log greps / report parsers stay coherent.

**Audit dimensions (the 6-category v1 rubric — frozen, see
`## Scoring Freeze`):**
- Schema / Structured Data
- AI Crawler Readiness
- Local Trust Signals
- Content Depth + FAQ Quality
- Brand / Entity Clarity
- Technical Accessibility

**Cross-cutting analysis themes** that show up in customer-facing
prose, intelligence telemetry, and product copy:
- **AI readability** — how easily an AI system can interpret the
  site's content (cleaned text density, semantic structure).
- **Schema / entity structure** — JSON-LD coverage of the
  LocalBusiness-family entity fields (name, address, telephone,
  url, geo, openingHours).
- **Crawlability** — robots.txt, sitemap.xml, meta-robots,
  canonical chain. Whether AI crawlers can actually reach the
  business.
- **Entity consistency** — alignment of name / phone / address
  across schema, homepage prose, and footer.
- **Technical accessibility** — page weight, JS hydration shape,
  blank-shell risk (see V2 Stage 2 render intelligence).
- **Recommendation readiness** — content depth + FAQ + service
  clarity that determines whether an AI system has enough signal
  to *name* the business when a customer asks.
- **Discoverability signals** — the consolidated read across
  schema + trust + crawl + content.
- **Content clarity** — plain-English readability of customer-
  answering content; how well an AI can quote the business when
  answering "who should I hire?" queries.

**Where preflight intelligence persists.** The Node-side V2
preflight stage (added in PR #19) persists structured outputs from
four analyzers — `extractReadableContent`, `validateSchema`,
`auditCrawlability`, `checkEntityConsistency` — to
`AuditIntelligence.preflightSignals` (Json). Detailed shape: see
`src/lib/intelligence/preflight/types.ts`.

## Required Pages
- `/` (landing page)
- `/order`
- `/checkout/success`
- `/checkout/cancel`
- `/sample-report`
- `/admin`

## Admin Requirements
Simple password-protected page using `ADMIN_PASSWORD`.

Display:
- website URL
- email
- payment status
- audit status
- created date
- notes (optional)

## Design Direction
- Dark premium UI
- Clean and serious
- No gimmicks
- Accent color: orange or electric blue
- Mobile responsive
- Looks like a real audit/analysis product
- Intelligence-grade presentation, restrained animations
- Reusable components, modular sections

**Avoid:**
- generic SaaS UI aesthetics
- excessive gradients
- `rounded-xl` on every container
- dashboard clutter
- startup illustration / mascot aesthetics

See `CLAUDE_DESIGN.md` for the visual source of truth (visual
identity, avoid-list, and concrete implementation pointers into
Tailwind config + report print CSS).

For any Figma-driven UI work, the design-system rules (Figma MCP
flow, token mapping, component conventions, brand/scope guardrails)
are in `.claude/rules/figma-design-system.md`:

@.claude/rules/figma-design-system.md

## Conversion Rule
Every section must reinforce:

“I might be invisible when customers ask AI who to hire.”

## Engineering Rules
- TypeScript only
- App Router only
- Clean file structure
- Add `.env.example`
- Include README setup steps
- No skipped error handling
- No fake data in final output
- Code must run

**Prefer:**
- incremental improvements over rewrites
- additive systems (new modules, nullable columns) over edits to
  load-bearing surfaces
- modular architecture (see `## GeoViz System Architecture
  Principles` for the 7-module breakdown)
- graceful fallbacks (fail-soft contracts; logged warnings instead
  of customer-visible errors)
- typed interfaces — every module boundary has an explicit type
- conservative migrations (nullable columns, no destructive ALTERs)

**Avoid:**
- overengineering / premature abstractions
- giant rewrites
- touching unrelated systems while shipping a focused change
- premature microservices
- breaking customer-facing reliability — Stripe checkout, Stripe
  webhook handling, Resend delivery, and the report-generation
  worker loop are load-bearing. Verify them against
  `## Operational Verification (post-deploy)` before merging
  changes that touch their code paths.

## Critical Constraint
Do NOT overbuild.

This MVP exists for one goal:
→ get first 5 paying customers

Everything else is secondary.

## GeoViz Scoring Constitution (LOCKED)

Status: ACTIVE
Last Updated: 2026-05

### Product Identity
GeoViz is an AI Visibility Intelligence platform.

GeoViz measures whether a business can be:
- Understood
- Retrieved
- Trusted
- Cited
- Recommended

GeoViz is NOT:
- Traditional SEO
- Rank prediction
- Search position estimation
- AI ranking guarantees

---

### Canonical Score Rule

There is ONE canonical GeoViz score.

Source:
Deterministic evidence only.

Pipeline:
Collect → Analyze → Score → Narrate

Allowed inputs:
- Crawlability
- Structured data quality
- Trust signals
- Content depth
- Recommendation readiness
- AI readability
- Entity consistency
- Machine-readable identity

Forbidden:
- LLM-generated scores
- Averaging model outputs
- Silent score mutation
- Model-only judgments

Same input data MUST produce the same score.

---

### Validator Layer (LLMs)

Providers:
- OpenAI
- Claude
- Gemini
- Perplexity (optional)

LLMs are validators.
LLMs are NOT score authors.

Validators may:
- Interpret evidence
- Estimate confidence
- Detect missing facts
- Generate summaries
- Surface disagreement
- Provide citations

Validators may NOT:
- Change canonical score
- Override deterministic results
- Invent metrics

---

### Consensus / Confidence Layer

Purpose:
Measure agreement between models.

Output:
GeoViz Confidence Index (secondary metric)

Rules:
- Never replace GeoViz score
- Never average scores
- Display only when N >= 2 providers
- Fail-soft on timeout
- Missing providers do not break audits

Store:
aiValidations[]
consensusIndex{}

---

### Report Rules

Customer sees:
1. GeoViz Score (primary)
2. Confidence Layer (secondary)
3. Supporting evidence

Section 04:
Cross-Model Intelligence

Do NOT redesign Sections 01–06 until after launch.

---

### Score / Consensus Naming Rules

- GeoViz Score = outcome score
- AI Visibility Consensus = interpretation consistency across models
- Never show competing primary scores

---

### Engineering Rules

No silent rescoring.
Keep audit snapshots.
Replay old audits deterministically.
Telemetry is retained.
Report output must remain explainable.

Score changes require explicit versioning.

---

### Audit Intelligence & Telemetry Rules

- Validator outputs are historical intelligence assets and must remain queryable for future calibration.
- Consensus data may be used for benchmarking, telemetry, calibration, and replay analysis.
- Historical audit outputs must remain reproducible.
- Consensus computations must be versioned.
- Future scoring upgrades must never silently rewrite historical reports.
- New intelligence layers must be additive and feature-flagged before rollout.
- Cross-model disagreement is a diagnostic signal, not automatically an error condition.
- Customer-facing labels may evolve, but underlying historical telemetry must remain preserved.

## Scoring Freeze (v1 — DO NOT silently change)

**The GEO scoring rubric is frozen for v1.** As of `2c0d762`
(Calibration v2.2), the rubric has been calibrated through three
iterations against real audit data and the score distribution is
believable: weak sites land below 40, average sites 40–60, strong
sites 65–80, elite sites occasionally 80+. Don't quietly tune any
of it.

**Frozen surfaces — never modify without an explicit instruction:**
- The six category weights (Schema 25, Crawler 20, Trust 20,
  Content 15, Brand 10, Tech 10).
- The five score bands (Invisible / At Risk / Needs Work /
  Competitive / AI-Ready) and their thresholds (0–25 / 26–45 /
  46–65 / 66–80 / 81–100).
- The ladder anchors per category in `scripts/geo-worker.ts`
  (the `Calibration v2 — explicit ladder anchors` block in both
  fast and full prompts).
- The Structural Synergy Bonus rule in the Schema category
  (gated on Content ≥ 12, Brand ≥ 8, Tech ≥ 7, Crawler ≥ 15
  AND at least one machine-readable signal).
- The score-bands mandate, calibration targets, and per-category
  "why this score" reasoning requirement in section 1 of the
  audit output.
- The worker queue / atomic claim / poll loop in
  `scripts/geo-worker.ts`.
- The score parsers in `src/lib/parse-report.ts`
  (`parseReportScoreBreakdown`, `bandLabelForOverall`,
  `scoreToneFromOverall`).
- The calibration projector math in
  `scripts/calibration-recalc.ts`.

**Where to put energy instead.** Future improvements should focus on:
- Report clarity (severity badges, fix-priority labels, scannable
  cards, CTA polish).
- Remediation quality (the prose under "What To Fix First" — make
  it more concrete and actionable, but don't change what triggers
  a fix).
- PDF polish (typography, layout, page breaks — the visual
  surface, not the underlying scoring).
- Customer delivery (email subject / body, attachment handling,
  redirect flow).
- Sales flow (landing page, order form, checkout success, the
  $497 Foundation Fix CTA).

**If a scoring change is genuinely needed:**
1. **Isolate it.** One category, one rule, or one bonus — never a
   simultaneous multi-category rebalance.
2. **Name it.** Use a versioned label: `Calibration v2.3`,
   `v3.0`, etc. Document what changed in the commit message.
3. **Validate it.** Run `npx tsx scripts/calibration-recalc.ts
   --archetypes` first to project the change against the
   7-archetype set, then queue a small probe batch
   (1 weak + 1 average + 1 strong site) at `/admin/calibration`
   to confirm the projected shift is real before re-running the
   full dataset.
4. **Preserve credibility.** Weak sites must stay below 40, and
   AI-Ready must remain rare. Never apply flat boosts to all
   categories; never widen the band by inflating the floor.

The shortest version: **scoring is done for v1**. Don't touch
unless explicitly asked, and even then, isolate / name / validate.

## GEO Audit Engine (geo-seo-claude)

Audit fulfillment uses the `geo-seo-claude` Claude Code skill installed at `~/.claude/skills/geo/`. There is **no standalone Python CLI** — the audit is orchestrated by the `geo-audit` skill via WebFetch + sub-agents. We always invoke it through the wrapper script, never inline.

### Exact audit command

```bash
scripts/run-geo-audit.sh <URL> [COMPETITOR_URL]
```

Example:

```bash
scripts/run-geo-audit.sh https://ricksaffordableheating.com > tmp/geo-audit-test-ricks.md
```

The wrapper invokes:

```bash
claude -p '<prompt>' --output-format text --allowedTools WebFetch WebSearch Read Grep Glob Write Bash
```

passing the prompt via stdin so long URLs / competitor strings can't trip shell quoting.

### Prerequisites (verified by the wrapper)

- `claude` CLI v2.x on PATH (`command -v claude`)
- `~/.claude/skills/geo/SKILL.md` exists (run `vendor/geo-seo-claude/install.sh` if missing)
- `~/.claude/skills/geo/.venv/bin/python3` exists (Python 3.10+ required for the bundled deps; if `install.sh` provisions a 3.9 venv, recreate with `python3.11 -m venv ~/.claude/skills/geo/.venv`)
- `ANTHROPIC_API_KEY` in env, or the host is logged in via `claude login`

### Wrapper exit codes

- `0` — markdown written to stdout
- `1` — bad usage (no URL)
- `2` — prerequisite missing (claude CLI / SKILL.md / venv)
- `3` — `claude -p` exited non-zero

### Programmatic invocation

`src/lib/run-geo-audit.ts` spawns the wrapper from Node. The admin route `POST /api/admin/orders/[id]/run-geo-audit` calls it with a 5-minute timeout and persists the markdown to `AuditOrder.reportMarkdown`.

### Troubleshooting

- **Empty / instant return when running `claude -p` directly without the wrapper** — the skill's WebFetch and WebSearch were blocked by the permission gate. Always go through `scripts/run-geo-audit.sh`, which passes `--allowedTools` so headless runs aren't gated.
- **`Pillow` install failure during `install.sh`** — bundled `requirements.txt` needs Python 3.10+. The macOS system Python 3.9 will fail. Recreate the venv with Homebrew Python 3.11: `rm -rf ~/.claude/skills/geo/.venv && /opt/homebrew/bin/python3.11 -m venv ~/.claude/skills/geo/.venv && ~/.claude/skills/geo/.venv/bin/python3 -m pip install -r vendor/geo-seo-claude/requirements.txt`.
- **`claude -p` returns text but no markdown report** — the geo skill's sub-agents may be running. Bump the wrapper timeout via the `timeoutMs` option in `runGeoAudit` (default 5 min) or rerun. The full audit typically takes 1–3 minutes.
- **Sandboxed CLI sessions block the spawn** — the Claude Code CLI sandbox blocks recursive `claude -p` invocations of skills that fetch from external GitHub repos. This affects automated test runs from a CLI session but not the admin API route running under `npm run dev`.

## Database Safety (fail-closed)

Local `.env` has historically pointed at the PRODUCTION database. Never
run anything that writes to `DATABASE_URL` unless it is positively
non-production. Enforced in code:

- `src/lib/safety/database-target.ts` classifies `DATABASE_URL`: allowed
  only when unset, the `.invalid` no-database sentinel, loopback, or listed
  in `GEOVIZ_NONPROD_DB_HOSTS`. Unknown remote hosts, hosts in
  `GEOVIZ_PRODUCTION_DB_HOSTS`, and production context
  (`RAILWAY_ENVIRONMENT_NAME=production` from `railway run`,
  `VERCEL_ENV=production`) are refused.
- Every `scripts/test-*.ts`, the report-quality runner, and observation
  test/simulate scripts import `scripts/lib/require-nonprod-db` first — no
  override.
- Seed, replay, backfill, repair, stale-job recovery, and calibration
  batch scripts import `scripts/lib/require-nonprod-db-or-break-glass` —
  a deliberate production run needs `GEOVIZ_ALLOW_PRODUCTION_DB=<exact
  script name>`.
- `npm run dev`, `db:push`, `db:studio` are gated by npm pre-hooks.
- `npm run build` runs `scripts/guard-build-database.ts` before
  `prisma migrate deploy`: only Vercel production builds may migrate
  production; previews/local builds need a non-production target.
- Run DB-free tests with `npm run test:no-db` (forces the sentinel URL).
- Intentionally NOT guarded (production runtime / read-only ops):
  `geo-worker` (Railway runs `geo-worker:dev`),
  `daily-market-study-automation`, `recover-missing-checkout-order`,
  `verify-system`, `intelligence:*`, `diagnose:*`, `benchmark:*`,
  `score:validate`, `score:premigration-check`, `monitoring:scheduler`,
  `monitoring:website-scans` (Railway crons, production runtime; the
  latter also runs improvement verifications).
  `monitoring:run-cycle`, `monitoring:scan-sites`,
  `scripts/monitoring-website-fixture.ts`,
  `scripts/monitoring-improvements-staging.ts`, and
  `seed:monitoring-staging` ARE strictly guarded (staging only).

## Infrastructure State (as of 2026-10-02)

- **Environments.** Production: Vercel `geoviz` (Production scope) +
  Railway project `refreshing-love` (`geoviz` worker + Postgres,
  `swi***.proxy.rlwy.net`). Staging: Railway project
  `clever-motivation` (Postgres only, public TCP proxy
  `iri***.proxy.rlwy.net`) used by **Vercel Preview** —
  `DATABASE_URL`, `GEOVIZ_NONPROD_DB_HOSTS`, `GEOVIZ_APPROVED_DB_HOSTS`
  are Preview-scoped; Production's `DATABASE_URL` is Production-only.
  Preview builds can never migrate or read production.
- **Merged:** #42 (pre-monitoring snapshot), #43 (Monitoring Stage 0
  integrity fixes), #44 (fail-closed DB guard), #45 (subscription
  monitoring slice, merge `0720077`), #46 (visibility tracking v1 +
  reliability, merge `4e7a322`), #47 (release docs, `afb29ce`).
  **Open, not merged:** #48 website change tracking v1 (migration
  `20261002200000`), #49 supervised improvements v1 stacked on #48
  (migration `20261003100000`) — both applied to staging only.
  Production healthy after each merge; the build
  guard allows only `VERCEL_ENV=production` builds to migrate production
  (`autoExposeSystemEnvs` is on).
- **Production schema:** 37 migrations. Monitoring tables
  (`MonitoringSubscription`, `StripeWebhookEvent`) and tracking tables
  (`TrackedPrompt`, `TrackedCompetitor`, `MonitoringCycle`,
  `PromptRunResult`) exist and are **empty**. **Monitoring is OFF in
  Production**: `GEO_MODULE_MONITORING_ENABLED` and
  `STRIPE_MONITORING_MONTHLY_PRICE_ID` unset (Vercel Production + Railway),
  no scheduler cron, `/monitoring*` routes 404.
- **Backups:** Railway has no volume snapshot and no backup schedule (the
  CLI token can't create snapshots). Approved method = read-only
  `pg_dump --format=custom` via `railway run`, verified with
  `pg_restore --list` + row counts + SHA-256, stored mode 600 under
  `~/private-backups/geoviz-db/` (outside git/cloud sync). Latest:
  `geoviz-prod-pre-pr46-20261002T135634Z.dump` (sha256 `45811f00…`).
  Take a fresh one before every production migration; never delete one
  without the operator's approval.
- **Stale previews** built against production were deleted (54); only
  current previews remain.
- Local `.env` historically points at production — use
  `npm run test:no-db`, or a non-prod `DATABASE_URL` +
  `GEOVIZ_NONPROD_DB_HOSTS`, for anything that writes.
- **Deferred launch checks (not blockers; see docs/LAUNCH_CHECKLIST.md):**
  (1) authenticated Stripe test webhook returns 200; (2) one real
  production audit completes end-to-end. Never satisfy either by
  inserting rows directly into the production database.

## Operational Verification (post-deploy)

The Railway CLI is installed, authenticated, and linked to the GeoViz production environment (project `refreshing-love`, service `geoviz`). Claude should use it directly — do not ask the operator to tail logs manually unless the CLI fails, auth expires, or browser-only verification is required.

### When to run the verification suite

Fire on any change that touches:
- `prisma/` (schema, migrations)
- `scripts/geo-worker.ts` (worker prompt, audit pipeline)
- `src/lib/intelligence/` (V2 intelligence layer)
- `src/lib/audit-intelligence.ts` (intelligence ingestion orchestrator)
- cost telemetry persistence
- any Railway or Vercel deploy

Do **not** fire on UI / copy / PDF / email-template / docs-only changes.

### Preferred commands

1. `npx @railway/cli logs` — worker startup + recent errors. Look for `[geo-worker-version]`, `[geo-intelligence] ingest start/success`, and absence of stack traces.
2. `npx @railway/cli run npx prisma migrate status` — migration health on production.
3. `npm run intelligence:summary` — intelligence ingestion is populating recent rows.
4. `npm run intelligence:cost` — cost telemetry is reporting.

### What to summarize after a qualifying change

- deployment health
- worker health
- telemetry health
- intelligence ingestion health
- migration health
- rollback risk

### Escalation

Only ask the operator to inspect Railway manually if:
- The CLI fails (returns non-zero or hangs).
- Authentication has expired.
- A CLI access error blocks the command.
- Browser-only verification is genuinely required (UI screenshot, Vercel preview review).

# GeoViz Product Roadmap

## Product Positioning

GeoViz helps businesses understand how visible, understandable, and recommendable they are to modern AI systems such as ChatGPT, Claude, Gemini, Perplexity, and future AI-powered discovery platforms.

The platform is designed around the evolution from:
1. Audit Layer
2. Intelligence Layer
3. Action Layer

GeoViz is NOT a traditional SEO tool.
GeoViz focuses on AI visibility, AI readability, semantic clarity, trust signals, structured identity, and recommendation potential.

━━━━━━━━━━━━━━━━━━━━
V1 — AUDIT LAYER (CURRENT)
━━━━━━━━━━━━━━━━━━━━

Current focus:
- AI visibility audits
- reviewed reports
- directional scoring
- recommendation framing
- foundation fixes
- manual review workflow
- operator-controlled delivery
- AI visibility education

Key principles:
- Reports are reviewed before delivery
- Quality matters more than automation
- Directional insight is more important than false precision
- Clear recommendations beat technical overload
- Manual calibration is acceptable during V1

Current infrastructure:
- Next.js
- Stripe
- Railway workers
- PDF generation
- Admin review queue
- Protected report access
- Rate limiting
- Legal pages
- Mobile-first report rendering

━━━━━━━━━━━━━━━━━━━━
V2 — INTELLIGENCE LAYER
━━━━━━━━━━━━━━━━━━━━

Future V2 direction:
- recurring monitoring
- competitor comparisons
- AI readability analysis
- AI renderability analysis
- recommendation tracking
- historical trend tracking
- stronger crawler infrastructure
- headless browser analysis
- structured scoring evolution
- benchmark datasets
- scoring normalization
- longitudinal business visibility tracking

V2 goals:
- Move beyond one-time audits
- Build proprietary visibility intelligence
- Develop stronger scoring consistency
- Track AI visibility changes over time
- Compare businesses against competitors and category averages
- Improve defensibility through data accumulation

Important:
- Do not overclaim scoring precision
- Avoid "magic AI" positioning
- Prioritize understandable business value
- Benchmarking must be statistically grounded before aggressive marketing claims

V2 modules shipped so far:
- `src/lib/intelligence/intelligenceIngest.ts` — Stage 1 ingest (readability heuristic, entity extraction, CMS/framework detection, score provenance). Runs post-audit, persists to `AuditIntelligence`.
- `src/lib/intelligence/render/*` — Stage 2 optional headless render probe. Compares raw HTML vs post-render to detect blank-shell / hydration / client-only-content patterns.
- `src/lib/intelligence/preflight/*` — Preflight intelligence stage. One Node-side HTML fetch fans out to four analyzers: `extractReadableContent` (Mozilla Readability via JSDOM), `validateSchema` (JSON-LD entity field validation), `auditCrawlability` (robots.txt + sitemap.xml + canonical + meta-robots), `checkEntityConsistency` (name/phone/address across schema + homepage + footer). Output persisted to `AuditIntelligence.preflightSignals` (Json?). Worker can OPTIONALLY inject a "validated preflight signals" context block into the audit prompt when `GEO_PREFLIGHT_PROMPT=on` — default off, prompt is byte-for-byte unchanged otherwise. **Never affects scoring** — operates as a separate V2 metric layer, not as rubric weights.

━━━━━━━━━━━━━━━━━━━━
V3 — ACTION LAYER
━━━━━━━━━━━━━━━━━━━━

Future V3 direction:
- automated fixes
- CMS integrations
- schema deployment
- AI visibility optimization agents
- automated GEO workflows
- continuous recommendation testing
- site change detection
- AI crawler monitoring
- alerting systems
- structured deployment pipelines

V3 principles:
- Automation must remain explainable
- Never deploy risky changes silently
- Human review should remain available
- Reliability matters more than feature count
- Minimize customer technical complexity

Important:
- V3 should only expand after V1 and V2 stabilize
- Avoid premature automation
- Avoid fragile integrations
- Maintain clear rollback paths for all automated actions

━━━━━━━━━━━━━━━━━━━━
PRODUCT PHILOSOPHY
━━━━━━━━━━━━━━━━━━━━

GeoViz succeeds by:
- helping businesses adapt to AI-driven discovery
- making AI visibility understandable
- combining technical analysis with practical business recommendations
- prioritizing trust and clarity over hype
- evolving from audits → intelligence → action over time

Do NOT position GeoViz as:
- guaranteed rankings
- guaranteed citations
- guaranteed AI recommendations
- "instant AI optimization"
- fully autonomous SEO replacement

Position GeoViz as:
- AI visibility intelligence
- AI readability analysis
- recommendation readiness
- semantic business clarity
- practical AI discoverability guidance

━━━━━━━━━━━━━━━━━━━━
BUILD PRIORITIES
━━━━━━━━━━━━━━━━━━━━

Current priority order:
1. Stability
2. Security
3. Report quality
4. Calibration consistency
5. Customer workflow
6. Operational reliability
7. Intelligence expansion
8. Automation later

Avoid:
- feature bloat
- unnecessary dashboards
- excessive complexity
- premature scaling
- overengineering before customer validation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GeoViz System Architecture Principles
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GeoViz must be built as modular layers and services.

Do NOT tightly couple:
- audits
- scoring
- crawlers
- rendering
- monitoring
- competitor tracking
- automation
- notifications
- report generation

Each major capability must evolve independently.

━━━━━━━━━━━━━━━━━━━━
CORE MODULES
━━━━━━━━━━━━━━━━━━━━

## 1. Audit Engine Module (V1)

Purpose:
Generate AI visibility audits.

Responsibilities:
- website ingestion
- crawl orchestration
- AI analysis
- recommendation generation
- score calculation
- audit summaries
- report generation

Requirements:
- isolated
- testable
- reusable
- provider-agnostic where possible

━━━━━━━━━━━━━━━━━━━━

## 2. Scoring & Calibration Module

Purpose:
Centralize all scoring logic.

Responsibilities:
- category weights
- score normalization
- scoring bands
- benchmark logic
- calibration rules
- score explanations

Rules:
- Never scatter scoring logic across UI components
- Maintain centralized scoring authority
- All score adjustments must happen inside this module only

━━━━━━━━━━━━━━━━━━━━

## 3. Report Rendering Module

Purpose:
Render:
- web reports
- PDFs
- email previews
- sample reports

Responsibilities:
- formatting
- typography
- mobile rendering
- executive summaries
- charts/cards
- export formatting

Rules:
- Rendering module must NOT contain:
  - scoring logic
  - crawler logic
  - audit business rules

━━━━━━━━━━━━━━━━━━━━

## 4. Monitoring & Intelligence Module (V2)

Purpose:
Track visibility changes over time.

Responsibilities:
- recurring scans
- competitor tracking
- trend history
- visibility deltas
- recommendation tracking
- longitudinal analytics

Rules:
- Must operate independently from one-time audits
- Must support future recurring subscriptions

━━━━━━━━━━━━━━━━━━━━

## 5. Crawler & Renderability Module (V2)

Purpose:
Analyze real AI accessibility and renderability.

Responsibilities:
- headless rendering
- crawler simulation
- AI readability checks
- sitemap analysis
- robots.txt handling
- renderability analysis
- JS hydration checks

Requirements:
- Must support future headless infrastructure
- Must support stronger crawler infrastructure later

━━━━━━━━━━━━━━━━━━━━

## 6. Automation & Action Module (V3)

Purpose:
Perform AI visibility optimizations and automated actions.

Responsibilities:
- schema deployment
- CMS integrations
- automated fixes
- GEO workflows
- change detection
- deployment validation

Critical Rules:
- Must support rollback paths
- Never silently modify customer websites
- Human approval/review must remain possible

━━━━━━━━━━━━━━━━━━━━

## 7. Notification & Workflow Module

Purpose:
Handle operational workflow and delivery.

Responsibilities:
- operator notifications
- customer delivery
- retry logic
- admin review flow
- alerting
- queue state messaging

Rules:
- Must remain independent from:
  - report rendering
  - scoring
  - crawler logic

━━━━━━━━━━━━━━━━━━━━
ARCHITECTURE RULES
━━━━━━━━━━━━━━━━━━━━

- Keep modules loosely coupled
- Prefer interfaces/contracts over hard dependencies
- Avoid monolithic "god services"
- Avoid business logic inside UI components
- Maintain separation between:
  - analysis
  - scoring
  - rendering
  - delivery
  - automation

Future development must allow:
- swapping crawler systems
- evolving scoring independently
- changing AI providers
- adding monitoring without rewriting audits
- adding automation without rewriting rendering

GeoViz must evolve from:
V1 Audit Layer
→ V2 Intelligence Layer
→ V3 Action Layer

without requiring major rewrites.
