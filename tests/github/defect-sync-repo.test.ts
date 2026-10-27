import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createOrSyncDefect, retryDefectSync, DefectSyncError } from "@/lib/services/defect-sync";
import { GitHubClient, GitHubApiError } from "@/lib/github/client";
import { SyncStatus } from "@prisma/client";

describe("Defect Sync with Dynamic Repository Selection", () => {
  const originalEnv = { ...process.env };
  let testProjectId: string;

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.CMS_API_KEY = "test-secret-123";
    process.env.GITHUB_TOKEN = "ghp_validmocktoken999";
    process.env.GITHUB_OWNER = "sandbox-owner";
    process.env.GITHUB_REPO = "sandbox-repo";

    // Clean test-specific records
    await prisma.gitHubSyncEvent.deleteMany({
      where: { defect: { failureSignatureId: { in: ["sig-repo-1", "sig-repo-2"] } } },
    });
    await prisma.defect.deleteMany({
      where: { failureSignatureId: { in: ["sig-repo-1", "sig-repo-2"] } },
    });
    await prisma.failureDetail.deleteMany({
      where: { id: "fd-repo-1" },
    });
    await prisma.failureSignature.deleteMany({
      where: { id: { in: ["sig-repo-1", "sig-repo-2"] } },
    });
    await prisma.testResult.deleteMany({
      where: { id: "tr-repo-1" },
    });
    await prisma.testRun.deleteMany({
      where: { id: "run-repo-test" },
    });

    // Ensure Seed Project exists
    const project = await prisma.project.upsert({
      where: { key: "dtr-internship" },
      create: {
        id: "proj-repo-test",
        key: "dtr-internship",
        name: "Internship DTR",
        repositoryUrl: "https://github.com/production-owner/internship-dtr",
      },
      update: {
        name: "Internship DTR",
      },
    });
    testProjectId = project.id;

    // Create GitHub Config targeting Sandbox Repo initially
    await prisma.gitHubConfig.upsert({
      where: { projectId: project.id },
      create: {
        projectId: project.id,
        isConnected: true,
        targetOwner: "sandbox-owner",
        targetRepo: "sandbox-repo",
      },
      update: {
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

  afterAll(async () => {
    // Clean up test records
    await prisma.gitHubSyncEvent.deleteMany({
      where: { defect: { projectId: "proj-repo-test" } },
    });
    await prisma.defect.deleteMany({
      where: { projectId: "proj-repo-test" },
    });
    await prisma.failureDetail.deleteMany({
      where: { id: "fd-repo-1" },
    });
    await prisma.failureSignature.deleteMany({
      where: { id: { in: ["sig-repo-1", "sig-repo-2"] } },
    });
    await prisma.testResult.deleteMany({
      where: { id: "tr-repo-1" },
    });
    await prisma.testRun.deleteMany({
      where: { id: "run-repo-test" },
    });

    // Restore project GitHubConfig to user's saved repository
    const proj = await prisma.project.findFirst({ where: { key: "dtr-internship" } });
    if (proj) {
      await prisma.gitHubConfig.upsert({
        where: { projectId: proj.id },
        create: {
          projectId: proj.id,
          isConnected: true,
          targetOwner: "KiyoshiGamer",
          targetRepo: "MERN-STACK",
        },
        update: {
          isConnected: true,
          targetOwner: "KiyoshiGamer",
          targetRepo: "MERN-STACK",
        },
      });
    }
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
        projectId: testProjectId,
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
      where: { projectId: testProjectId },
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

  it("retrying an uncreated failed defect uses the project's current repository configuration", async () => {
    // Defect originally failed targeting sandbox before issue was created
    const failedDefect = await prisma.defect.create({
      data: {
        id: "defect-failed",
        projectId: testProjectId,
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
      where: { projectId: testProjectId },
      data: {
        targetOwner: "production-owner",
        targetRepo: "internship-dtr",
      },
    });

    // When retrying an uncreated issue, it must retry against the project's current repository!
    const mockClient = {
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue({
        number: 402,
        url: "https://github.com/production-owner/internship-dtr/issues/402",
        title: "Retried Production Issue",
      }),
    } as unknown as GitHubClient;

    const retryResult = await retryDefectSync(failedDefect.id, { githubClient: mockClient });

    expect(retryResult.defect.syncStatus).toBe(SyncStatus.SYNCED);
    expect(retryResult.defect.githubOwner).toBe("production-owner");
    expect(retryResult.defect.githubRepo).toBe("internship-dtr");
    expect(mockClient.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "production-owner",
        repo: "internship-dtr",
      })
    );
  });

  it("retrying an already synced defect preserves its designated repository", async () => {
    // Defect was previously successfully synced to sandbox
    const syncedDefect = await prisma.defect.create({
      data: {
        id: "defect-synced",
        projectId: testProjectId,
        failureSignatureId: "sig-repo-1",
        githubOwner: "sandbox-owner",
        githubRepo: "sandbox-repo",
        githubIssueNumber: 101,
        githubIssueUrl: "https://github.com/sandbox-owner/sandbox-repo/issues/101",
        issueTitle: "Already Synced Sandbox Issue",
        syncStatus: SyncStatus.SYNCED,
      },
    });

    // Default repository is later changed to production
    await prisma.gitHubConfig.update({
      where: { projectId: testProjectId },
      data: {
        targetOwner: "production-owner",
        targetRepo: "internship-dtr",
      },
    });

    // When retrying an already synced defect, it must preserve its designated repository
    const mockClient = {
      searchIssueByHash: vi.fn().mockResolvedValue({
        number: 101,
        url: "https://github.com/sandbox-owner/sandbox-repo/issues/101",
        title: "Already Synced Sandbox Issue",
      }),
      createIssue: vi.fn(),
    } as unknown as GitHubClient;

    const retryResult = await retryDefectSync(syncedDefect.id, { githubClient: mockClient });

    expect(retryResult.alreadySynced).toBe(true);
    expect(retryResult.defect.githubOwner).toBe("sandbox-owner");
    expect(retryResult.defect.githubRepo).toBe("sandbox-repo");
    expect(mockClient.createIssue).not.toHaveBeenCalled();
    expect(mockClient.searchIssueByHash).not.toHaveBeenCalled();
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
