# GeoViz — Future Architecture Inventory

Status: SNAPSHOT (regenerate after any future-module scaffolding change; this is not a living doc that self-updates). Covers the 14 `src/modules/` scaffolds added in `91b87aa "Scaffold 5-year product architecture around the frozen MVP core"`. Verifies presence/absence of the asset checklist requested for the pre-launch future-architecture pass — it does not restate any document's content, only points to it.

**Companion docs:** missing/partial items only → `docs/FUTURE_MODULE_GAP_REPORT.md`. Per-module future steps → `docs/MODULE_IMPLEMENTATION_PLAYBOOKS.md`. Canonical build sequencing → `docs/MODULE_BUILD_ORDER.md`. What stays postponed and why → `docs/DO_NOT_BUILD_YET.md`.

## Legend

- ✅ Present and complete for this pass's purposes.
- ⚠️ Present but partial, embedded in another asset, or not applicable in v1 (see note).
- ❌ Missing — tracked in `FUTURE_MODULE_GAP_REPORT.md`.
- — Not applicable to this module (documented reason, not an oversight).

## Table A — Docs & product definition

| Module | README (`src/modules/*/README.md`) | PRD (`docs/prd/*.md`) | Dedicated tech spec | Risks section | Telemetry requirements (per-module) |
|---|---|---|---|---|---|
| Monitoring | ✅ | ✅ | ✅ `docs/monitoring/MONITORING_SPEC.md` | ❌ | ❌ |
| AI Answer Sampling | ✅ | ✅ | ❌ | ❌ | ❌ |
| Change Detection | ✅ | ✅ | ❌ | ❌ | ❌ |
| Alerts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Competitor Intelligence | ✅ | ✅ | ❌ | ❌ | ❌ |
| AI Visibility Layer | ✅ | ✅ | ✅ `docs/plugin/VISIBILITY_LAYER_SPEC.md` | ❌ | ❌ |
| WordPress Plugin | ✅ | ✅ | ❌ (covered partially by Visibility Layer spec) | ❌ | ❌ |
| Shopify Plugin | ✅ | ✅ | ❌ (covered partially by Visibility Layer spec) | ❌ | ❌ |
| Agency Platform | ✅ | ✅ | ✅ `docs/agency/AGENCY_PLATFORM_SPEC.md` | ❌ | ❌ |
| Benchmark Engine | ✅ | ✅ | ✅ `docs/benchmarking/BENCHMARK_ENGINE_SPEC.md` | ❌ | ❌ |
| Enterprise | ✅ | ✅ | ✅ `docs/enterprise/ENTERPRISE_SPEC.md` | ❌ | ❌ |
| Data Licensing | ✅ | ✅ | ✅ `docs/licensing/DATA_LICENSING_SPEC.md` | ❌ | ❌ |
| Telemetry | ✅ | ✅ | ❌ | ❌ | — (module *is* the telemetry seam; see PRD Non-Goals) |
| Cohort Analysis | ✅ | ✅ | ❌ | ❌ | ❌ |

PRD asset types confirmed present for all 14 (verified by direct read, uniform structure): Purpose, Revenue Model/Justification, User Stories, Acceptance Criteria, Non-Goals, Dependencies, Engineering Estimate, Moat Contribution. None of the 14 PRDs contains a Risks section or a per-module Telemetry Requirements section — this is a structural gap across the whole PRD template, not a per-module oversight.

## Table B — Contracts & data

| Module | TypeScript interfaces (`contracts.ts`) | API contract (per-module) | Event schema | Queue contract | DB/Prisma proposal |
|---|---|---|---|---|---|
| Monitoring | ✅ `MonitoringSubscription`, `MonitoringDashboardView`, `MonitoringService` | ❌ | — (composes other modules' events, defines none of its own) | ❌ (needed: v1 scheduled re-score job) | ⚠️ embedded, inert (`monitoring/contracts.ts:54-73`) |
| AI Answer Sampling | ✅ `AiAnswerSnapshot`, `AnswerSamplingService` | ❌ | ⚠️ `AiAnswerSnapshot` type exists; no versioned wire-format spec | ❌ (needed: scheduled sampling job) | ⚠️ embedded, inert (`ai-answer-sampling/contracts.ts:81-109`) |
| Change Detection | ✅ `ChangeEvent`, `ChangeDetectionService` | ❌ | ⚠️ `ChangeEvent` type exists; no versioned wire-format spec | ❌ (needed: scheduled diff job) | ⚠️ embedded, inert (`change-detection/contracts.ts:49-69`) |
| Alerts | ✅ `AlertNotification`, `AlertsService` | ❌ | ⚠️ `AlertNotification` type exists; no versioned wire-format spec | ❌ (needed: delivery queue) | ⚠️ embedded, inert (`alerts/contracts.ts:36-54`) |
| Competitor Intelligence | ✅ `CompetitorSet`, `CompetitorIntelligenceService` (implements `CompetitorTracker` from `src/lib/v2/contracts.ts:76`) | ❌ | — | — (request/response, not queue-driven) | ⚠️ embedded, inert (`competitor-intelligence/contracts.ts:53-66`) |
| AI Visibility Layer | ✅ `LayerInstall`, `VisibilityLayerService` | ❌ | — | — | ⚠️ embedded, inert (`visibility-layer/contracts.ts:54-73`) |
| WordPress Plugin | ✅ `WordPressPluginConfig` (reuses `LayerInstall`) | ❌ (PRD scopes this module *as* "the GeoViz-side API contract," not yet written) | — | — | ⚠️ embedded, inert (`wordpress-plugin/contracts.ts:34-50`) |
| Shopify Plugin | ✅ `ShopifyPluginConfig` | ❌ (same PRD framing as WordPress) | — | — | ⚠️ embedded, inert (`shopify-plugin/contracts.ts:36-51`) |
| Agency Platform | ✅ `AgencyAccount`, `AgencyClientLink`, `AgencyPlatformService` | ❌ | — | — | ⚠️ embedded, inert (`agency-platform/contracts.ts:49-72`) |
| Benchmark Engine | ✅ `PublishedBenchmark`, `BenchmarkEngineService` | ❌ | — | — | ⚠️ embedded, inert (`benchmark-engine/contracts.ts:42-62`) |
| Enterprise | ✅ `EnterpriseAccount`, `EnterpriseLocation`, `RbacGrant`, `EnterpriseService` | ❌ | — | — | ⚠️ embedded, inert (`enterprise/contracts.ts:67+`) |
| Data Licensing | ✅ `LicenseAgreement`, `LicenseDeliveryLog`, `DataLicensingService` | ❌ | — | — | ⚠️ embedded, inert (`data-licensing/contracts.ts:50-74`) |
| Telemetry | ✅ `TelemetryEvent`, `TelemetryService` | ❌ | ⚠️ `TelemetryEvent` type exists; no versioned wire-format spec | — (PRD Non-Goals: "not a real-time stream/queue system in v1 — an internal function call is sufficient") | ⚠️ embedded, inert (`telemetry/contracts.ts:46-65`) |
| Cohort Analysis | ✅ `CohortSnapshot`, `CohortAnalysisService` (implements `BenchmarkStore` from `src/lib/v2/contracts.ts`) | ❌ | — | — (periodic batch, not queue-driven per PRD) | ⚠️ embedded, inert (`cohort-analysis/contracts.ts:37-59`) |

No OpenAPI specs exist for any module; the only API doc in the repo is the general `docs/api/API_SPEC.md`, which does not cover per-module contracts. `src/lib/v2/contracts.ts` (170 lines, predates `src/modules/`) defines shared cross-module primitives (`VisibilitySnapshot`, `RecurringMonitor`, `CompetitorTracker`, `BenchmarkStore`, `CrawlerIntelligence`) that Competitor Intelligence, Monitoring, and Cohort Analysis explicitly implement against.

## Table C — Delivery & ops readiness

| Module | Feature flag (`.env.example`) | UI skeleton / route (`src/app/(future)/`) | Acceptance criteria | Test plan | Rollout plan | Success metrics | Implementation playbook |
|---|---|---|---|---|---|---|---|
| Monitoring | ✅ `GEO_MODULE_MONITORING_ENABLED` | ✅ `monitoring/page.tsx` | ✅ | ❌ | ❌ | ❌ | ✅ (see `MODULE_IMPLEMENTATION_PLAYBOOKS.md`) |
| AI Answer Sampling | ✅ `GEO_MODULE_AI_ANSWER_SAMPLING_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Change Detection | ✅ `GEO_MODULE_CHANGE_DETECTION_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Alerts | ✅ `GEO_MODULE_ALERTS_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Competitor Intelligence | ✅ `GEO_MODULE_COMPETITOR_INTELLIGENCE_ENABLED` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| AI Visibility Layer | ✅ `GEO_MODULE_VISIBILITY_LAYER_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| WordPress Plugin | ✅ `GEO_MODULE_WORDPRESS_PLUGIN_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Shopify Plugin | ✅ `GEO_MODULE_SHOPIFY_PLUGIN_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Agency Platform | ✅ `GEO_MODULE_AGENCY_PLATFORM_ENABLED` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Benchmark Engine | ✅ `GEO_MODULE_BENCHMARK_ENGINE_ENABLED` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Enterprise | ✅ `GEO_MODULE_ENTERPRISE_ENABLED` | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Data Licensing | ✅ `GEO_MODULE_DATA_LICENSING_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Telemetry | ✅ `GEO_MODULE_TELEMETRY_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Cohort Analysis | ✅ `GEO_MODULE_COHORT_ANALYSIS_ENABLED` | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |

All 14 flags confirmed in `.env.example` (lines ~95–116), default `"false"`. 5 of 14 (Monitoring, Competitor Intelligence, Agency Platform, Benchmark Engine, Enterprise) have a flag-gated route under `src/app/(future)/<slug>/page.tsx` that calls Next's `notFound()` unless the flag is `"true"` — none are linked from navigation, all verified isolated from the live app by `docs/architecture/SYSTEM_ARCHITECTURE.md`'s "V1-isolation guarantee."

## Dependencies (from `docs/MODULE_DEPENDENCY_GRAPH.md` — reference, not restated)

All 14 modules have Dependencies documented in their PRD and confirmed consistent with the layered graph in `MODULE_DEPENDENCY_GRAPH.md`. Not duplicated in this table — see that doc for the authoritative layering, and `MODULE_BUILD_ORDER.md` for the canonical recommended sequencing (which resolves one conflict between `MODULE_DEPENDENCY_GRAPH.md` and `FIVE_YEAR_EXECUTION_PLAN.md` on Shopify Plugin's target stage — see that doc).

## What NOT to build yet

Not tracked per-module in this inventory table — each PRD's Non-Goals section covers permanent-for-now scope boundaries, consolidated across all 14 modules in `docs/DO_NOT_BUILD_YET.md`, and distinguished there from `docs/strategy/00_NORTH_STAR.md`'s permanent "What GeoViz Will NEVER Become" list.
