-- ObservationHistory — append-only history of observation-layer runs.
--
-- One row per `executeObservation()` invocation that lands through
-- the gate. NEVER updated, NEVER overwritten by application code —
-- to revise, insert a new row. Stamps the deterministic scoring
-- hashes (`weightHash` + `categoryHash`) at write time so an
-- analyst can prove scoring was unchanged when this row was
-- written.
--
-- Backwards compatible: purely additive new table + foreign key +
-- two indexes. No ALTER on existing columns, no DROP, no data
-- migration. Postgres performs CREATE TABLE instantly without
-- locking the parent.
--
-- Rollback:
--   DROP TABLE "ObservationHistory";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260524000000_add_observation_history';

CREATE TABLE "ObservationHistory" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "providerCount" INTEGER NOT NULL,
    "agreementScore" INTEGER NOT NULL,
    "variance" DOUBLE PRECISION NOT NULL,
    "observationStatus" TEXT NOT NULL,
    "providerNames" JSONB NOT NULL,
    "estimatedCost" DECIMAL(10,6) NOT NULL,
    "avgLatency" INTEGER NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "weightHash" TEXT NOT NULL,
    "categoryHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ObservationHistory_auditId_idx" ON "ObservationHistory"("auditId");
CREATE INDEX "ObservationHistory_createdAt_idx" ON "ObservationHistory"("createdAt");

ALTER TABLE "ObservationHistory"
    ADD CONSTRAINT "ObservationHistory_auditId_fkey"
    FOREIGN KEY ("auditId") REFERENCES "AuditOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
