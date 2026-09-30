# GeoViz — Future Module Gap Report

Status: SNAPSHOT, derived from `docs/FUTURE_ARCHITECTURE_INVENTORY.md`. Lists only the ⚠️/❌ cells from that inventory — nothing that already exists is restated here. Each line is tagged with where it gets closed.

## Cross-cutting gaps (apply to all 14 modules identically)

- **No per-module API contract.** Only one general `docs/api/API_SPEC.md` exists; no module has its own request/response contract doc. → `MODULE_IMPLEMENTATION_PLAYBOOKS.md` (playbook step, all 14).
- **No Risks section in any PRD.** The PRD template (`docs/prd/*.md`) has no Risks field. → `MODULE_IMPLEMENTATION_PLAYBOOKS.md` ("Key risks" per module, closes this without editing the 14 PRD files).
- **No per-module Telemetry Requirements.** Distinct from the Telemetry *module* itself (which has a PRD). No module specifies what it should emit to Telemetry once built. → `MODULE_IMPLEMENTATION_PLAYBOOKS.md` (playbook step, all 14).
- **No Test Plan for any module.** → `MODULE_IMPLEMENTATION_PLAYBOOKS.md` (playbook step, all 14).
- **No Rollout Plan for any module** (flag-flip criteria, phased cohort, kill-switch). → `MODULE_IMPLEMENTATION_PLAYBOOKS.md` (playbook step, all 14).
- **No Success Metrics for any module.** Revenue targets exist in each PRD's Revenue Model, but no activation/retention/engagement metric is defined. → `MODULE_IMPLEMENTATION_PLAYBOOKS.md` (playbook step, all 14).
- **No Implementation Playbook for any module.** → closed in full by `MODULE_IMPLEMENTATION_PLAYBOOKS.md` (this pass).
- **DB/Prisma proposals are embedded-only**, not standalone reviewable docs (inert comment blocks in each `contracts.ts`, guarded by `__ProposedPrismaModelDocOnly = never`). Judged acceptable as-is — not treated as a gap requiring a new file, since promoting these to real migrations is itself a playbook step, not a documentation gap. → noted, no action this pass.

## Per-module gaps

**Monitoring** — has the deepest existing coverage (dedicated spec + route). Missing: per-module API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics, Queue contract (v1 needs a scheduled re-score job — no contract defined). → all → playbook.

**AI Answer Sampling** — no route/skeleton (documented choice this pass, not built — see Scope Decision in the approved plan). Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics, Queue contract (scheduled sampling job). Event schema exists only as a bare TS type (`AiAnswerSnapshot`), no versioned wire format. → all → playbook; route → noted as deferred code gap, not built this pass.

**Change Detection** — no route/skeleton. Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics, Queue contract (scheduled diff job). Event schema (`ChangeEvent`) is TS-only. → playbook; route deferred.

**Alerts** — no route/skeleton. Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics, Queue contract (delivery queue). Event schema (`AlertNotification`) is TS-only. → playbook; route deferred.

**Competitor Intelligence** — has a route/skeleton already. Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics. Queue contract correctly N/A (request/response, not queue-driven). → playbook.

**AI Visibility Layer** — has a dedicated spec, no route/skeleton. Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics. → playbook; route deferred.

**WordPress Plugin** — no route/skeleton, no dedicated spec (only PRD + partial coverage inside the Visibility Layer spec). Missing: the module's own API contract (its PRD explicitly scopes the module *as* "the GeoViz-side API contract" — not yet written despite being the module's whole purpose), Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics. → playbook; route deferred.

**Shopify Plugin** — same gap shape as WordPress Plugin. Additionally: its target build stage conflicts between two existing docs (see "Build-order conflict" below). → playbook; route deferred; sequencing → `MODULE_BUILD_ORDER.md`.

**Agency Platform** — has a dedicated spec + route/skeleton. Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics.

**Benchmark Engine** — has a dedicated spec + route/skeleton. Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics.

**Enterprise** — has a dedicated spec + route/skeleton. Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics.

**Data Licensing** — has a dedicated spec, no route/skeleton. Missing: API contract (delivery API), Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics. → playbook; route deferred.

**Telemetry** — no dedicated spec (module's PRD is its own spec, deliberately thin), no route/skeleton (correctly — it's a sink, not a customer-facing surface). Missing: API contract (ingestion contract), Risks, Test plan, Rollout plan, Success metrics. Per-module Telemetry Requirements correctly N/A (this module *is* the telemetry seam). Queue contract correctly N/A per its own PRD Non-Goals ("not a real-time stream/queue system in v1").

**Cohort Analysis** — no dedicated spec, no route/skeleton (correctly — internal aggregation, no customer-facing surface planned). Missing: API contract, Risks, Telemetry requirements, Test plan, Rollout plan, Success metrics.

## Build-order conflict (not an asset gap, a consistency issue)

`docs/MODULE_DEPENDENCY_GRAPH.md` gates Shopify Plugin at **Stage 6** ("if not already shipped"). `docs/FIVE_YEAR_EXECUTION_PLAN.md` ranks it **#12** in its single recommended sequence, placing it inside **Stage 4–5** — despite that document's own stated rule to "follow the dependency graph exactly." → resolved in `docs/MODULE_BUILD_ORDER.md`, with a one-line cross-reference added to both source docs pointing to it as the new canonical sequencing reference.

## Explicitly not a gap (verified present, no action needed)

README, PRD core sections (Purpose/Revenue/User Stories/Acceptance Criteria/Non-Goals/Dependencies/Engineering Estimate/Moat Contribution), TypeScript interfaces, feature flags — all ✅ for all 14 modules. See `FUTURE_ARCHITECTURE_INVENTORY.md` for file-level citations.
