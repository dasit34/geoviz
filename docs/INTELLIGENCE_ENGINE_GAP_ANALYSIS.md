# GeoViz — Intelligence Engine Phase 1: Gap Analysis

Status: SNAPSHOT as of Phase 1 completion. Reflects the codebase
**after** the Phase 1 implementation described in `## What Phase 1
built` below — not a pre-implementation proposal. Produced per the
approved plan (persistent evidence layer), which itself followed a
three-agent codebase audit (database schema, audit pipeline, admin/
Free Check/checkout surfaces) before any code was written.

Complements, not restates, the internal strategy corpus
(`docs/strategy/`, `docs/MODULE_BUILD_ORDER.md`,
`docs/DO_NOT_BUILD_YET.md`, `docs/DATA_MOAT_STRATEGY.md`) — this doc
is about the persistence/evidence layer's engineering state, not
product staging.

## Summary

Before Phase 1, GeoViz already made 6–11 real LLM calls per paid
audit — 1 report-writer call plus 4–5 "validator" calls (Claude
Haiku, OpenAI, Gemini, Perplexity, GoogleAIOverview placeholder), each
optionally paired with a buyer-intent "competitive capture" query
asking *"Who are the best providers in this category and area, and
would you recommend any in particular?"* (`src/lib/validators/
capture.ts`). Every one of those calls already produced rich,
structured evidence — raw prompt, raw response, model/version,
would-recommend verdict, cited sources, named competitor entities —
but it was written as a single opaque JSON blob per audit
(`AuditIntelligence.aiValidations`), not as queryable rows.

A second, parallel system, `src/lib/observations/*`, already defined
the "right" normalized per-provider type shape (`ProviderObservation`,
`ObservationRun`) and had a migrated append-only table
(`ObservationHistory`) — but its provider implementations
(`src/lib/observations/providers/*.ts`) were, and remain, explicit
no-fetch stubs gated by `ENABLE_OBSERVATION`, which is never set
true. It ran (and still runs) as a permanent, harmless no-op in
production.

**Decision: Phase 1 normalizes the already-real validator output,
not the stub system.** `src/lib/observations/*` is left exactly as it
was — untouched, unused, not deleted, not extended. This cost zero
new LLM calls and zero new API spend; `git diff` on `src/lib/
validators/**` shows only a one-line constant extraction, and
`src/lib/observations/**` has no diff at all.

## Data point inventory

| Required data point | Status | Where |
|---|---|---|
| Business fields | **EXISTS** | `AuditOrder` (websiteUrl, email, businessName), `Business` (domain-keyed cross-audit identity) — pre-existing |
| Industry/category fields | **EXISTS** | `AuditIntelligence.industryCategoryNormalized` (pre-existing, `industry-taxonomy.ts` v1); `QueryLibraryEntry.industryNormalized` (Phase 1, same taxonomy) |
| Geography/location fields | **PARTIAL** | `QueryLibraryEntry.geographyRaw` (Phase 1) is best-effort free text from a provider's own `inferred_location` — **no geography taxonomy exists anywhere in this codebase.** `AuditIntelligence.location` has always been written `null` (pre-existing gap, confirmed unchanged). Will fragment more than industry does; not solved this phase. |
| Queries/prompts currently generated | **EXISTS (Phase 1), narrow** | `QueryLibraryEntry` — but only ONE real, reusable query is populated (`intent: "recommendation"`, the discovery/buyer-intent question already sent by the validator layer). The other 7 spec intent categories (discovery, comparison, reputation_trust, service_specific, location_specific, problem_solution, purchase_high_intent) are schema-supported (the `intent` column accepts any of them) but have **zero rows**. |
| Model/provider fields | **EXISTS (Phase 1)** | `Observation.provider` / `model` / `modelVersion` |
| Raw LLM responses | **EXISTS (Phase 1)**, was previously trapped-only | `Observation.promptText` / `rawResponseText` — this data existed before Phase 1 too, but only inside `AuditIntelligence.aiValidations`'s opaque JSON, not as a queryable column |
| Parsed responses | **EXISTS (Phase 1)** | `Observation.mentioned` / `recommended` / `citations` / `citationDomains`, plus the full verbatim `parserOutput` (JSON) + `parserVersion` |
| Recommendations | **EXISTS, self_assessment call type only** | `Observation.recommended` — derived from the validator layer's `would_recommend: YES\|PARTIAL\|NO`. `competitive_capture` rows never carry a recommend verdict (`recommended` is always null there — no such signal exists at that call type) |
| Citations | **EXISTS, self_assessment call type only** | `Observation.citations` / `citationDomains`. `competitive_capture` rows have no citation signal (always empty arrays) |
| Competitors | **EXISTS (Phase 1)** | `ObservationCompetitorMention` — one row per named entity in a `competitive_capture` response, excluding a best-effort match against the subject business's own name |
| Website/entity/schema signals | **EXISTS, pre-existing, unchanged** | `AuditIntelligence.preflightSignals` (schema validation, crawlability, entity consistency — from `src/lib/intelligence/preflight/*`, untouched by this phase) |
| Timestamps | **EXISTS (Phase 1)** | `Observation.observedAt` (from the source record's own retrieval timestamp) / `createdAt` |
| Audit/report relationships | **EXISTS (Phase 1)** | `Observation.auditOrderId → AuditOrder`, `Observation.businessId → Business` (denormalized, best-effort) |
| Free Check data | **EXISTS, separate, unrelated** | `FreeCheckSubmission` — confirmed still fully decoupled (soft join on email only); zero LLM calls, deterministic-only. Not touched by, and has no relationship to, the evidence layer |
| Data discarded after report generation | **Substantially closed for the validator layer** by this phase — see `## What's still discarded` for what remains |
| Target position/rank | **MISSING** | `Observation.position` column exists (reserved) but is never populated — no researched validator output carries a subject-ranking signal |
| Sentiment/perception | **MISSING** | `Observation.sentiment` column exists (reserved), never populated — no sentiment-extraction logic exists anywhere in the pipeline |
| Extracted claims about the target business | **MISSING** | `Observation.extractedClaims` column exists (reserved), never populated |
| AI Share of Voice | **EXISTS (Phase 1)** | `src/lib/intelligence/competitive/shareOfVoice.ts` — see `docs/COMPETITIVE_METRICS_FORMULAS.md` |
| Why competitors are winning | **MISSING** | Not attempted this phase — a genuine causal-explanation capability, not a data-availability gap; `Observation.parserOutput` preserves every provider's own free-text reasoning losslessly, but nothing synthesizes a "why" narrative from it yet |
| Visibility change over time (scan-over-scan) | **PARTIAL** | `Observation` is append-only, so a real longitudinal history exists once `GEO_EVIDENCE_LAYER_ENABLED=true` and a business has 2+ scans — but no delta/trend computation is built; an operator would query raw rows by hand today |
| Website/entity signal correlation with recommendation outcomes | **MISSING, explicitly deferred** | Named in `docs/DO_NOT_BUILD_YET.md`'s "not yet" list ("correlation analysis across thousands of observations") — out of Phase 1 scope by design, not an oversight |

## What's still discarded

Even after Phase 1, some real data generated during an audit is not
persisted anywhere:

- **The report-writer's own `web_search` tool-call activity.** The
  Anthropic SDK performs these fetches internally during the main
  audit-writing call (`scripts/geo-worker.ts`); only the final
  markdown text is kept. The individual search queries, fetched
  pages, and intermediate reasoning are never captured. This is a
  different call from the validator layer entirely and is out of
  scope for this phase's normalization work.
- **`GoogleAIOverviewValidator`** is registered in
  `src/lib/validators/registry.ts` but is a confirmed
  always-unavailable placeholder — GeoViz does not yet have a real
  5th provider integration for Google AI Overviews specifically.
  `Observation` rows are only ever written for `status: "passed"`
  outputs, so this placeholder simply never produces rows — correctly
  reflecting that no real call happened, not a bug.
- **Position/sentiment/extractedClaims**, as noted above — reserved
  columns with no producing logic yet.

## Architectural decision: validators vs. observations

Two systems already existed in this codebase for "ask AI providers
about this business," discovered during the pre-implementation audit:

| | `src/lib/validators/*` | `src/lib/observations/*` |
|---|---|---|
| Real API calls? | **Yes** — Claude, OpenAI, Gemini, Perplexity all have real `fetch`/SDK implementations | **No** — every provider file is an explicit no-fetch stub |
| Runs in production today? | **Yes**, unconditionally, every paid audit | Runs the orchestrator, but every provider returns a stub result — `ENABLE_OBSERVATION` is never set true |
| Type shape | `NormalizedValidationOutput` / `CompetitiveCapture` | `ProviderObservation` / `ObservationRun` — arguably cleaner, but unused |
| DB persistence | One opaque JSON blob per audit (`AuditIntelligence.aiValidations`) | Only an aggregate summary (`ObservationHistory`) — no per-query/per-provider row was ever designed for it |

Phase 1 chose to normalize the validators layer's real output rather
than wire the observations stubs to be real, because doing the latter
would require implementing four more real LLM/API integrations from
scratch — duplicating work `src/lib/validators/*` already does,
roughly doubling per-audit API cost and latency for data that's
already being produced today. `src/lib/observations/*` is left
exactly as-is: untouched, unused, not deleted, not extended. A future
engineer should not attempt to "finish" both systems — this decision
is the record of why.

## What Phase 1 built

1. **Schema** (`prisma/schema.prisma`) — three additive models:
   `QueryLibraryEntry`, `Observation`, `ObservationCompetitorMention`,
   plus opposite relations on `Business` and `AuditOrder`. Migration
   `prisma/migrations/20260812125810_add_query_library_and_
   observation_evidence/` contains only `CREATE TABLE` / `CREATE
   INDEX` / `ADD CONSTRAINT` statements — no destructive operations,
   no changes to any existing table.
2. **Query-text extraction** (`src/lib/validators/capture.ts`) — the
   existing inline buyer-intent question literal was extracted into a
   named export, `DISCOVERY_QUERY_TEXT`, so the Query Library's dedup
   key can never drift from the literal actually sent to models.
   Verified byte-identical to the pre-change prompt text.
3. **Write path** (`src/lib/intelligence/evidence/
   persistObservationEvidence.ts`) — normalizes an already-computed
   `ValidationLayerResult` into the new tables. Zero new LLM calls;
   fail-soft at both the whole-function level and per-provider-output
   level.
4. **Wiring** (`src/lib/audit-intelligence.ts`) — called immediately
   after the existing `aiValidations`/`consensusIndex` persist block,
   gated by `GEO_EVIDENCE_LAYER_ENABLED` (default unset/false in
   `.env.example`). With the flag off, behavior is byte-identical to
   pre-Phase-1 — confirmed by re-running the existing 54-assertion
   `scripts/test-ai-validators.ts` suite unchanged.
5. **Metrics module** (`src/lib/intelligence/competitive/*`) — pure
   read functions over the new tables: `mentionRate`,
   `recommendationRate`, `shareOfVoice`, `competitorFrequency`,
   `queryWinLoss`, `modelWinLoss`. Formulas documented in
   `docs/COMPETITIVE_METRICS_FORMULAS.md`. None of this touches
   `src/lib/scoring/*` (frozen) or any `AuditIntelligence` score
   column.
6. **Admin view** — `src/app/admin/evidence/scan/[auditOrderId]/
   page.tsx` (cookie-authed, sibling to `/admin/trace/[id]`, which now
   links to it), `src/app/admin/evidence/business/[businessId]/
   page.tsx` (`?key=`-authed, mirrors `/admin/calibration`),
   `src/app/api/admin/evidence/stats/route.ts` (mirrors `/api/admin/
   calibration/learning-loop`'s rate-limit → admin-key →
   `{enabled:false}` → parallel-reads pattern), `src/components/
   AdminEvidencePanel.tsx` (mirrors `CalibrationLearningLoopPanel`'s
   60s self-poll).

## Migration risk assessment

- Reviewed generated SQL directly: only `CREATE TABLE`, `CREATE
  INDEX`, `CREATE UNIQUE INDEX`, `ALTER TABLE ... ADD CONSTRAINT
  FOREIGN KEY` — zero `DROP`, zero `ALTER COLUMN` on any existing
  table. Satisfies `CLAUDE.md`'s "conservative migrations" rule.
- The migration was **generated but deliberately not applied** from
  this session — `.env`'s `DATABASE_URL` points at a live
  Railway-hosted Postgres and this repo's `build` script already runs
  `prisma migrate deploy` before `next build`, so the migration lands
  automatically on the next normal deploy, the same way every other
  migration in this repo's history has shipped. No manual `migrate
  deploy` was run against a possibly-production database from a local
  session.
- `QueryLibraryEntry`'s uniqueness constraint deliberately excludes
  `businessId` (Postgres treats `NULL` as distinct per row, so
  including a nullable `businessId` would silently defeat dedup for
  every global row) — documented inline in the schema so a future
  migration doesn't "fix" this by mistake.
- The write path is gated behind `GEO_EVIDENCE_LAYER_ENABLED`
  (default false) specifically so it can be verified via `[evidence]`
  log lines in staging/one production run before being enabled
  broadly — an extra kill switch layered on top of the existing
  fail-soft `try/catch` contract every block in `audit-intelligence.ts`
  already follows.

## Verification performed

- `npx tsc --noEmit` — clean, zero errors, after every step.
- `npm run test:ai-validators` (pre-existing 54-assertion suite) —
  all pass, unchanged, confirming zero behavior change to the
  validator layer itself.
- `npm run test:evidence-persistence` (new, 21 assertions) — covers
  self_assessment-only, self_assessment + competitive_capture,
  cross-audit `QueryLibraryEntry` dedup, and non-`passed`-status
  skipping.
- `npm run test:competitive-metrics` (new, 21 assertions) — every
  metric hand-verified against seeded fixture rows, including the
  "latest observation wins, never averaged across re-runs" rule for
  `queryWinLoss`/`modelWinLoss`.
- `git diff --stat src/lib/validators/` — one file, the constant
  extraction only. `git diff --stat src/lib/observations/` — empty.
  Confirms zero new LLM calls were introduced.

## Deferred to Future Phases (not built, per the approved plan)

Scheduled/recurring rescans, monitoring subscriptions, competitor
watchlists, visibility/citation/perception change alerts, automated
content briefs, schema/internal-link recommendations, content gap
analysis, Search Console integration, automated site fixes,
large-scale correlation analysis across observations, and published
industry benchmarks. All remain correctly gated by
`docs/DO_NOT_BUILD_YET.md`'s existing triggers. No speculative
"future phase" columns were pre-added to the schema (e.g., no
`scheduledScanId` placeholder) — per this codebase's existing
convention, those get added via a trivial additive migration exactly
when a future phase needs them, not before.
