-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "contactAlternateEmails" JSONB,
ADD COLUMN     "contactSocials" JSONB,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "mapsUrl" TEXT,
ADD COLUMN     "zip" TEXT;

-- AlterTable
ALTER TABLE "LeadDiscoveryRun" ADD COLUMN     "errorCount" INTEGER,
ADD COLUMN     "errors" JSONB,
ADD COLUMN     "filteredOutCount" INTEGER,
ADD COLUMN     "matchedExistingCount" INTEGER,
ADD COLUMN     "newLeadsCreated" INTEGER;
