-- CalibrationReplay hash-lineage columns.
--
-- Adds the actual hash values stamped at the original audit time
-- alongside the existing match-flag booleans. Lets analysts query
-- patterns like "show all drift from rows stamped with
-- weight_hash=abc123" without re-running anything.
--
-- Both columns nullable — existing rows predate this capture
-- (intentional; they keep their Boolean match flags). New writes
-- via scripts/replay-audits.ts --persist populate from the
-- replayBundle.weight_hash / category_hash fields.
--
-- Backwards compatible: pure ADD COLUMN, both nullable, no data
-- migration. Postgres ALTER TABLE ADD COLUMN with no default is
-- O(1) — no table rewrite, no lock escalation.
--
-- Rollback:
--   ALTER TABLE "CalibrationReplay" DROP COLUMN "weightHashOriginal";
--   ALTER TABLE "CalibrationReplay" DROP COLUMN "categoryHashOriginal";
--   DELETE FROM "_prisma_migrations" WHERE migration_name = '20260530000000_add_replay_hash_lineage';

ALTER TABLE "CalibrationReplay"
    ADD COLUMN "weightHashOriginal" TEXT,
    ADD COLUMN "categoryHashOriginal" TEXT;
