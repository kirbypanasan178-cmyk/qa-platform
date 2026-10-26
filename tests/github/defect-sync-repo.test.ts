import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrSyncDefect, retryDefectSync, DefectSyncError } from "@/lib/services/defect-sync";
import { GitHubClient, GitHubApiError } from "@/lib/github/client";
import { SyncStatus } from "@prisma/client";

describe("Defect Sync with Dynamic Repository Selection", () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.CMS_API_KEY = "test-secret-123";
    process.env.GITHUB_TOKEN = "ghp_validmocktoken999";
    process.env.GITHUB_OWNER = "sandbox-owner";
    process.env.GITHUB_REPO = "sandbox-repo";

    // Clean DB
    await prisma.gitHubSyncEvent.deleteMany();
    await prisma.defect.deleteMany();
    await prisma.gitHubConfig.deleteMany();
    await prisma.failureDetail.deleteMany();
    await prisma.failureSignature.deleteMany();
    await prisma.testResult.deleteMany();
    await prisma.testRun.deleteMany();
    await prisma.project.deleteMany();

    // Create Seed Project
    const project = await prisma.project.create({
      data: {
        id: "proj-repo-test",
        key: "dtr-internship",
        name: "Internship DTR",
        repositoryUrl: "https://github.com/production-owner/internship-dtr",
      },
    });

    // Create GitHub Config targeting Sandbox Repo initially
    await prisma.gitHubConfig.create({
      data: {
        projectId: project.id,
        isConnected: true,
        targetOwner: "sandbox-owner",
        targetRepo: "sandbox-repo",
      },
    });

    // Create Seed TestRun
    const testRun = await prisma.testRun.create({
      data: {
        id: "run-repo-test",
        projectId: project.id,
        status: "FAILED",
        totalTests: 1,
        failedCount: 1,
      },
    });

    // Create Seed Failure Signature
    const sig = await prisma.failureSignature.create({
      data: {
        id: "sig-repo-1",
        signatureHash: "hash-sandbox-test-1",
        errorType: "ElementNotFoundError",
        normalizedError: "Button was not visible on screen",
      },
    });

    // Create TestResult and FailureDetail
    const testRes = await prisma.testResult.create({
      data: {
        id: "tr-repo-1",
        testRunId: testRun.id,
        testTitle: "Supervisor clock out button is interactive",
        specFile: "supervisor/attendance.spec.ts",
        role: "supervisor",
        status: "FAILED",
      },
    });

    await prisma.failureDetail.create({
      data: {
        id: "fd-repo-1",
        testResultId: testRes.id,
        failureSignatureId: sig.id,
        sanitizedErrorMessage: "Button was not visible on screen",
        sanitizedStackTrace: "at attendance.spec.ts:42:15",
      },
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates issue in configured sandbox repository and stores repository identity on defect", async () => {
    const mockClient = {
      getDefaultOwner: () => "sandbox-owner",
      getDefaultRepo: () => "sandbox-repo",
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue({
        number: 401,
        url: "https://github.com/sandbox-owner/sandbox-repo/issues/401",
        title: "[Bug] Supervisor clock out button is interactive",
      }),
    } as unknown as GitHubClient;

    const result = await createOrSyncDefect("sig-repo-1", { githubClient: mockClient });

    expect(result.isNew).toBe(true);
    expect(result.defect.githubIssueNumber).toBe(401);
    expect(result.defect.githubOwner).toBe("sandbox-owner");
    expect(result.defect.githubRepo).toBe("sandbox-repo");
    expect(result.defect.githubIssueUrl).toContain("sandbox-owner/sandbox-repo/issues/401");

    // Verify stored in PostgreSQL
    const saved = await prisma.defect.findUnique({
      where: { failureSignatureId: "sig-repo-1" },
    });
    expect(saved?.githubOwner).toBe("sandbox-owner");
    expect(saved?.githubRepo).toBe("sandbox-repo");
    expect(saved?.githubIssueNumber).toBe(401);

    expect(mockClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "sandbox-owner",
        repo: "sandbox-repo",
      })
    );
  });

  it("preserves existing defect repository and references when default repository is changed", async () => {
    // 1. Defect was created originally in Sandbox repository
    await prisma.defect.create({
      data: {
        id: "defect-sandbox",
        projectId: "proj-repo-test",
        failureSignatureId: "sig-repo-1",
        githubOwner: "sandbox-owner",
        githubRepo: "sandbox-repo",
        githubIssueNumber: 401,
        githubIssueUrl: "https://github.com/sandbox-owner/sandbox-repo/issues/401",
        issueTitle: "Sandbox Issue Title",
        syncStatus: SyncStatus.SYNCED,
      },
    });

    // 2. User changes default repository configuration to Production Internship DTR
    await prisma.gitHubConfig.update({
      where: { projectId: "proj-repo-test" },
      data: {
        targetOwner: "production-owner",
        targetRepo: "internship-dtr",
      },
    });

    // 3. Verify that the existing defect retains its original sandbox reference and is not moved
    const defect = await prisma.defect.findUnique({
      where: { id: "defect-sandbox" },
    });
    expect(defect?.githubOwner).toBe("sandbox-owner");
    expect(defect?.githubRepo).toBe("sandbox-repo");
    expect(defect?.githubIssueUrl).toBe("https://github.com/sandbox-owner/sandbox-repo/issues/401");

    // 4. Create a second failure signature
    const sig2 = await prisma.failureSignature.create({
      data: {
        id: "sig-repo-2",
        signatureHash: "hash-prod-test-2",
        errorType: "AuthError",
        normalizedError: "Invalid session token",
      },
    });

    // 5. Creating a defect for the new failure goes to the newly configured Production repository
    const mockClient = {
      getDefaultOwner: () => "production-owner",
      getDefaultRepo: () => "internship-dtr",
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue({
        number: 88,
        url: "https://github.com/production-owner/internship-dtr/issues/88",
        title: "[Bug] Invalid session token",
      }),
    } as unknown as GitHubClient;

    const result2 = await createOrSyncDefect(sig2.id, { githubClient: mockClient });
    expect(result2.defect.githubOwner).toBe("production-owner");
    expect(result2.defect.githubRepo).toBe("internship-dtr");
    expect(result2.defect.githubIssueNumber).toBe(88);

    // Verify both defects peacefully coexist with their independent repositories
    const allDefects = await prisma.defect.findMany();
    expect(allDefects).toHaveLength(2);
    expect(allDefects.find((d) => d.id === "defect-sandbox")?.githubOwner).toBe("sandbox-owner");
    expect(allDefects.find((d) => d.id !== "defect-sandbox")?.githubOwner).toBe("production-owner");
  });

  it("retrying a failed defect targets its designated repository, not the altered global default", async () => {
    // Defect originally failed targeting sandbox
    const failedDefect = await prisma.defect.create({
      data: {
        id: "defect-failed",
        projectId: "proj-repo-test",
        failureSignatureId: "sig-repo-1",
        githubOwner: "sandbox-owner",
        githubRepo: "sandbox-repo",
        issueTitle: "Failed Title",
        syncStatus: SyncStatus.FAILED,
        lastSyncError: "504 Gateway Timeout",
      },
    });

    // Default repository is later changed to production
    await prisma.gitHubConfig.update({
      where: { projectId: "proj-repo-test" },
      data: {
        targetOwner: "production-owner",
        targetRepo: "internship-dtr",
      },
    });

    // When retrying, it must retry against the designated sandbox repository!
    const mockClient = {
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue({
        number: 402,
        url: "https://github.com/sandbox-owner/sandbox-repo/issues/402",
        title: "Retried Sandbox Issue",
      }),
    } as unknown as GitHubClient;

    const retryResult = await retryDefectSync(failedDefect.id, { githubClient: mockClient });

    expect(retryResult.defect.syncStatus).toBe(SyncStatus.SYNCED);
    expect(retryResult.defect.githubOwner).toBe("sandbox-owner");
    expect(retryResult.defect.githubRepo).toBe("sandbox-repo");
    expect(mockClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "sandbox-owner",
        repo: "sandbox-repo",
      })
    );
  });

  it("handles GitHub API failures and stores error in lastSyncError", async () => {
    const mockClient = {
      getDefaultOwner: () => "sandbox-owner",
      getDefaultRepo: () => "sandbox-repo",
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockRejectedValue(new GitHubApiError("Bad credentials", 401)),
    } as unknown as GitHubClient;

    await expect(
      createOrSyncDefect("sig-repo-1", { githubClient: mockClient })
    ).rejects.toThrow(DefectSyncError);

    const saved = await prisma.defect.findUnique({
      where: { failureSignatureId: "sig-repo-1" },
    });
    expect(saved?.syncStatus).toBe(SyncStatus.FAILED);
    expect(saved?.lastSyncError).toContain("Bad credentials");
  });
});
