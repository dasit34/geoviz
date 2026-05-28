-- CalibrationReplay — append-only history of calibration replay runs.
--
-- One row per `scripts/replay-audits.ts --persist` execution against a
-- stored audit. NEVER updated, NEVER overwritten by application code —
-- to revise, insert a new row. Records the headline delta + drift
-- status plus optional drill-down payload (per-category deltas,
-- changed findings) so operators can audit calibration over time
-- without re-running the (expensive) audit pipeline.
--
-- Mirrors the ObservationHistory pattern (migration
-- 20260524000000_add_observation_history): cuid PK, indexed auditId +
-- createdAt, foreign-key cascade. Adds a third index on replayStatus
-- for the cockpit's filter pills.
--
-- Backwards compatible: purely additive new table + foreign key +
-- three indexes. No ALTER on existing columns, no DROP, no data
-- migration. Postgres performs CREATE TABLE instantly without locking
-- the parent.
--
-- Rollback:
--   DROP TABLE "CalibrationReplay";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260529000000_add_calibration_replay';

CREATE TABLE "CalibrationReplay" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "originalScore" INTEGER,
    "recalculatedScore" INTEGER,
    "delta" INTEGER,
    "previousBand" TEXT,
    "currentBand" TEXT,
    "bandChanged" BOOLEAN NOT NULL DEFAULT false,
    "replayStatus" TEXT NOT NULL,
    "runtimeMs" INTEGER NOT NULL,
    "replayMode" TEXT NOT NULL,
    "scoringVersion" TEXT,
    "weightHashMatch" BOOLEAN,
    "categoryHashMatch" BOOLEAN,
    "categoryDeltas" JSONB,
    "changedFindings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationReplay_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalibrationReplay_auditId_idx" ON "CalibrationReplay"("auditId");
CREATE INDEX "CalibrationReplay_createdAt_idx" ON "CalibrationReplay"("createdAt");
CREATE INDEX "CalibrationReplay_replayStatus_idx" ON "CalibrationReplay"("replayStatus");

ALTER TABLE "CalibrationReplay"
    ADD CONSTRAINT "CalibrationReplay_auditId_fkey"
    FOREIGN KEY ("auditId") REFERENCES "AuditOrder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
