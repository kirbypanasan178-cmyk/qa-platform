-- CreateEnum
CREATE TYPE "InvestigationClassification" AS ENUM ('APPLICATION_BUG', 'FLAKY_TEST', 'TEST_DEFECT', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('PENDING_REVIEW', 'CONFIRMED_BUG', 'RERUN_REQUESTED', 'TEST_DEFECT_MARKED', 'REJECTED');

-- CreateTable
CREATE TABLE "Investigation" (
    "id" TEXT NOT NULL,
    "testResultId" TEXT NOT NULL,
    "failureDetailId" TEXT,
    "classification" "InvestigationClassification" NOT NULL DEFAULT 'INCONCLUSIVE',
    "confidenceScore" INTEGER NOT NULL DEFAULT 50,
    "summary" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "detectedPatterns" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expectedResult" TEXT,
    "actualResult" TEXT,
    "apiResponses" JSONB,
    "executionLogs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "InvestigationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "adminNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestigationHistory" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "fromStatus" "InvestigationStatus" NOT NULL,
    "toStatus" "InvestigationStatus" NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestigationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Investigation_testResultId_key" ON "Investigation"("testResultId");

-- CreateIndex
CREATE INDEX "Investigation_classification_idx" ON "Investigation"("classification");

-- CreateIndex
CREATE INDEX "Investigation_status_idx" ON "Investigation"("status");

-- CreateIndex
CREATE INDEX "Investigation_createdAt_idx" ON "Investigation"("createdAt");

-- CreateIndex
CREATE INDEX "Investigation_failureDetailId_idx" ON "Investigation"("failureDetailId");

-- CreateIndex
CREATE INDEX "InvestigationHistory_investigationId_createdAt_idx" ON "InvestigationHistory"("investigationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_failureDetailId_fkey" FOREIGN KEY ("failureDetailId") REFERENCES "FailureDetail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestigationHistory" ADD CONSTRAINT "InvestigationHistory_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
