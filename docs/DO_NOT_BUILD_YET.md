# GeoViz — Do Not Build Yet

Status: SNAPSHOT, consolidates each of the 14 modules' PRD Non-Goals plus their build-order gating into one scannable list. **Distinct from `docs/strategy/00_NORTH_STAR.md`'s "What GeoViz Will NEVER Become"** — that list is permanent scope exclusion (GeoViz will never become a CMS, never guarantee rankings, etc.). This list is temporary sequencing: every module here is already scaffolded, already has a PRD, and is expected to ship eventually — just not yet, and not without the signal named below.

Nothing in this document blocks anything already shipped or in progress on the frozen MVP. See `docs/MODULE_BUILD_ORDER.md` for the "Customer demand trigger" column this list draws from.

## The rule

Per `docs/strategy/10_BACKLOG.md`'s Backlog Usage Rules: no task from any future-module epic begins before Stage 1's exit criteria are met, except Epic A (MVP launch) itself. Every module below is additionally gated by its own dependency chain (`docs/MODULE_DEPENDENCY_GRAPH.md`) — being "not yet" doesn't mean "no PRD," it means "no engineering time until the trigger fires and the dependency chain is shipped."

## Postponed, per module

**AI Answer Sampling** — postponed until Stage 2–3. Non-Goal: not a scoring input, not a real-time system in v1 (scheduled/batch sampling only — CLAUDE.md's Scoring Freeze means this can never become a scoring input even later). Trigger: first Monitoring cohort needs evidence deeper than a bare re-score.

**Monitoring** — postponed until Stage 2. Non-Goal: not a competitor-comparison tool; v1 does not require Change Detection/Alerts (those are v2, Stage 4 — don't block Stage 2 revenue waiting for Stage 4 infrastructure). Trigger: validated demand for the pre-launch review's proposed re-audit upsell, converted into a subscription.

**Telemetry** — postponed until Stage 3–4. Non-Goal: not a real-time stream/queue system in v1 — an internal function call is sufficient until a plugin needs external ingestion; do not build the public endpoint before there's a plugin calling it. Trigger: the first of WordPress Plugin / Shopify Plugin / Agency Platform is about to ship.

**AI Visibility Layer** — postponed until Stage 4. Non-Goal: not a CMS or site builder (permanent, ties to North Star); not a write-capable mechanism beyond its own context block until the V3 approval-gated remediation stage. Trigger: Foundation Fix delivery volume creates repeat demand for a persistent (not one-time-manual) version of the same layer.

**Cohort Analysis** — postponed until Stage 3–4. Non-Goal: not a published-report renderer (Benchmark Engine's job); not a licensing/export tool. Trigger: per-vertical/geo audit volume crosses a statistically meaningful sample-size floor.

**Agency Platform** — postponed until Stage 3. Non-Goal: not the same RBAC implementation as Enterprise — deliberately lighter-weight; explicitly does not depend on Enterprise (don't build a shared RBAC abstraction before both are mature — the premature-abstraction failure mode this codebase already avoids once). Trigger: repeat inbound from agencies/consultants asking to manage a client book under one login.

**WordPress Plugin** — postponed until Stage 4. Non-Goal: the PHP plugin codebase itself is out of scope for this repo — only the GeoViz-side API contract is in scope, and even that hasn't been written yet (see gap report). Trigger: Visibility Layer v1 ships and customers ask for CMS-native install over a manual snippet.

**Change Detection** — postponed until Stage 4. Non-Goal: not a scoring mechanism (permanent — ties to the Scoring Constitution); not an alert-delivery mechanism. Trigger: Monitoring v1 churn data shows the "just a re-score" pattern the PRD names as the #1 risk.

**Benchmark Engine** — postponed until Stage 4. Non-Goal: not a per-customer comparison tool (Competitor Intelligence's job); not licensable data delivery (Data Licensing's job). Trigger: cohort density in a vertical/geo is enough to publish a credible, sample-size-gated benchmark.

**Alerts** — postponed until Stage 4. Non-Goal: not the change-detection logic itself; not a general-purpose notification system for non-visibility events. Trigger: Change Detection ships and churn risk is still measurably present.

**Shopify Plugin** — postponed until Stage 4–5 at the earliest, required by Stage 6 (see conflict resolution in `MODULE_BUILD_ORDER.md`). Non-Goal: the Shopify app codebase itself (likely Remix) is out of scope for this repo beyond the API contract. Trigger: WordPress Plugin proves the install-driven attach-rate thesis first, plus inbound demand from Shopify-segment customers.

**Competitor Intelligence** — postponed until Stage 5. Non-Goal: not a scraper of competitor private data — public AI-answer content only (permanent, ties to North Star's scope filter). Trigger: Monitoring subscribers repeatedly ask about named competitors (validated as a stronger retention lever than absolute score in customer research).

**Enterprise** — postponed until Stage 5. Non-Goal: not the same RBAC as Agency Platform; not a general-purpose site-management platform. Ships only after readiness criteria are demonstrably met — "never sold from a roadmap slide" per board consensus. Trigger: a real inbound multi-location/franchise prospect large enough to require RBAC + SOC 2, not a hypothetical one.

**Data Licensing** — postponed until Stage 6, explicitly the last module greenlit in the roadmap. Non-Goal: not a raw-data export tool — only ever licenses already-aggregated, already-governed output. Trigger: first inbound licensing inquiry once Benchmark Engine/Cohort Analysis have years of governed history — do not start early even if inbound interest appears sooner, per the module's own PRD.

## Permanent exclusions (cross-reference only, not restated)

See `docs/strategy/00_NORTH_STAR.md` → "What GeoViz Will NEVER Become" for the permanent list (traditional SEO tool, website builder/CMS, unapproved live-site changes, LLM-blended scoring, lead scraping, white-label reselling of someone else's methodology, overclaiming). Those items are not "not yet" — they are never, at any stage, regardless of customer demand.
