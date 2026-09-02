-- AlterTable
ALTER TABLE "LeadDiscoveryRun" ADD COLUMN     "providerJobId" TEXT,
ADD COLUMN     "providerJobStatus" TEXT;

-- CreateIndex
CREATE INDEX "LeadDiscoveryRun_providerJobStatus_createdAt_idx" ON "LeadDiscoveryRun"("providerJobStatus", "createdAt");
