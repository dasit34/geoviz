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
“When customers ask ChatGPT who to hire, does your business show up?”

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
- dashboards
- login systems
- white-label features
- automation pipelines
- subscription billing
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
