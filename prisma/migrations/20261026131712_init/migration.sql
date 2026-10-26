-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('PASSED', 'FAILED', 'PARTIAL', 'RUNNING');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('PASSED', 'FAILED', 'SKIPPED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncAction" AS ENUM ('CREATE', 'RETRY', 'COMMENT');

-- CreateEnum
CREATE TYPE "SyncEventStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repositoryUrl" TEXT NOT NULL,
    "apiKeyHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "runNumber" INTEGER,
    "branch" TEXT,
    "commitSha" TEXT,
    "environment" TEXT,
    "triggeredBy" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "totalTests" INTEGER NOT NULL DEFAULT 0,
    "passedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestResult" (
    "id" TEXT NOT NULL,
    "testRunId" TEXT NOT NULL,
    "suiteTitle" TEXT,
    "testTitle" TEXT NOT NULL,
    "specFile" TEXT NOT NULL,
    "role" TEXT,
    "status" "TestStatus" NOT NULL DEFAULT 'PASSED',
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureSignature" (
    "id" TEXT NOT NULL,
    "signatureHash" TEXT NOT NULL,
    "errorType" TEXT,
    "normalizedError" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FailureSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailureDetail" (
    "id" TEXT NOT NULL,
    "testResultId" TEXT NOT NULL,
    "failureSignatureId" TEXT NOT NULL,
    "rawErrorMessage" TEXT,
    "sanitizedErrorMessage" TEXT NOT NULL,
    "sanitizedStackTrace" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FailureDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Defect" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "failureSignatureId" TEXT NOT NULL,
    "githubIssueNumber" INTEGER,
    "githubIssueUrl" TEXT,
    "issueTitle" TEXT NOT NULL,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Defect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitHubSyncEvent" (
    "id" TEXT NOT NULL,
    "defectId" TEXT NOT NULL,
    "action" "SyncAction" NOT NULL DEFAULT 'CREATE',
    "status" "SyncEventStatus" NOT NULL,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitHubSyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_key_key" ON "Project"("key");

-- CreateIndex
CREATE INDEX "Project_key_idx" ON "Project"("key");

-- CreateIndex
CREATE UNIQUE INDEX "TestRun_idempotencyKey_key" ON "TestRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TestRun_projectId_createdAt_idx" ON "TestRun"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "TestRun_status_idx" ON "TestRun"("status");

-- CreateIndex
CREATE INDEX "TestRun_idempotencyKey_idx" ON "TestRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "TestResult_testRunId_idx" ON "TestResult"("testRunId");

-- CreateIndex
CREATE INDEX "TestResult_status_idx" ON "TestResult"("status");

-- CreateIndex
CREATE INDEX "TestResult_role_idx" ON "TestResult"("role");

-- CreateIndex
CREATE UNIQUE INDEX "FailureSignature_signatureHash_key" ON "FailureSignature"("signatureHash");

-- CreateIndex
CREATE INDEX "FailureSignature_signatureHash_idx" ON "FailureSignature"("signatureHash");

-- CreateIndex
CREATE INDEX "FailureSignature_lastSeenAt_idx" ON "FailureSignature"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "FailureDetail_testResultId_key" ON "FailureDetail"("testResultId");

-- CreateIndex
CREATE INDEX "FailureDetail_failureSignatureId_idx" ON "FailureDetail"("failureSignatureId");

-- CreateIndex
CREATE UNIQUE INDEX "Defect_failureSignatureId_key" ON "Defect"("failureSignatureId");

-- CreateIndex
CREATE INDEX "Defect_projectId_idx" ON "Defect"("projectId");

-- CreateIndex
CREATE INDEX "Defect_syncStatus_idx" ON "Defect"("syncStatus");

-- CreateIndex
CREATE INDEX "Defect_githubIssueNumber_idx" ON "Defect"("githubIssueNumber");

-- CreateIndex
CREATE INDEX "GitHubSyncEvent_defectId_attemptedAt_idx" ON "GitHubSyncEvent"("defectId", "attemptedAt");

-- AddForeignKey
ALTER TABLE "TestRun" ADD CONSTRAINT "TestRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_testRunId_fkey" FOREIGN KEY ("testRunId") REFERENCES "TestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureDetail" ADD CONSTRAINT "FailureDetail_testResultId_fkey" FOREIGN KEY ("testResultId") REFERENCES "TestResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FailureDetail" ADD CONSTRAINT "FailureDetail_failureSignatureId_fkey" FOREIGN KEY ("failureSignatureId") REFERENCES "FailureSignature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_failureSignatureId_fkey" FOREIGN KEY ("failureSignatureId") REFERENCES "FailureSignature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitHubSyncEvent" ADD CONSTRAINT "GitHubSyncEvent_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
