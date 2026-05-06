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

## Positioning (CRITICAL)
Do NOT lead with “GEO.”
Do NOT assume users understand AI search.

Always frame as:
- “AI visibility”
- “Being recommended by ChatGPT”
- “Showing up when customers ask AI who to hire”

Primary headline:
“When customers ask ChatGPT who to hire, does your business show up?”

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

## Critical Constraint
Do NOT overbuild.

This MVP exists for one goal:
→ get first 5 paying customers

Everything else is secondary.

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
