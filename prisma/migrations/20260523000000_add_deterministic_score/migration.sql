-- GeoViz deterministic scoring V1 (`scoring@1.0.0`).
--
-- Adds a single nullable JSONB column to AuditIntelligence to hold the
-- pure-TypeScript DeterministicScore output. New audits write this on
-- every persist; legacy rows stay NULL and the read-path resolver in
-- `src/lib/scoring/getCanonicalScore.ts` falls back to parsing the
-- markdown.
--
-- Backwards compatible: nullable column, existing rows default to NULL.
-- No data migration, no destructive change. Rollback is a single
-- `ALTER TABLE ... DROP COLUMN "deterministicScore"`.

ALTER TABLE "AuditIntelligence"
  ADD COLUMN "deterministicScore" JSONB;
