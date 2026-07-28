-- CreateTable
CREATE TABLE "FreeCheckSubmission" (
    "id" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "failureReason" TEXT,
    "overallScore" INTEGER,
    "checks" JSONB,
    "strengths" JSONB,
    "problems" JSONB,
    "fixes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FreeCheckSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FreeCheckSubmission_email_idx" ON "FreeCheckSubmission"("email");

-- CreateIndex
CREATE INDEX "FreeCheckSubmission_createdAt_idx" ON "FreeCheckSubmission"("createdAt");
