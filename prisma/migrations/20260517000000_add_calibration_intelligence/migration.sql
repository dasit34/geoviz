-- Migration: add_calibration_intelligence
--
-- V2 calibration-intelligence layer. Adds four nullable columns to
-- AuditIntelligence so operators can systematically capture manual
-- judgment alongside the auto-derived signals. NOT machine learning;
-- pure structured operator memory.
--
--   operatorVerdict    — "accurate" | "slightly_high" | "too_high"
--                        | "slightly_low" | "too_low"
--   operatorConfidence — "high" | "medium" | "low"
--                        (distinct from the existing parser-derived
--                         `confidenceLevel` column; this is operator
--                         confidence in the score itself)
--   benchmarkTag       — "excellent_example" | "average_example"
--                        | "weak_example" | "edge_case"
--   calibrationNotes   — freeform operator memo for calibration
--                        context (distinct from the existing
--                        `operatorNotes` column)
--
-- Values are stored as TEXT (not Postgres enum) so the allowlist can
-- evolve in code without a schema migration. The lib module at
-- `src/lib/intelligence/calibration.ts` validates writes.
--
-- Apply with: npx prisma migrate deploy

ALTER TABLE "AuditIntelligence"
  ADD COLUMN "operatorVerdict"    TEXT,
  ADD COLUMN "operatorConfidence" TEXT,
  ADD COLUMN "benchmarkTag"       TEXT,
  ADD COLUMN "calibrationNotes"   TEXT;
