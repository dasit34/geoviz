-- AlterTable
ALTER TABLE "MonitoringCycle" ADD COLUMN     "questionSetId" TEXT,
ADD COLUMN     "questionSetVersion" INTEGER;

-- CreateTable
CREATE TABLE "TrackingQuestionSet" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "businessCategory" TEXT,
    "city" TEXT,
    "state" TEXT,
    "serviceArea" TEXT,
    "generatorVersion" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "activatedAt" TIMESTAMP(3),
    "firstMeasuredAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "TrackingQuestionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingQuestionSetItem" (
    "id" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "intent" TEXT NOT NULL,
    "rationale" TEXT,
    "trackedPromptId" TEXT,

    CONSTRAINT "TrackingQuestionSetItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProofExperiment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "improvementTaskId" TEXT NOT NULL,
    "questionSetId" TEXT NOT NULL,
    "questionSetVersion" INTEGER NOT NULL,
    "baselineCycleId" TEXT NOT NULL,
    "findingId" TEXT NOT NULL,
    "findingEvidence" JSONB NOT NULL,
    "expectedCategory" TEXT NOT NULL,
    "followUpCycleId" TEXT,
    "outcome" TEXT,
    "outcomeReason" TEXT,
    "outcomeVersion" TEXT,
    "assessment" JSONB,
    "assessedAt" TIMESTAMP(3),
    "isFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProofExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingQuestionSet_subscriptionId_status_idx" ON "TrackingQuestionSet"("subscriptionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingQuestionSet_subscriptionId_version_key" ON "TrackingQuestionSet"("subscriptionId", "version");

-- CreateIndex
CREATE INDEX "TrackingQuestionSetItem_questionSetId_position_idx" ON "TrackingQuestionSetItem"("questionSetId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingQuestionSetItem_questionSetId_normalizedText_key" ON "TrackingQuestionSetItem"("questionSetId", "normalizedText");

-- CreateIndex
CREATE UNIQUE INDEX "ProofExperiment_improvementTaskId_key" ON "ProofExperiment"("improvementTaskId");

-- CreateIndex
CREATE INDEX "ProofExperiment_subscriptionId_createdAt_idx" ON "ProofExperiment"("subscriptionId", "createdAt");

-- AddForeignKey
ALTER TABLE "TrackingQuestionSet" ADD CONSTRAINT "TrackingQuestionSet_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingQuestionSetItem" ADD CONSTRAINT "TrackingQuestionSetItem_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "TrackingQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofExperiment" ADD CONSTRAINT "ProofExperiment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MonitoringSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofExperiment" ADD CONSTRAINT "ProofExperiment_improvementTaskId_fkey" FOREIGN KEY ("improvementTaskId") REFERENCES "ImprovementTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProofExperiment" ADD CONSTRAINT "ProofExperiment_questionSetId_fkey" FOREIGN KEY ("questionSetId") REFERENCES "TrackingQuestionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

