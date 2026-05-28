-- Cross-model consensus layer storage. Both columns nullable; populated
-- by audit-intelligence.ts when ENABLE_CONSENSUS_PIPELINE=true. Existing
-- rows remain untouched (null in both columns).
--
-- Down migration:
--   ALTER TABLE "AuditIntelligence"
--     DROP COLUMN "aiValidations",
--     DROP COLUMN "consensusIndex";

ALTER TABLE "AuditIntelligence"
  ADD COLUMN "aiValidations" JSONB,
  ADD COLUMN "consensusIndex" JSONB;
