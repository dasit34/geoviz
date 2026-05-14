-- V2 Stage 2 — Render intelligence (additive, all nullable)
--
-- Adds optional render-pass output columns to AuditIntelligence so a
-- post-audit headless render comparison can be persisted alongside
-- the V1 + V2 Stage 1 intelligence. Every column is nullable and
-- defaults to NULL on existing rows. No backfill, no data migration.
-- Render is disabled by default at runtime via `GEO_RENDER_ENABLED`,
-- so existing audits stay null until the operator opts in.

ALTER TABLE "AuditIntelligence"
  ADD COLUMN "renderDurationMs"          INTEGER,
  ADD COLUMN "renderedHtmlLength"        INTEGER,
  ADD COLUMN "renderedTextLength"        INTEGER,
  ADD COLUMN "renderedSchemaTypes"       JSONB,
  ADD COLUMN "hydrationDetected"         BOOLEAN,
  ADD COLUMN "blankShellRisk"            BOOLEAN,
  ADD COLUMN "clientOnlyContentDetected" BOOLEAN,
  ADD COLUMN "renderConfidence"          TEXT,
  ADD COLUMN "renderFailureReason"       TEXT,
  ADD COLUMN "rawTextLength"             INTEGER,
  ADD COLUMN "rawSchemaTypes"            JSONB,
  ADD COLUMN "schemaDeltaDetected"       BOOLEAN,
  ADD COLUMN "contentDeltaDetected"      BOOLEAN;
