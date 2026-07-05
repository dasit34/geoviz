# Moat Implementation (Technical)

Technical companion to `docs/strategy/03_DATA_MOAT.md` (business framing) and the top-level `docs/DATA_MOAT_STRATEGY.md` (synthesis). This doc tracks exactly which tables/fields constitute the moat and what's captured today vs. proposed.

## Captured today (V1, live)

| Field/table | Where | Moat role |
|---|---|---|
| `AuditIntelligence.rawSignalSnapshot` | live | Raw signal capture — the seed of everything downstream |
| `AuditIntelligence.scoreProvenance` | live | Per-dimension reasoning trace — labeled explainability data |
| `AuditIntelligence` operator-judgment fields (`operatorVerdict`, `benchmarkTag`, etc.) | live | Human QA-correction dataset — proprietary, byproduct of fulfillment discipline |
| `ObservationHistory` | live | Append-only, hash-stamped observation runs — proves scoring was unchanged when written |
| `CalibrationReplay` | live | Append-only replay history — proves historical audits are reproducible |

## Proposed (scaffolded, not built)

| Field/table | Module | Moat role |
|---|---|---|
| `AiAnswerSnapshot` | `ai-answer-sampling` | Ground-truth evidence layer — cannot be backfilled |
| `ChangeEvent` | `change-detection` | Installed-base change-detection dataset |
| `LayerInstall` / plugin telemetry | `visibility-layer`, `wordpress-plugin`, `shopify-plugin` | Real-distribution telemetry — requires actual install base, not just audit volume |
| `CohortSnapshot` | `cohort-analysis` | Versioned aggregation feeding benchmarks |
| `PublishedBenchmark` | `benchmark-engine` | The citable, licensable public asset |

## Capture points in the current pipeline

Raw signal capture happens once, at audit time, inside the existing worker pipeline (`scripts/geo-worker.ts` → `src/lib/intelligence/intelligenceIngest.ts`) — fail-soft, never blocking audit completion. Future capture points (`ai-answer-sampling`, `change-detection`, plugin telemetry) are designed to follow the same fail-soft pattern: a moat-data write failure must never break a customer-facing flow.

## What "captured today vs. proposed" means for prioritization

Every module's "Implementation Checklist" in its own README should list moat-data capture as an explicit checklist item, not an implied side effect — this is how `docs/strategy/03_DATA_MOAT.md`'s "capture from day one" principle stays enforced as new modules are built, not just aspirational.
