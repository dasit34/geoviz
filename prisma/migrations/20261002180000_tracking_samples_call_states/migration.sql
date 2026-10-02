-- DropIndex
DROP INDEX "PromptRunResult_cycleId_trackedPromptId_provider_key";

-- AlterTable
ALTER TABLE "MonitoringCycle" ADD COLUMN     "estimatedCostUsd" DECIMAL(10,6),
ADD COLUMN     "samplesPerPrompt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unknownOutcomes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PromptRunResult" ADD COLUMN     "callState" TEXT NOT NULL DEFAULT 'completed',
ADD COLUMN     "configFingerprint" TEXT,
ADD COLUMN     "costSource" TEXT,
ADD COLUMN     "costUsd" DECIMAL(10,6),
ADD COLUMN     "extractorVersion" TEXT,
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "positionStatus" TEXT,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "providerRequestId" TEXT,
ADD COLUMN     "rawResponse" JSONB,
ADD COLUMN     "requestStartedAt" TIMESTAMP(3),
ADD COLUMN     "sampleIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "searchCalls" INTEGER,
ADD COLUMN     "searchSettings" JSONB;

-- CreateIndex
CREATE INDEX "PromptRunResult_callState_idx" ON "PromptRunResult"("callState");

-- CreateIndex
CREATE UNIQUE INDEX "PromptRunResult_cycleId_trackedPromptId_provider_sampleInde_key" ON "PromptRunResult"("cycleId", "trackedPromptId", "provider", "sampleIndex");


-- Backfill rows written before call states / samples existed (staging only;
-- these tables are not yet in Production).
UPDATE "PromptRunResult" SET "callState" = CASE "status" WHEN 'measured' THEN 'completed' WHEN 'pending' THEN 'pending' ELSE 'failed' END;
UPDATE "PromptRunResult" SET "positionStatus" = CASE
  WHEN "status" <> 'measured' THEN 'not_measured'
  WHEN "position" IS NOT NULL THEN 'ranked'
  ELSE 'no_ordered_list' END;
UPDATE "PromptRunResult" SET "promptVersion" = 'tracking-prompt@1.0.0' WHERE "promptVersion" IS NULL;
