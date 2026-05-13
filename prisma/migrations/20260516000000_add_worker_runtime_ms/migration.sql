-- Migration: add_worker_runtime_ms
--
-- Phase 1.5 of the cost-telemetry pass — adds a single INTEGER
-- column capturing the worker's elapsedMs at audit completion (full
-- Anthropic API call + tool-use round-trips). Persisted as a
-- denormalized convenience so aggregate cost queries don't need to
-- subtract `reportGeneratedAt - reportStartedAt` in SQL on every
-- row.
--
-- All values nullable; no backfill. Historic rows stay NULL and the
-- admin UI handles that case (renders "Cost data unavailable for
-- this audit (CLI mode or pre-telemetry).").
--
-- Apply with: npx prisma migrate deploy

ALTER TABLE "AuditOrder"
  ADD COLUMN "workerRuntimeMs" INTEGER;
