-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "businessNameNormalized" TEXT NOT NULL,
    "website" TEXT,
    "domain" TEXT,
    "phoneNormalized" TEXT,
    "addressNormalized" TEXT,
    "category" TEXT,
    "city" TEXT,
    "state" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "contactName" TEXT,
    "contactTitle" TEXT,
    "contactEmail" TEXT,
    "contactSource" TEXT,
    "qualificationScore" INTEGER,
    "qualificationReasons" JSONB,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),
    "enrichedAt" TIMESTAMP(3),
    "contactedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "businessId" TEXT,
    "freeCheckSubmissionId" TEXT,
    "auditOrderId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadSourceRef" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadSourceRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadDiscoveryRun" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "radiusMiles" INTEGER,
    "requestedCount" INTEGER NOT NULL,
    "providerRequestCount" INTEGER,
    "resultCount" INTEGER,
    "estimatedCostUsd" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadDiscoveryRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_domain_idx" ON "Lead"("domain");

-- CreateIndex
CREATE INDEX "Lead_phoneNormalized_idx" ON "Lead"("phoneNormalized");

-- CreateIndex
CREATE INDEX "Lead_category_idx" ON "Lead"("category");

-- CreateIndex
CREATE INDEX "Lead_city_idx" ON "Lead"("city");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadSourceRef_provider_providerId_key" ON "LeadSourceRef"("provider", "providerId");

-- CreateIndex
CREATE INDEX "LeadSourceRef_leadId_idx" ON "LeadSourceRef"("leadId");

-- CreateIndex
CREATE INDEX "LeadDiscoveryRun_createdAt_idx" ON "LeadDiscoveryRun"("createdAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_freeCheckSubmissionId_fkey" FOREIGN KEY ("freeCheckSubmissionId") REFERENCES "FreeCheckSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_auditOrderId_fkey" FOREIGN KEY ("auditOrderId") REFERENCES "AuditOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSourceRef" ADD CONSTRAINT "LeadSourceRef_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
