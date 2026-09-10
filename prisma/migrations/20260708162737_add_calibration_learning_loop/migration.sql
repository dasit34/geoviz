-- CreateTable
CREATE TABLE "AuditSnapshot" (
    "id" TEXT NOT NULL,
    "auditOrderId" TEXT NOT NULL,
    "businessName" TEXT,
    "websiteUrl" TEXT NOT NULL,
    "industryNormalized" TEXT,
    "overallScore" INTEGER,
    "categoryScores" JSONB NOT NULL,
    "confidenceLevel" TEXT,
    "modelAgreement" TEXT,
    "costUsd" DECIMAL(10,6),
    "runtimeMs" INTEGER,
    "topFindingIds" JSONB NOT NULL,
    "topRecommendationIds" JSONB NOT NULL,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "needsReviewReasons" JSONB NOT NULL,
    "reviewResolvedAt" TIMESTAMP(3),
    "calibrationBatchNumber" INTEGER,
    "scoringVersion" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationBatch" (
    "id" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "batchSize" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "avgScore" DOUBLE PRECISION,
    "medianScore" DOUBLE PRECISION,
    "industryDistribution" JSONB NOT NULL,
    "categoryDistribution" JSONB NOT NULL,
    "avgRuntimeMs" INTEGER,
    "avgCostUsd" DECIMAL(10,6),
    "recommendationFrequency" JSONB NOT NULL,
    "modelAgreementPct" DOUBLE PRECISION,
    "confidenceDistribution" JSONB NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "outlierAuditIds" JSONB NOT NULL,
    "needsReviewCount" INTEGER NOT NULL DEFAULT 0,
    "reportPath" TEXT,

    CONSTRAINT "CalibrationBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationFrequency" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "industry" TEXT,
    "timesGenerated" INTEGER NOT NULL,
    "avgScore" DOUBLE PRECISION,
    "avgConfidence" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecommendationFrequency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryBenchmarks" (
    "id" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "auditCount" INTEGER NOT NULL,
    "avgScore" DOUBLE PRECISION,
    "medianScore" DOUBLE PRECISION,
    "bestScore" INTEGER,
    "worstScore" INTEGER,
    "topWeakCategories" JSONB NOT NULL,
    "topRecommendedFixes" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryBenchmarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditSnapshot_auditOrderId_idx" ON "AuditSnapshot"("auditOrderId");

-- CreateIndex
CREATE INDEX "AuditSnapshot_snapshotAt_idx" ON "AuditSnapshot"("snapshotAt");

-- CreateIndex
CREATE INDEX "AuditSnapshot_calibrationBatchNumber_idx" ON "AuditSnapshot"("calibrationBatchNumber");

-- CreateIndex
CREATE INDEX "AuditSnapshot_websiteUrl_idx" ON "AuditSnapshot"("websiteUrl");

-- CreateIndex
CREATE INDEX "AuditSnapshot_needsReview_idx" ON "AuditSnapshot"("needsReview");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationBatch_batchNumber_key" ON "CalibrationBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "CalibrationBatch_computedAt_idx" ON "CalibrationBatch"("computedAt");

-- CreateIndex
CREATE INDEX "RecommendationFrequency_industry_idx" ON "RecommendationFrequency"("industry");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationFrequency_recommendationId_industry_key" ON "RecommendationFrequency"("recommendationId", "industry");

-- CreateIndex
CREATE UNIQUE INDEX "IndustryBenchmarks_industry_key" ON "IndustryBenchmarks"("industry");

-- AddForeignKey
ALTER TABLE "AuditSnapshot" ADD CONSTRAINT "AuditSnapshot_auditOrderId_fkey" FOREIGN KEY ("auditOrderId") REFERENCES "AuditOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
