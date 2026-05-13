-- Migration: add_v2_intelligence_fields
--
-- V2 Stage 1 — Intelligence Stabilization. Adds 12 nullable columns
-- to AuditIntelligence so the new modular intelligence ingest layer
-- has somewhere to write. Pre-Stage-1 rows stay null on every field.
--
-- IMPORTANT — Stage 1 zero-behavior-change guarantee:
--   • No audit-engine code changes.
--   • No scoring change.
--   • No report-rendering change.
--   • New columns are read only by admin/operator surfaces (none of
--     which gate audit completion).
--   • Intelligence ingest runs AFTER audit save, wrapped in try/catch
--     in the existing persistAuditIntelligence path. A failure in any
--     ingest module → that audit's row gets null for the failed
--     module's columns; everything else still writes; audit + report
--     delivery are unaffected.
--
-- Apply with: npx prisma migrate deploy

ALTER TABLE "AuditIntelligence"
  ADD COLUMN "cmsDetected"         TEXT,
  ADD COLUMN "frameworkDetected"   TEXT,
  ADD COLUMN "schemaTypes"         JSONB,
  ADD COLUMN "aiReadabilityScore"  INTEGER,
  ADD COLUMN "contentDensity"      INTEGER,
  ADD COLUMN "renderRequired"      BOOLEAN,
  ADD COLUMN "renderAttempted"     BOOLEAN,
  ADD COLUMN "renderSuccessful"    BOOLEAN,
  ADD COLUMN "renderEngineVersion" TEXT,
  ADD COLUMN "benchmarkTags"       JSONB,
  ADD COLUMN "extractedEntities"   JSONB,
  ADD COLUMN "scoreProvenance"     JSONB;
