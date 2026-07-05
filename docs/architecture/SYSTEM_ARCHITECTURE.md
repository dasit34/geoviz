# System Architecture — GeoViz V1 + Future Modules

Cross-cutting architecture doc. Per-module detail lives in each `src/modules/<name>/README.md` + `contracts.ts` — this doc covers only what spans modules: boundaries, data flow, isolation guarantees, flag gating, and deployment topology.

## Module boundary diagram

```
┌─────────────────────────── FROZEN V1 CORE (bug fixes only) ───────────────────────────┐
│  Order form → Stripe → Worker queue (scripts/geo-worker.ts) → Scoring (src/lib/scoring)│
│  → Report rendering → Admin dashboard → Email (Resend)                                 │
│  Data: AuditOrder, AuditIntelligence, ObservationHistory, CalibrationReplay             │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                        │  read-only, via src/lib/v2/contracts.ts primitives
                                        ▼
┌─────────────────────────── src/lib/v2/contracts.ts (shared primitives) ───────────────┐
│  VisibilitySnapshot · VisibilityHistory · BenchmarkCohort · CompetitorComparison · ... │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                        ▼
┌─────────────────────────── src/modules/* (14 scaffolds, layered) ─────────────────────┐
│ Layer 0: ai-answer-sampling · telemetry · visibility-layer · cohort-analysis           │
│ Layer 1: change-detection · wordpress-plugin · shopify-plugin · benchmark-engine       │
│ Layer 2: alerts · agency-platform                                                       │
│ Layer 3: monitoring                                                                     │
│ Layer 4: competitor-intelligence · enterprise · data-licensing                          │
│ (full graph + rules: docs/MODULE_DEPENDENCY_GRAPH.md)                                  │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                        ▼
                    src/app/(future)/<slug>/page.tsx  (5 routes, flag-gated, 404 by default)
```

## Data flow rule

V1 → `src/lib/v2/contracts.ts` → `src/modules/*` is the only allowed direction. V1 code never imports from `src/modules/*`. `src/modules/*` never imports V1 runtime code (`scripts/geo-worker.ts`, `src/lib/scoring/*`, `src/lib/parse-report.ts`) — only the typed primitives in `src/lib/v2/contracts.ts`. This keeps the frozen core provably untouched by any future-module work.

## Cross-module import rule

A module in `src/modules/*` may import type-only declarations from a sibling module's `contracts.ts` **only** when it appears as a dependency in `docs/MODULE_DEPENDENCY_GRAPH.md`, and only in the direction that graph specifies (lower layer → higher layer, never reverse, never a cycle). No runtime code exists to import yet — when implementation begins, the same directional rule applies to the real service implementations.

## V1-isolation guarantee

Nothing under `src/modules/` or `src/app/(future)/` is reachable from the live app unless its `GEO_MODULE_*_ENABLED` flag is explicitly set to `"true"`. Every placeholder route calls Next's `notFound()` otherwise. No V1 route, component, or worker script imports anything from `src/modules/`. Verified by `npx tsc --noEmit` + a grep check (see `docs/POST_LAUNCH_BACKLOG.md`/plan verification steps) — not just a convention, an enforced check before merge.

## Feature-flag gating pattern

Matches the existing scattered convention (`process.env.GEO_X === "true"`, documented in `.env.example`) rather than introducing a central runtime registry — 14 flags doesn't justify a new abstraction. For discoverability, every flag is listed in one place below.

| Module | Flag | Gates |
|---|---|---|
| monitoring | `GEO_MODULE_MONITORING_ENABLED` | `/monitoring` placeholder route |
| competitor-intelligence | `GEO_MODULE_COMPETITOR_INTELLIGENCE_ENABLED` | `/competitor-intelligence` placeholder route |
| visibility-layer | `GEO_MODULE_VISIBILITY_LAYER_ENABLED` | future snippet-serving infra |
| wordpress-plugin | `GEO_MODULE_WORDPRESS_PLUGIN_ENABLED` | future plugin-facing API |
| shopify-plugin | `GEO_MODULE_SHOPIFY_PLUGIN_ENABLED` | future app-facing API |
| agency-platform | `GEO_MODULE_AGENCY_PLATFORM_ENABLED` | `/agency-platform` placeholder route |
| enterprise | `GEO_MODULE_ENTERPRISE_ENABLED` | `/enterprise` placeholder route |
| benchmark-engine | `GEO_MODULE_BENCHMARK_ENGINE_ENABLED` | `/benchmark-engine` placeholder route |
| data-licensing | `GEO_MODULE_DATA_LICENSING_ENABLED` | future delivery pipeline |
| ai-answer-sampling | `GEO_MODULE_AI_ANSWER_SAMPLING_ENABLED` | future scheduled sampling job |
| change-detection | `GEO_MODULE_CHANGE_DETECTION_ENABLED` | future scheduled diff job |
| alerts | `GEO_MODULE_ALERTS_ENABLED` | future alert delivery |
| telemetry | `GEO_MODULE_TELEMETRY_ENABLED` | future ingestion endpoint |
| cohort-analysis | `GEO_MODULE_COHORT_ANALYSIS_ENABLED` | future recomputation job |

## Deployment topology notes (forward-looking, not built)

- **Sampling-panel workers**: extend the existing worker-queue pattern in `scripts/geo-worker.ts` (atomic claim/poll loop) rather than a new queue system — `ai-answer-sampling` should look like another job type in the same worker, not a parallel infrastructure stack.
- **Plugin CDN**: `visibility-layer`'s snippet needs static-asset hosting with subresource integrity — a CDN concern, not an app-server concern; keep it decoupled from the Next.js deploy.
- **Telemetry ingestion**: starts as an internal function call (Stage 3–4), only becomes a real authenticated public endpoint once plugin telemetry needs external ingestion (Stage 4+) — don't build the public endpoint before there's a plugin calling it.

## Where deeper detail lives

Per-module engineering scaffold: `src/modules/<name>/README.md` + `contracts.ts`. Per-topic product spec: `docs/monitoring/`, `docs/plugin/`, `docs/agency/`, `docs/enterprise/`, `docs/api/`, `docs/licensing/`, `docs/benchmarking/`. Security/compliance baseline referenced by all of the above: `docs/security/SECURITY_BASELINE.md`.
