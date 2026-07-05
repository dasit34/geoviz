# Data Warehouse — Design for Millions of Audits

## Principle

Never delete historical data. Every audit, re-score, sampled answer, and detected change is a permanent, timestamped, versioned record. This mirrors and extends the existing `ObservationHistory`/`CalibrationReplay` append-only pattern in `prisma/schema.prisma` — the warehouse design is "do what those two models already do, at 1,000x the row count."

## Fact tables (append-only, never updated)

- `AuditOrder` / `AuditIntelligence` (existing V1) — one row per audit.
- `ObservationHistory` / `CalibrationReplay` (existing V1) — one row per observation/replay run.
- `AiAnswerSnapshot` (proposed, `src/modules/ai-answer-sampling/contracts.ts`) — one row per sampled AI answer. The largest table by volume at scale; designed for it from day one.
- `ChangeEvent` (proposed, `src/modules/change-detection/contracts.ts`) — one row per detected diff.
- `TelemetryEvent` (proposed, `src/modules/telemetry/contracts.ts`) — one row per emitted event across every module.
- `AlertNotification` (proposed, `src/modules/alerts/contracts.ts`) — append-only except for the single mutable `engagementState` column.

## Retention policy

**Never delete.** Archival, not deletion, is the mechanism for managing table size at scale:
- Hot storage: last 12 months of `AiAnswerSnapshot`/`TelemetryEvent`/`ChangeEvent` rows, queried directly by product surfaces.
- Cold/archival storage: older rows move to cheaper storage (e.g., a columnar export) once volume justifies it — still queryable for benchmark/licensing purposes, just not on the hot query path.
- `CohortSnapshot` / `PublishedBenchmark` (versioned, derived tables) are never archived — they are the small, permanent record of what was published when, and are the actual liability-bearing data (see `docs/strategy/06_BENCHMARK_ENGINE.md` "Versioning").

## Partitioning strategy (forward-looking, not built)

Partition high-volume append-only tables (`AiAnswerSnapshot`, `TelemetryEvent`) by month once row counts justify it — this is a scaling concern to design for, not implement prematurely at launch-adjacent volume.

## PII boundaries

- `AiAnswerSnapshot`, `ChangeEvent`, `CohortSnapshot`, `PublishedBenchmark` contain business-facing data (hostnames, business names, public AI-answer text) — not end-consumer PII.
- `TelemetryEvent` explicitly excludes end-visitor tracking data (see `docs/plugin/VISIBILITY_LAYER_SPEC.md` "Privacy" — the Layer is not an analytics/tracking pixel).
- `EnterpriseAccount`/`RbacGrant` (proposed, `src/modules/enterprise/contracts.ts`) contain user-account data subject to standard access-control and deletion-on-request handling, distinct from the append-only evidence tables above.

## Relationship to existing V1 precedent

This warehouse design is additive to, not a replacement for, `AuditIntelligence`. New fact tables reference `AuditOrder`/`hostname` the same way `ObservationHistory` does today (`onDelete: Cascade` from the owning order where the relationship is order-scoped; standalone indexed `hostname` where the relationship spans multiple orders over time, as with Monitoring subscriptions).
