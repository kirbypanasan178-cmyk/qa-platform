-- AlterTable
ALTER TABLE "Defect" ADD COLUMN     "githubOwner" TEXT,
ADD COLUMN     "githubRepo" TEXT;

-- CreateTable
CREATE TABLE "GitHubConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT true,
    "accountLogin" TEXT,
    "accountType" TEXT,
    "installationId" TEXT,
    "token" TEXT,
    "targetOwner" TEXT NOT NULL,
    "targetRepo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitHubConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GitHubConfig_projectId_key" ON "GitHubConfig"("projectId");

-- CreateIndex
CREATE INDEX "GitHubConfig_projectId_idx" ON "GitHubConfig"("projectId");

-- CreateIndex
CREATE INDEX "Defect_githubOwner_githubRepo_idx" ON "Defect"("githubOwner", "githubRepo");

-- AddForeignKey
ALTER TABLE "GitHubConfig" ADD CONSTRAINT "GitHubConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
