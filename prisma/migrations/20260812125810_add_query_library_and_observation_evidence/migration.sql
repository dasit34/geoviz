-- CreateTable
CREATE TABLE "QueryLibraryEntry" (
    "id" TEXT NOT NULL,
    "queryText" TEXT NOT NULL,
    "normalizedQueryText" TEXT NOT NULL,
    "industryRaw" TEXT,
    "industryNormalized" TEXT NOT NULL DEFAULT 'unknown',
    "industryTaxonomyVersion" TEXT NOT NULL DEFAULT 'v1',
    "geographyRaw" TEXT NOT NULL DEFAULT 'unspecified',
    "geographyNormalized" TEXT,
    "intent" TEXT NOT NULL,
    "queryType" TEXT,
    "businessId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueryLibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "auditOrderId" TEXT NOT NULL,
    "businessId" TEXT,
    "queryLibraryEntryId" TEXT,
    "callType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "modelVersion" TEXT,
    "status" TEXT NOT NULL,
    "promptText" TEXT NOT NULL,
    "rawResponseText" TEXT NOT NULL,
    "mentioned" BOOLEAN,
    "recommended" BOOLEAN,
    "position" INTEGER,
    "sentiment" TEXT,
    "citations" JSONB NOT NULL,
    "citationDomains" JSONB NOT NULL,
    "extractedClaims" JSONB,
    "parserOutput" JSONB NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationCompetitorMention" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "competitorName" TEXT NOT NULL,
    "competitorNormalized" TEXT NOT NULL,
    "position" INTEGER,
    "wasRecommended" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationCompetitorMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueryLibraryEntry_businessId_idx" ON "QueryLibraryEntry"("businessId");

-- CreateIndex
CREATE INDEX "QueryLibraryEntry_industryNormalized_idx" ON "QueryLibraryEntry"("industryNormalized");

-- CreateIndex
CREATE INDEX "QueryLibraryEntry_geographyRaw_idx" ON "QueryLibraryEntry"("geographyRaw");

-- CreateIndex
CREATE INDEX "QueryLibraryEntry_intent_idx" ON "QueryLibraryEntry"("intent");

-- CreateIndex
CREATE INDEX "QueryLibraryEntry_isActive_idx" ON "QueryLibraryEntry"("isActive");

-- CreateIndex
CREATE INDEX "QueryLibraryEntry_createdAt_idx" ON "QueryLibraryEntry"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "QueryLibraryEntry_normalizedQueryText_industryNormalized_ge_key" ON "QueryLibraryEntry"("normalizedQueryText", "industryNormalized", "geographyRaw");

-- CreateIndex
CREATE INDEX "Observation_auditOrderId_idx" ON "Observation"("auditOrderId");

-- CreateIndex
CREATE INDEX "Observation_businessId_idx" ON "Observation"("businessId");

-- CreateIndex
CREATE INDEX "Observation_queryLibraryEntryId_idx" ON "Observation"("queryLibraryEntryId");

-- CreateIndex
CREATE INDEX "Observation_provider_idx" ON "Observation"("provider");

-- CreateIndex
CREATE INDEX "Observation_createdAt_idx" ON "Observation"("createdAt");

-- CreateIndex
CREATE INDEX "Observation_businessId_provider_createdAt_idx" ON "Observation"("businessId", "provider", "createdAt");

-- CreateIndex
CREATE INDEX "ObservationCompetitorMention_observationId_idx" ON "ObservationCompetitorMention"("observationId");

-- CreateIndex
CREATE INDEX "ObservationCompetitorMention_competitorNormalized_idx" ON "ObservationCompetitorMention"("competitorNormalized");

-- AddForeignKey
ALTER TABLE "QueryLibraryEntry" ADD CONSTRAINT "QueryLibraryEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_auditOrderId_fkey" FOREIGN KEY ("auditOrderId") REFERENCES "AuditOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_queryLibraryEntryId_fkey" FOREIGN KEY ("queryLibraryEntryId") REFERENCES "QueryLibraryEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationCompetitorMention" ADD CONSTRAINT "ObservationCompetitorMention_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
