-- CreateTable
CREATE TABLE "LeadOutreach" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerCampaignId" TEXT NOT NULL,
    "campaignName" TEXT,
    "providerLeadId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "lastProviderPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadOutreach_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadOutreach_leadId_idx" ON "LeadOutreach"("leadId");

-- CreateIndex
CREATE INDEX "LeadOutreach_status_idx" ON "LeadOutreach"("status");

-- CreateIndex
CREATE INDEX "LeadOutreach_providerCampaignId_idx" ON "LeadOutreach"("providerCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadOutreach_provider_providerCampaignId_leadId_key" ON "LeadOutreach"("provider", "providerCampaignId", "leadId");

-- AddForeignKey
ALTER TABLE "LeadOutreach" ADD CONSTRAINT "LeadOutreach_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
