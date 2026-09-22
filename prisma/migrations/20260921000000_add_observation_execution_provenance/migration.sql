-- AddColumn Observation.executionMode/country/searchRegion (all nullable, no default)
-- Provenance fields for the AI validator capture layer. executionMode is
-- populated going forward ("live" | "fixture", fixture test-only); country
-- and searchRegion are reserved for a future geo-targeted query capability
-- that does not exist yet. Historic rows stay null on all three.
ALTER TABLE "Observation" ADD COLUMN "executionMode" TEXT;
ALTER TABLE "Observation" ADD COLUMN "country" TEXT;
ALTER TABLE "Observation" ADD COLUMN "searchRegion" TEXT;
