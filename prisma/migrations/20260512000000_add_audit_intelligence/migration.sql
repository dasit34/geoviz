-- Migration: add_audit_intelligence
--
-- V2 data foundation table. One row per generated audit, written by
-- `scripts/geo-worker.ts` immediately after the customer report is
-- persisted (see `src/lib/audit-intelligence.ts`). NOT customer-facing.
--
-- Operator runs `npx prisma migrate deploy` against the Railway
-- database to apply. No data backfill — only forward-looking audits
-- populate this table.

-- CreateTable
CREATE TABLE "AuditIntelligence" (
    "id" TEXT NOT NULL,
    "auditOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Identity (denormalized for V2 query speed)
    "businessName" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "industryCategory" TEXT,
    "location" TEXT,
    "competitorUrl" TEXT,

    -- Scores — 0..100 normalized. NULL when rubric category wasn't
    -- parseable from the audit markdown.
    "overallScore" INTEGER,
    "semanticClarityScore" INTEGER,
    "crawlerAccessibilityScore" INTEGER,
    "trustSignalScore" INTEGER,
    "structuredIdentityScore" INTEGER,
    "recommendationReadinessScore" INTEGER,
    "renderabilityScore" INTEGER,

    -- Technical signals — V1 placeholders, V2 crawler will populate.
    "schemaDetected" BOOLEAN,
    "llmsTxtDetected" BOOLEAN,
    "robotsTxtDetected" BOOLEAN,
    "sitemapDetected" BOOLEAN,
    "mobileRenderOk" BOOLEAN,
    "pagesIndexable" BOOLEAN,

    -- Categorizations (jsonb)
    "aiReadabilityFlags" JSONB NOT NULL,
    "majorIssueCategories" JSONB NOT NULL,
    "majorFixCategories" JSONB NOT NULL,
    "topObservedStrengths" JSONB NOT NULL,
    "topObservedWeaknesses" JSONB NOT NULL,

    -- Calibration / versioning
    "confidenceLevel" TEXT NOT NULL,
    "auditEngineVersion" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "promptVersion" TEXT,
    "operatorReviewed" BOOLEAN NOT NULL DEFAULT false,
    "operatorNotes" TEXT,
    "rawSignalSnapshot" JSONB NOT NULL,

    CONSTRAINT "AuditIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditIntelligence_auditOrderId_key" ON "AuditIntelligence"("auditOrderId");

-- CreateIndex
CREATE INDEX "AuditIntelligence_createdAt_idx" ON "AuditIntelligence"("createdAt");

-- CreateIndex
CREATE INDEX "AuditIntelligence_websiteUrl_idx" ON "AuditIntelligence"("websiteUrl");

-- AddForeignKey
ALTER TABLE "AuditIntelligence" ADD CONSTRAINT "AuditIntelligence_auditOrderId_fkey" FOREIGN KEY ("auditOrderId") REFERENCES "AuditOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
