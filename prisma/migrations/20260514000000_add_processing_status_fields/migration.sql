-- Migration: add_processing_status_fields
--
-- Operational state model — adds three columns to disambiguate
-- infrastructure failures from audit outcomes. The legacy
-- `reportStatus` column stays as the canonical state machine; these
-- new columns add the granular operator-facing category.
--
--   failureReason  TEXT       — operator reason code when reportStatus = 'failed'
--                                (e.g. "timeout", "fetch_failed",
--                                 "generation_failed", "robots_blocked",
--                                 "invalid_html", "render_failed",
--                                 "queue_interruption", "db_save_failed",
--                                 "spawn_failed", "empty_output",
--                                 "worker_exception", "cancelled").
--                                NULL when reportStatus is not 'failed'.
--
--   retryCount     INTEGER    — number of automatic retries attempted.
--                                Default 0. Incremented when a transient
--                                failure (timeout/fetch_failed/etc.) flips
--                                the row back to 'queued' instead of
--                                'failed', capped at MAX_AUTO_RETRIES (2).
--
--   lastRetryAt    TIMESTAMP  — timestamp of the most recent retry.
--                                NULL until the first retry fires.
--
-- See `src/lib/processing-status.ts` for the type taxonomy and the
-- derive helpers consumed by the worker + admin queue UI.
--
-- Apply with: npx prisma migrate deploy

ALTER TABLE "AuditOrder"
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastRetryAt" TIMESTAMP(3);
