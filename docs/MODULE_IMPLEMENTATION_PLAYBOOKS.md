# GeoViz — Module Implementation Playbooks

Status: PLANNING ONLY. Every step below is a future action item, not a description of work done in this pass. Nothing in this document is implemented, and nothing here should be started before its "Do not start until" line is satisfied — cross-reference `docs/MODULE_BUILD_ORDER.md` for the authoritative sequencing and `docs/DO_NOT_BUILD_YET.md` for the postponement rationale.

Ordered in the same sequence as `docs/MODULE_BUILD_ORDER.md` so the two documents can be read side by side. Each section: current scaffold state (one line, cross-referencing the module's own `README.md`/`contracts.ts` rather than restating them), ordered steps for later, key risks, and the start trigger.

---

## 1. AI Answer Sampling

**Current state:** scaffolded — `src/modules/ai-answer-sampling/README.md` + `contracts.ts` (`AiAnswerSnapshot`, `AnswerSamplingService`), flag `GEO_MODULE_AI_ANSWER_SAMPLING_ENABLED` (default false), no route.

**Steps:**
1. Define the per-module API contract (internal service boundary — this module likely has no external caller, only Monitoring/Benchmark Engine consuming it internally).
2. Define a versioned wire-format spec for `AiAnswerSnapshot` (currently a bare TS type) — this is the record every downstream module and the future Data Licensing pipeline will depend on for years; get the shape right before it has history behind it.
3. Define the scheduling/queue contract: extend the existing `scripts/geo-worker.ts` atomic-claim/poll-loop pattern with a new job type, per `docs/architecture/SYSTEM_ARCHITECTURE.md`'s deployment topology note — do not stand up a parallel infrastructure stack.
4. Define telemetry requirements (sampling run cost, latency, per-run failure rate) — this module's cost discipline is itself a stated acceptance criterion.
5. Implement `AnswerSamplingService` against real provider calls, reusing the fail-soft, per-provider-timeout pattern already proven in `src/lib/validators/` (the V1 audit's real four-provider validator layer).
6. Promote the embedded Prisma proposal in `contracts.ts` to a real, additive migration — immutable/append-only per the PRD's acceptance criteria (re-running a query must never mutate a prior snapshot).
7. No customer-facing route needed for v1 — this module has no UI of its own; its output surfaces through Monitoring.
8. Write a test plan: fixture asserting a sampling run persists an immutable, timestamped snapshot; fixture asserting cost/latency are recorded per run; fixture asserting re-running a query never mutates a prior row.
9. Define a rollout plan: start at pilot scale (small, fixed panel of businesses) before any customer-facing dependent module goes live — cost-bounded cadence is a named acceptance criterion, not an afterthought.
10. Define success metrics: cost-per-sample within budget, sampling-panel uptime, and — critically — whether Monitoring subscribers who see real snapshots churn less than a control cohort that doesn't (this is the metric that validates or invalidates the entire recurring-revenue thesis).
11. Remove "SCAFFOLD ONLY" from the README once live behind the flag.

**Key risks:**
- Cost scales with sampling frequency × customer count × provider count — the PRD names this explicitly; an uncapped cadence could make Monitoring's unit economics negative before anyone notices.
- This module is evidence-only per the Scoring Constitution (CLAUDE.md) — any implementation path that lets a sampled answer influence the canonical score, even indirectly, violates a frozen, board-level rule.
- It's the highest-moat, highest-difficulty module to build first — if the pilot's data quality is weak, every downstream module (Monitoring, Benchmark Engine, Competitor Intelligence) inherits that weakness.

**Do not start until:** Stage 2–3, and only once Monitoring v1's business case (see below) is validated enough to justify the 6–10 week investment — per `docs/MODULE_BUILD_ORDER.md`.

---

## 2. Monitoring

**Current state:** most mature scaffold — `src/modules/monitoring/README.md` + `contracts.ts` (`MonitoringSubscription`, `MonitoringDashboardView`, `MonitoringService`) + `page.skeleton.tsx` + flag-gated route at `src/app/(future)/monitoring/page.tsx`. Deepest existing doc coverage: `docs/monitoring/MONITORING_SPEC.md`.

**Steps (v1 — re-score + evidence only):**
1. Define the customer-facing API contract (dashboard read endpoints) — the route skeleton already exists, so this is the natural next artifact.
2. No new event schema of its own for v1 (composes `AiAnswerSnapshot`, does not define a new event type).
3. Define the scheduled re-score job contract (weekly/monthly cadence per plan tier — an acceptance criterion already stated in the PRD).
4. Define telemetry requirements: evidence-viewed events, score-plateau detection inputs (feeds the churn-risk flag).
5. Implement `MonitoringService` against real `AiAnswerSnapshot` data once AI Answer Sampling v1 ships — this module cannot go live before its one hard v1 dependency is real, not scaffolded.
6. Promote the embedded `MonitoringSubscription` Prisma proposal to a real migration, plus Stripe recurring-billing wiring (out of scope for this repo's `contracts.ts` — coordinate with the frozen MVP's Stripe integration without modifying it).
7. Build the real dashboard on the existing `page.skeleton.tsx` — always includes at least one evidence snapshot when available, per acceptance criteria.
8. Write a test plan: churn-risk flag fires when score plateaus AND no evidence viewed in the window; cadence enforced per tier; dashboard never renders without evidence when evidence exists.
9. Define a rollout plan: pilot cohort first (existing $97 customers offered the subscription), NRR tracked from day one — Monitoring's retention design is named the single highest-risk decision in the five-year plan.
10. Define success metrics: NRR (>90% is the Stage 2 exit gate per `MODULE_DEPENDENCY_GRAPH.md`), attach rate from $97 audit customers, churn-risk-flag precision.

**Steps (v2 — adds Change Detection + Alerts, Stage 4):** repeat steps 1–10 for the incremental scope once both dependencies are live; do not block v1 launch on v2 scope, per the PRD's explicit Non-Goal.

**Key risks:**
- Named by its own PRD as "the single highest-risk decision in the five-year plan" — a weak v1 retention story poisons the read on every later recurring-revenue module.
- Billing integration touches Stripe, which is load-bearing per `CLAUDE.md` — any v1 implementation work must not modify the frozen MVP's checkout/webhook code, only add new recurring-billing surface area.
- Premature v2 scope (change-detection/alerts) before v1 proves retention would repeat the "build before validating" failure mode `docs/strategy/00_NORTH_STAR.md`'s Core Principles explicitly warn against.

**Do not start until:** Stage 2, and only after AI Answer Sampling has a real (non-scaffold) `AnswerSamplingService` — per `docs/MODULE_BUILD_ORDER.md`.

---

## 3. Telemetry

**Current state:** scaffolded — `src/modules/telemetry/README.md` + `contracts.ts` (`TelemetryEvent`, `TelemetryService`), flag `GEO_MODULE_TELEMETRY_ENABLED`, no route (correctly — it's a sink, not a customer surface).

**Steps:**
1. No external API contract needed in v1 per its own PRD Non-Goal (internal function call only, until a plugin needs external ingestion).
2. Define a versioned wire format for `TelemetryEvent` once the first real emitting module (WordPress Plugin, Shopify Plugin, or Agency Platform) is close to shipping — building this before any consumer exists risks guessing wrong.
3. No queue contract in v1, per the module's own explicit Non-Goal — do not build a public authenticated endpoint before a plugin is actually calling it.
4. N/A — this module defines telemetry, it doesn't consume it.
5. Implement `TelemetryService` as an append-only internal function, fail-soft on malformed payloads (matching `AuditIntelligence`'s existing pattern in the frozen MVP — reuse that convention, don't invent a new one).
6. Promote the embedded `TelemetryEvent` Prisma proposal to a real, append-only migration (no update path, per acceptance criteria).
7. No route needed.
8. Write a test plan: malformed payload never crashes ingestion; event volume queryable by `source` and `eventType`.
9. Define a rollout plan: ship as an internal-only sink well before any plugin needs it — this is infrastructure, not a customer-facing launch.
10. Define success metrics: ingestion reliability (zero data loss on malformed payloads), query latency for the first consuming dashboard.

**Key risks:**
- Low engineering risk (1–2 week estimate, the smallest in the roadmap) but high blast-radius risk if the event shape is designed wrong — every later module depends on this seam, and schema mistakes here propagate.
- Temptation to over-build a "proper" event bus before any real consumer exists — resist; the PRD explicitly says an internal function call is sufficient for v1.

**Do not start until:** Stage 3–4, right before the first of WordPress Plugin / Shopify Plugin / Agency Platform is ready to ship — per `docs/MODULE_BUILD_ORDER.md`.

---

## 4. AI Visibility Layer

**Current state:** scaffolded — `src/modules/visibility-layer/README.md` + `contracts.ts` (`LayerInstall`, `VisibilityLayerService`), flag `GEO_MODULE_VISIBILITY_LAYER_ENABLED`, no route. Dedicated spec exists: `docs/plugin/VISIBILITY_LAYER_SPEC.md`.

**Steps:**
1. Define the API contract for snippet-serving (the CDN-facing surface, not an app-server route — per `SYSTEM_ARCHITECTURE.md`'s deployment topology note, keep this decoupled from the Next.js deploy).
2. No new event schema of its own; emits install/liveness events via Telemetry.
3. No queue contract needed — liveness checks are periodic polling, not queue-driven.
4. Define telemetry requirements: install events, liveness-check results, drift-detection triggers.
5. Implement `VisibilityLayerService`: snippet content generation from source-of-truth business data, drift detection against a deliberately-mismatched fixture, uninstall detection within one liveness-check cycle (all named acceptance criteria).
6. Promote the embedded `LayerInstall` Prisma proposal to a real migration — this model is reused by both WordPress Plugin and Shopify Plugin, so get its shape right once.
7. Build a flag-gated route/skeleton (currently missing) before any customer-facing install flow — matches the existing pattern in `src/app/(future)/monitoring/page.tsx`.
8. Write a test plan: snippet content matches source-of-truth data; drift detection flags a deliberately-mismatched fixture; uninstall detected within one liveness cycle.
9. Define a rollout plan: this module is the entry point to two dependent plugin modules (WordPress, Shopify) — do not treat it as done until at least one plugin has successfully installed against it in a staging environment.
10. Define success metrics: install-base size, liveness-check pass rate, drift-detection false-positive rate.

**Key risks:**
- Explicit permanent boundary (ties to North Star): not a CMS, not a site builder, not write-capable beyond its own context block until the V3 approval-gated stage — any implementation drift toward "editing the customer's actual site" is out of scope forever, not just for now.
- This is the seam two plugin modules build on top of — a shape mistake here means redoing both WordPress and Shopify plugin work later.

**Do not start until:** Stage 4, after Telemetry is live — per `docs/MODULE_BUILD_ORDER.md`.

---

## 5. Cohort Analysis

**Current state:** scaffolded — `src/modules/cohort-analysis/README.md` + `contracts.ts` (`CohortSnapshot`, `CohortAnalysisService`, implements `BenchmarkStore` from `src/lib/v2/contracts.ts`), flag `GEO_MODULE_COHORT_ANALYSIS_ENABLED`, no route (correctly — internal aggregation engine, no customer-facing surface planned).

**Steps:**
1. Define the internal API contract consumed by Benchmark Engine and Data Licensing.
2. No event schema needed — this is a periodic recomputation engine, not an event emitter.
3. No queue contract needed for v1 (periodic batch recomputation, not queue-driven, per its own PRD framing).
4. Define telemetry requirements: recomputation run duration, sample-size-gate rejection rate.
5. Implement `CohortAnalysisService`: `cohortsFor()` must refuse to return a cohort below the minimum sample-size gate (a named acceptance criterion this module exists to enforce).
6. Promote the embedded `CohortSnapshot` Prisma proposal to a real, versioned migration — every recomputation must be versioned with prior versions remaining queryable, per acceptance criteria.
7. No route needed.
8. Write a test plan: `cohortsFor()` refuses a below-floor cohort; recomputation versioning is provable (prior versions queryable after a new one is computed).
9. Define a rollout plan: this module has no customer-facing launch of its own — its "rollout" is really "first cohort crosses the sample-size floor," which is a data-volume milestone, not a release event.
10. Define success metrics: percentage of vertical×geo buckets that clear the sample-size floor, recomputation reliability.

**Key risks:**
- The whole point of this module is refusing to overclaim precision on thin data — the biggest risk is *not* the engineering, it's the discipline to actually gate on sample size once there's commercial pressure to publish a benchmark early.
- Feeds both Benchmark Engine (indirect revenue) and Data Licensing (the highest-margin line in the roadmap) — a governance mistake here has compounding downstream cost.

**Do not start until:** Stage 3–4, once audit volume is meaningful — per `docs/MODULE_BUILD_ORDER.md`.

---

## 6. Agency Platform

**Current state:** scaffolded — `src/modules/agency-platform/README.md` + `contracts.ts` (`AgencyAccount`, `AgencyClientLink`, `AgencyPlatformService`) + `page.skeleton.tsx` + flag-gated route at `src/app/(future)/agency-platform/page.tsx`. Dedicated spec: `docs/agency/AGENCY_PLATFORM_SPEC.md`.

**Steps:**
1. Define the API contract for bulk audit submission (one order per client hostname, per acceptance criteria).
2. No new event schema; emits usage events via Telemetry.
3. No queue contract of its own (bulk submission fans out into the existing MVP order pipeline, not a new queue).
4. Define telemetry requirements: per-agency client-count, bulk-submission volume, white-label render rate.
5. Implement `AgencyPlatformService`: tenant isolation is the core acceptance criterion — an agency user must never see another agency's clients.
6. Promote the embedded `AgencyAccount`/`AgencyClientLink` Prisma proposal to a real migration, deliberately lighter-weight than Enterprise's RBAC (per its own Non-Goal — do not reuse Enterprise's eventual RBAC implementation).
7. Build the real dashboard on the existing `page.skeleton.tsx`.
8. Write a test plan: tenant-isolation fixture (agency A never sees agency B's data); bulk submission creates exactly one order per hostname; white-label branding renders without GeoViz branding when configured.
9. Define a rollout plan: this is the primary Stage 3 growth engine per board consensus — pilot with a small number of design-partner agencies before general availability.
10. Define success metrics: agency-book revenue as % of total (>10% is the Stage 3 exit gate), no single partner exceeding 25% concentration (also a named exit gate).

**Key risks:**
- Tenant-isolation bugs here are a trust/security incident, not just a UX bug — an agency seeing another agency's client data would be a serious breach for a trust-dependent product.
- Explicitly must not share a RBAC abstraction with Enterprise — building them together "to save time" is the premature-abstraction failure mode this codebase has already named and rejected once.

**Do not start until:** Stage 3, after Visibility Layer and Telemetry are live — per `docs/MODULE_BUILD_ORDER.md`.

---

## 7. WordPress Plugin

**Current state:** scaffolded — `src/modules/wordpress-plugin/README.md` + `contracts.ts` (`WordPressPluginConfig`, reuses `LayerInstall`), flag `GEO_MODULE_WORDPRESS_PLUGIN_ENABLED`, no route. No dedicated spec (partial coverage inside `docs/plugin/VISIBILITY_LAYER_SPEC.md`).

**Steps:**
1. Define the GeoViz-side API contract — per the PRD's own framing, this module's entire scope *is* that contract (the PHP plugin codebase itself is explicitly out of scope for this repo). This is the single highest-priority missing artifact for this module.
2. No new event schema; emits install/sync/deactivation events via Telemetry.
3. No queue contract needed (synchronous activation/sync calls).
4. Define telemetry requirements: activation events, schema-sync success rate, deactivation detection latency.
5. Implement the GeoViz-side service: plugin activation registers a `LayerInstall` row via the Visibility Layer service (not a new data model — reuse).
6. No new Prisma model — this module explicitly reuses `LayerInstall` from Visibility Layer.
7. Build a flag-gated route/skeleton (currently missing) if any GeoViz-side setup UI is needed beyond the API.
8. Write a test plan: activation registers a `LayerInstall` row; schema sync reflects latest Fix/audit data; deactivation detected within one liveness cycle.
9. Define a rollout plan: WordPress.org review-process lead time is real external latency — budget for it separately from engineering time, and plan the submission timeline before, not after, the API contract is finished.
10. Define success metrics: plugin-activation count, activation telemetry vs. raw audit volume (measures real adoption, not just interest).

**Key risks:**
- The actual PHP plugin codebase is a separate deliverable outside this repo — coordinating that build (likely a different contractor/stack) is a project-management risk as much as an engineering one.
- WordPress.org's review process is a real external dependency with unpredictable timing — don't sequence Shopify Plugin's "prove the thesis first" logic on an optimistic WordPress timeline.

**Do not start until:** Stage 4, after Visibility Layer is live — per `docs/MODULE_BUILD_ORDER.md`.

---

## 8. Change Detection

**Current state:** scaffolded — `src/modules/change-detection/README.md` + `contracts.ts` (`ChangeEvent`, `ChangeDetectionService`), flag `GEO_MODULE_CHANGE_DETECTION_ENABLED`, no route.

**Steps:**
1. Define the internal API contract (consumed by Monitoring v2 and Alerts).
2. Define a versioned wire format for `ChangeEvent` (currently TS-only) — Alerts depends directly on this shape.
3. Define the scheduled diff-job contract, extending the `scripts/geo-worker.ts` pattern per `SYSTEM_ARCHITECTURE.md`.
4. Define telemetry requirements: diff-run frequency, false-positive rate.
5. Implement `ChangeDetectionService` as strictly deterministic, diff-based logic — the PRD's acceptance criteria explicitly forbid any LLM call in the implementation or test path, which is a harder constraint than it sounds (resist the temptation to use an LLM for "fuzzy" diffing).
6. Promote the embedded `ChangeEvent` Prisma proposal to a real migration.
7. No route needed — this module has no UI of its own; its output surfaces through Monitoring/Alerts.
8. Write a test plan: a deliberately mismatched fixture (NAP mismatch, missing schema field) is always flagged; an unchanged fixture never false-positives; grep the implementation for any LLM call and fail the test if one exists.
9. Define a rollout plan: ship behind Monitoring v2, not as a standalone launch.
10. Define success metrics: false-positive rate (must stay near zero to protect Alerts' credibility), diff-job cost per business per cycle.

**Key risks:**
- "No LLM in the implementation path" is an unusual constraint to enforce over time — a future contributor reaching for an LLM to handle an edge case would silently violate both this module's acceptance criteria and the deterministic-evidence spirit of the whole product.
- False positives here directly damage Alerts' credibility (a false "something changed" alert is worse than no alert) — the retention thesis depends on this being trustworthy, not just functional.

**Do not start until:** Stage 4, after AI Answer Sampling and Visibility Layer are live — per `docs/MODULE_BUILD_ORDER.md`.

---

## 9. Benchmark Engine

**Current state:** scaffolded — `src/modules/benchmark-engine/README.md` + `contracts.ts` (`PublishedBenchmark`, `BenchmarkEngineService`) + `page.skeleton.tsx` + flag-gated route at `src/app/(future)/benchmark-engine/page.tsx`. Dedicated spec: `docs/benchmarking/BENCHMARK_ENGINE_SPEC.md`.

**Steps:**
1. Define the public-facing API contract (for the eventual published-report surface and, later, Data Licensing delivery).
2. No new event schema; consumes Cohort Analysis output.
3. No queue contract needed for v1 (triggered by Cohort Analysis recomputation, not independently scheduled).
4. Define telemetry requirements: report-view counts, methodology-version distribution.
5. Implement `BenchmarkEngineService`: cannot publish below the configured minimum sample-size floor; every published benchmark records its methodology version; no publish action mutates a prior published snapshot (all named acceptance criteria — this is Cohort Analysis's governance discipline surfaced publicly).
6. Promote the embedded `PublishedBenchmark` Prisma proposal to a real, append-only migration.
7. Build the real report UI on the existing `page.skeleton.tsx`.
8. Write a test plan: below-floor publish attempt is rejected; every publish records a methodology version; republishing never mutates a prior snapshot.
9. Define a rollout plan: first published report should be a single, well-chosen vertical/geo with strong sample size — a weak first benchmark undermines the "citable, versioned" credibility the whole module exists to build.
10. Define success metrics: press/inbound citations of published benchmarks, sample-size floor pass rate across verticals.

**Key risks:**
- The entire value of this module is "citable and never silently revised" — a single quiet correction to a published number would undermine analyst/press trust built over years, not just that one report.
- Direct revenue (via Data Licensing) doesn't arrive until Stage 6 — this module has to be justified on category-authority grounds for two stages before it pays for itself directly, which is a real internal-prioritization risk if short-term revenue pressure mounts.

**Do not start until:** Stage 4, after AI Answer Sampling and Cohort Analysis are live — per `docs/MODULE_BUILD_ORDER.md`.

---

## 10. Alerts

**Current state:** scaffolded — `src/modules/alerts/README.md` + `contracts.ts` (`AlertNotification`, `AlertsService`), flag `GEO_MODULE_ALERTS_ENABLED`, no route.

**Steps:**
1. Define the internal API contract (consumed by Monitoring v2).
2. Define a versioned wire format for `AlertNotification` (currently TS-only).
3. Define the delivery-queue contract (email/SMS/webhook fan-out, with fail-soft delivery per acceptance criteria).
4. Define telemetry requirements: alert engagement-state transitions (unseen → viewed → acted) — this is itself a named acceptance criterion, not just nice-to-have analytics.
5. Implement `AlertsService`: every alert must include a non-empty recommended action; delivery must be fail-soft (never silently fails without a logged warning).
6. Promote the embedded `AlertNotification` Prisma proposal to a real migration.
7. No route needed — surfaces inside the Monitoring dashboard.
8. Write a test plan: alert-generation fixture always includes a non-empty recommended action; simulated delivery failure logs a warning rather than failing silently; engagement-state transitions are recorded correctly.
9. Define a rollout plan: ship inside Monitoring's premium tier, bundled — not as a separate opt-in, per the PRD's revenue model.
10. Define success metrics: alert engagement rate (viewed → acted), correlation between alert receipt and reduced churn (the metric that validates the "can't cancel, something might break" retention thesis named in the PRD).

**Key risks:**
- A generic or vague alert ("something changed") actively damages trust rather than building it — the "non-empty recommended action" acceptance criterion exists because a bad alert is worse than no alert.
- Depends directly on Change Detection's false-positive rate staying low — an upstream data-quality problem becomes this module's credibility problem.

**Do not start until:** Stage 4, after Change Detection and AI Answer Sampling are live — per `docs/MODULE_BUILD_ORDER.md`.

---

## 11. Shopify Plugin

**Current state:** scaffolded — `src/modules/shopify-plugin/README.md` + `contracts.ts` (`ShopifyPluginConfig`), flag `GEO_MODULE_SHOPIFY_PLUGIN_ENABLED`, no route. No dedicated spec.

**Steps:**
1. Define the GeoViz-side API contract, including the mandatory `app/uninstalled` and GDPR data-erasure webhooks Shopify's app review requires (a named acceptance criterion — get this right the first time, since app-store review cycles are slow to iterate against).
2. No new event schema; emits install/sync events via Telemetry.
3. No queue contract needed (synchronous OAuth/webhook handling).
4. Define telemetry requirements: OAuth install events, webhook-handling success rate.
5. Implement the GeoViz-side service: OAuth install registers a `LayerInstall` row (reused from Visibility Layer, same as WordPress Plugin); sync reflects latest audit/Fix data.
6. No new Prisma model — reuses `LayerInstall`.
7. Build a flag-gated route/skeleton if any GeoViz-side merchant-facing settings UI is needed.
8. Write a test plan: OAuth install registers a `LayerInstall` row; `app/uninstalled` and GDPR erasure webhooks are handled correctly (test against Shopify's own webhook test fixtures if available); sync reflects latest data.
9. Define a rollout plan: do not start engineering until WordPress Plugin has shipped and proven the install-driven attach-rate thesis — per the resolved build-order conflict in `docs/MODULE_BUILD_ORDER.md`, this is a recommended-start-Stage-4–5, required-by-Stage-6 module; starting earlier is not prohibited but is lower priority than every Stage 4 item above it.
10. Define success metrics: same shape as WordPress Plugin (install count, activation-vs-audit-volume ratio), benchmarked against WordPress's actual numbers once live.

**Key risks:**
- Stricter OAuth/webhook/app-review requirements than WordPress (6–9 weeks vs. 5–7, per the PRD's own estimate) for a smaller relevant segment of GeoViz's local-service customer base — real risk of over-investing here before WordPress data justifies it.
- The Shopify app codebase (likely Remix) is a separate deliverable outside this repo, same project-management risk noted for WordPress Plugin.

**Do not start until:** Stage 4–5 recommended, Stage 6 required — and not before WordPress Plugin ships — per `docs/MODULE_BUILD_ORDER.md`.

---

## 12. Competitor Intelligence

**Current state:** scaffolded — `src/modules/competitor-intelligence/README.md` + `contracts.ts` (`CompetitorSet`, `CompetitorIntelligenceService`, implements `CompetitorTracker` from `src/lib/v2/contracts.ts:76`) + `page.skeleton.tsx` + flag-gated route at `src/app/(future)/competitor-intelligence/page.tsx`.

**Steps:**
1. Define the API contract for the `compare()` operation (dashboard-facing).
2. No new event schema; consumes AI Answer Sampling output.
3. No queue contract needed (request/response comparison, not queue-driven).
4. Define telemetry requirements: comparison-request volume, competitor-set size distribution.
5. Implement `CompetitorIntelligenceService`: every delta returned by `compare()` must include a human-readable reason string (a named acceptance criterion — no bare numbers); share-of-citation must sum sensibly across the defined competitor set.
6. Promote the embedded `CompetitorSet` Prisma proposal to a real migration.
7. Build the real dashboard on the existing `page.skeleton.tsx`.
8. Write a test plan: every `compare()` delta includes a non-empty reason string; share-of-citation sums correctly for a fixture competitor set.
9. Define a rollout plan: priced and shipped as a Monitoring add-on per board decision — do not launch as a standalone product line, which would fragment the retention story.
10. Define success metrics: add-on attach rate among Monitoring subscribers, correlation between competitor-comparison usage and retention (customer research already suggests this is a stronger lever than absolute score — this metric tests that hypothesis directly).

**Key risks:**
- Explicit permanent boundary (ties to North Star): not a scraper of competitor private data — implementation must stay within already-public AI-answer content; any temptation to scrape a competitor's site directly is out of scope.
- Depends on Monitoring being stable first (per `MODULE_DEPENDENCY_GRAPH.md`'s explicit note: "do not start before Stage 4's Monitoring v2 is proven") — starting early risks building against an unstable foundation.

**Do not start until:** Stage 5, after Monitoring is stable — per `docs/MODULE_BUILD_ORDER.md`.

---

## 13. Enterprise

**Current state:** scaffolded — `src/modules/enterprise/README.md` + `contracts.ts` (`EnterpriseAccount`, `EnterpriseLocation`, `RbacGrant`, `EnterpriseService`) + `page.skeleton.tsx` + flag-gated route at `src/app/(future)/enterprise/page.tsx`. Dedicated spec: `docs/enterprise/ENTERPRISE_SPEC.md`.

**Steps:**
1. Define the API contract (bulk onboarding, RBAC-scoped read endpoints).
2. No new event schema of its own; consumes Monitoring/Change Detection/Alerts events for its audit trail.
3. No queue contract needed for v1 core (bulk ingestion is batch, not queue-driven).
4. Define telemetry requirements: RBAC-grant usage, bulk-onboarding volume, SLA-relevant uptime/alert-latency metrics.
5. Implement `EnterpriseService`: a regional-manager-scoped RBAC grant must never return data outside its assigned locations (the single highest-stakes acceptance criterion in the whole 14-module set — a violation here is a real customer-data breach for a multi-location enterprise account); bulk onboarding of N hostnames must create N properly-linked location rows; every score/alert/change event must be traceable via the audit trail to its source and methodology version.
6. Promote the embedded `EnterpriseAccount`/`EnterpriseLocation`/`RbacGrant` Prisma proposal to a real migration — deliberately not shared with Agency Platform's lighter-weight model, per both modules' Non-Goals.
7. Build the real console on the existing `page.skeleton.tsx`.
8. Write a test plan: RBAC-boundary fixture (regional manager scoped to region A never sees region B's data, exhaustively, not just spot-checked); bulk onboarding creates correctly-linked rows; every audit-trail entry resolves to a source and methodology version.
9. Kick off the SOC 2 Type II compliance program in parallel with engineering — it's an XL-complexity item in its own right (per `docs/strategy/10_BACKLOG.md` I4) and has its own long lead time independent of feature completion.
10. Define a rollout plan: per the PRD, this ships only after readiness criteria are demonstrably met — "never sold from a roadmap slide." No enterprise contract should be signed against a target date this module hasn't actually reached.
11. Define success metrics: enterprise ACV, location-count scaling, SOC 2 audit pass, zero RBAC-boundary violations in any audit.

**Key risks:**
- The largest single-module engineering estimate in the roadmap (10–14 weeks) plus a separate, slow-moving SOC 2 program — schedule risk compounds here more than anywhere else in the 14-module set.
- An RBAC bug here is categorically worse than in Agency Platform: enterprise customers are franchises/multi-location businesses with real competitive and legal sensitivity about cross-location data leakage.
- Moat contribution is rated Low *directly* (compliance/RBAC is table stakes, not proprietary) — the temptation to over-invest here relative to its direct moat value should be checked against `docs/strategy/00_NORTH_STAR.md`'s moat filter before committing resources.

**Do not start until:** Stage 5, after Monitoring and Visibility Layer are live — per `docs/MODULE_BUILD_ORDER.md`.

---

## 14. Data Licensing

**Current state:** scaffolded — `src/modules/data-licensing/README.md` + `contracts.ts` (`LicenseAgreement`, `LicenseDeliveryLog`, `DataLicensingService`), flag `GEO_MODULE_DATA_LICENSING_ENABLED`, no route. Dedicated spec: `docs/licensing/DATA_LICENSING_SPEC.md`.

**Steps:**
1. Define the delivery API/export contract for licensees.
2. No new event schema; consumes Benchmark Engine/Cohort Analysis output.
3. No queue contract needed for v1 (manual deals + batch export, per the PRD's own v1 scope).
4. Define telemetry requirements: delivery volume, license-term compliance monitoring.
5. Implement `DataLicensingService`: no delivered dataset may include a cohort below the minimum sample-size floor (re-enforcing Cohort Analysis's gate at the delivery boundary, not just the source); every delivery is logged with the exact methodology version delivered; license-term violations must be detectable from the delivery log.
6. Promote the embedded `LicenseAgreement`/`LicenseDeliveryLog` Prisma proposal to a real migration.
7. No customer-facing route needed for v1 (manual deals, not self-serve).
8. Write a test plan: a below-floor cohort is rejected at the delivery boundary even if it somehow passed Cohort Analysis's gate (defense in depth); every delivery log entry records the correct methodology version; a simulated license-term violation is detectable from the log.
9. Define a rollout plan: this is explicitly the last module greenlit in the roadmap — do not begin engineering work speculatively even if an early inbound licensing inquiry appears, per the module's own PRD Dependencies note.
10. Define success metrics: revenue per licensee ($50K–500K/yr target), zero sample-size-floor violations across all deliveries, zero undetected license-term violations.

**Key risks:**
- The clearest test of whether the "data moat" thesis is real — if buyers won't pay for licensed access once this ships, it's evidence the whole compounding-data-asset strategy needs re-examination, not just this module.
- Legal/compliance surface (license terms, anonymization guarantees, no individual-business reconstruction from aggregated data) is unusually high for this codebase — will likely need real legal review beyond what any other module requires.

**Do not start until:** Stage 6, after Benchmark Engine and Cohort Analysis have years of governed history — per `docs/MODULE_BUILD_ORDER.md` and the module's own PRD, which explicitly says "do not start early."

---

## Cross-cutting note on API contracts

Every module above lists "define API contract" as step 1. None of the 14 has one today (`docs/FUTURE_MODULE_GAP_REPORT.md`). Rather than writing 14 speculative contracts now — which would go stale before any of them is greenlit and risks specifying implementation detail ahead of the "no production behavior yet" boundary — this playbook treats contract authorship as the first real step of each module's eventual build, done immediately before that module's engineering work starts, not during this documentation pass.
