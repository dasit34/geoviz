# GeoViz — Module Dependency Graph

Canonical map of build-order dependencies across the 14 `src/modules/` scaffolds, and which module(s) must ship before each stage's exit criteria (`docs/strategy/01_FIVE_YEAR_ROADMAP.md`) can be met. Cross-reference `docs/architecture/SYSTEM_ARCHITECTURE.md` for the runtime/import rules that keep this graph acyclic.

## Layered build order

```
Layer 0 (foundational — no dependency on any other new module)
  ai-answer-sampling   telemetry   visibility-layer   cohort-analysis

Layer 1 (depend only on Layer 0)
  change-detection      ← ai-answer-sampling, visibility-layer
  wordpress-plugin      ← visibility-layer, telemetry
  shopify-plugin        ← visibility-layer, telemetry
  benchmark-engine      ← ai-answer-sampling, cohort-analysis

Layer 2 (depend on Layer 0–1)
  alerts                ← change-detection, ai-answer-sampling
  agency-platform       ← visibility-layer, telemetry   (deliberately NOT enterprise — see note below)

Layer 3 (depend on Layer 0–2)
  monitoring            ← ai-answer-sampling, change-detection, alerts

Layer 4 (depend on Layer 0–3)
  competitor-intelligence ← monitoring, ai-answer-sampling
  enterprise              ← monitoring, visibility-layer
  data-licensing          ← benchmark-engine, cohort-analysis
```

Rule: a module may only depend on modules in a lower layer. No cross-layer-same-tier dependencies, no cycles. `src/lib/v2/contracts.ts` sits below Layer 0 as the shared-primitives source every layer may import from directly.

## Deliberate non-dependencies (read before "helpfully" wiring these together)

- **`agency-platform` does NOT depend on `enterprise`.** They solve RBAC/multi-tenancy at different stages (Stage 3 vs. Stage 5) and different scales (agency book vs. 5,000-location franchise). Forcing a shared RBAC abstraction before both are mature is the premature-abstraction failure mode this codebase explicitly avoids (`src/modules/agency-platform/README.md`, `src/modules/enterprise/README.md`).
- **`monitoring` v1 does NOT require `change-detection`/`alerts`.** Stage 2's Monitoring launch needs only `ai-answer-sampling` (weekly re-score + evidence). `change-detection`/`alerts` are v2 additions that arrive at Stage 4 — don't block Stage 2 revenue waiting for Stage 4 infrastructure.
- **`competitor-intelligence` does NOT depend on `benchmark-engine`.** Competitor Intelligence is a per-customer comparison feature (Stage 5); Benchmark Engine is a published, aggregate, cohort-gated product (Stage 4–6). They both consume `ai-answer-sampling` independently.

## Which modules unlock each stage's exit criteria

| Stage (`strategy/01`) | Exit criteria requires these modules shipped | Notes |
|---|---|---|
| Stage 1 (Launch → $250K) | none — MVP only | No `src/modules/` work begins here. |
| Stage 2 ($250K → $1M) | `ai-answer-sampling` (pilot scale), `monitoring` (v1 only: re-score + evidence, no change-detection/alerts yet) | Monitoring NRR >90% is the exit gate; evidence-first design is the make-or-break bet. |
| Stage 3 ($1M → $5M) | `agency-platform`, `ai-answer-sampling` (scaled pilot), `cohort-analysis` (first 1,000-customer cohort) | Agency book >10% of revenue, no single partner >25%, sampling panel live for a meaningful subset. |
| Stage 4 ($5M → $10M) | `visibility-layer`, `wordpress-plugin`, `change-detection`, `alerts`, `benchmark-engine` (first published report) | Monitoring v2 (change-detection + alerts) ships here; plugin installed base becomes the distribution/telemetry moat. |
| Stage 5 ($10M → $25M) | `competitor-intelligence`, `enterprise` | Both depend on `monitoring` already being stable — do not start either before Stage 4's Monitoring v2 is proven. |
| Stage 6 ($25M → $100M) | `data-licensing`, `shopify-plugin` (if not already shipped), full `benchmark-engine` (recurring Index) | `data-licensing` is the last module to greenlight — it depends on `benchmark-engine`/`cohort-analysis` having years of governed history behind them. |

## How to read this graph during planning

Before starting work on any module, confirm every module in its dependency list is at least at "v1 shipped" status for the stage being targeted — not just "scaffolded." A scaffold (this pass) satisfies nothing about the dependency graph; it only means the seam exists for whoever builds the real thing.
