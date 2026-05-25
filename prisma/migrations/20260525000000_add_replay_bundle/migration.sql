-- Add a self-contained replay snapshot per audit so new audits are
-- byte-equal replayable through scoreAudit() even if any input column
-- (preflightSignals, ingest, render) later migrates.
--
-- Nullable, additive, no backfill. Historical rows stay NULL — only
-- new audits populate this column going forward.

ALTER TABLE "AuditIntelligence" ADD COLUMN "replayBundle" JSONB;
