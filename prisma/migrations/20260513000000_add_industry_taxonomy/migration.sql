-- Migration: add_industry_taxonomy
--
-- V2 benchmarking foundation. Adds three columns to AuditIntelligence
-- so every audit can carry a normalized industry taxonomy alongside
-- the unnormalized raw value. Versioned so future taxonomy revisions
-- don't corrupt historic benchmark cohorts.
--
-- The pre-existing `industryCategory` column is left in place (always
-- null in V1) and marked deprecated in `prisma/schema.prisma`. A
-- later migration can drop it once we're confident no historic data
-- exists in it.
--
-- Apply on Railway with `npx prisma migrate deploy`. No backfill —
-- only forward-looking audits populate the new columns.

ALTER TABLE "AuditIntelligence"
  ADD COLUMN "industryCategoryRaw" TEXT,
  ADD COLUMN "industryCategoryNormalized" TEXT,
  ADD COLUMN "industryTaxonomyVersion" TEXT NOT NULL DEFAULT 'v1';
