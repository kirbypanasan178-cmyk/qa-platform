import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOrSyncDefect,
  retryDefectSync,
  DefectSyncError,
  SyncInProgressError,
} from "@/lib/services/defect-sync";
import { GitHubClient, GitHubApiError } from "@/lib/github/client";
import { prisma } from "@/lib/prisma";
import { SyncStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    failureSignature: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    defect: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    gitHubSyncEvent: {
      create: vi.fn(),
    },
  },
}));

describe("Defect Synchronization Service", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockSignature = {
    id: "sig-test-1",
    signatureHash: "hash-12345",
    errorType: "AssertionError",
    normalizedError: "Expected true to be false",
    occurrenceCount: 3,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    defect: null,
    failureDetails: [
      {
        id: "detail-1",
        sanitizedErrorMessage: "Expected true to be false",
        sanitizedStackTrace: "at spec.ts:10",
        testResult: {
          testTitle: "Assertion check",
          specFile: "spec.ts",
          role: "admin",
          testRun: {
            projectId: "proj-1",
          },
        },
      },
    ],
  };

  it("creates a new defect and links GitHub issue on successful response", async () => {
    vi.mocked(prisma.failureSignature.findUnique).mockResolvedValue(
      mockSignature as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findUnique>>
    );

    const pendingDefect = {
      id: "defect-1",
      projectId: "proj-1",
      failureSignatureId: "sig-test-1",
      issueTitle: "[Bug] Assertion check: Expected true to be false",
      syncStatus: SyncStatus.PENDING,
      githubIssueNumber: null,
      githubIssueUrl: null,
      lastSyncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const syncedDefect = {
      ...pendingDefect,
      syncStatus: SyncStatus.SYNCED,
      githubIssueNumber: 77,
      githubIssueUrl: "https://github.com/org/repo/issues/77",
    };

    vi.mocked(prisma.defect.upsert).mockResolvedValue(
      pendingDefect as unknown as Awaited<ReturnType<typeof prisma.defect.upsert>>
    );
    vi.mocked(prisma.defect.update).mockResolvedValue(
      syncedDefect as unknown as Awaited<ReturnType<typeof prisma.defect.update>>
    );
    vi.mocked(prisma.gitHubSyncEvent.create).mockResolvedValue({} as never);

    const mockGithubClient = {
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue({
        number: 77,
        url: "https://github.com/org/repo/issues/77",
        title: "[Bug] Assertion check: Expected true to be false",
      }),
    } as unknown as GitHubClient;

    const result = await createOrSyncDefect("sig-test-1", {
      githubClient: mockGithubClient,
    });

    expect(result.isNew).toBe(true);
    expect(result.alreadySynced).toBe(false);
    expect(result.defect.githubIssueNumber).toBe(77);
    expect(mockGithubClient.createIssue).toHaveBeenCalledTimes(1);
    expect(prisma.gitHubSyncEvent.create).toHaveBeenCalledTimes(1);
  });

  it("returns existing defect immediately if already SYNCED (deduplication)", async () => {
    const signatureWithSyncedDefect = {
      ...mockSignature,
      defect: {
        id: "defect-synced",
        projectId: "proj-1",
        failureSignatureId: "sig-test-1",
        githubIssueNumber: 50,
        githubIssueUrl: "https://github.com/org/repo/issues/50",
        issueTitle: "[Bug] Login failure",
        syncStatus: SyncStatus.SYNCED,
        lastSyncError: null,
        updatedAt: new Date(),
      },
    };

    vi.mocked(prisma.failureSignature.findUnique).mockResolvedValue(
      signatureWithSyncedDefect as unknown as Awaited<
        ReturnType<typeof prisma.failureSignature.findUnique>
      >
    );

    const mockGithubClient = {
      searchIssueByHash: vi.fn(),
      createIssue: vi.fn(),
    } as unknown as GitHubClient;

    const result = await createOrSyncDefect("sig-test-1", {
      githubClient: mockGithubClient,
    });

    expect(result.alreadySynced).toBe(true);
    expect(result.defect.githubIssueNumber).toBe(50);
    expect(mockGithubClient.createIssue).not.toHaveBeenCalled();
    expect(mockGithubClient.searchIssueByHash).not.toHaveBeenCalled();
  });

  it("throws SyncInProgressError if defect is PENDING within 30s", async () => {
    const signatureWithPendingDefect = {
      ...mockSignature,
      defect: {
        id: "defect-pending",
        projectId: "proj-1",
        failureSignatureId: "sig-test-1",
        issueTitle: "Test",
        syncStatus: SyncStatus.PENDING,
        githubIssueNumber: null,
        githubIssueUrl: null,
        lastSyncError: null,
        updatedAt: new Date(), // Just updated
      },
    };

    vi.mocked(prisma.failureSignature.findUnique).mockResolvedValue(
      signatureWithPendingDefect as unknown as Awaited<
        ReturnType<typeof prisma.failureSignature.findUnique>
      >
    );

    const mockGithubClient = {
      searchIssueByHash: vi.fn(),
      createIssue: vi.fn(),
    } as unknown as GitHubClient;

    await expect(
      createOrSyncDefect("sig-test-1", { githubClient: mockGithubClient })
    ).rejects.toThrow(SyncInProgressError);
  });

  it("deduplicates via remote search when an unlinked issue already exists on GitHub", async () => {
    vi.mocked(prisma.failureSignature.findUnique).mockResolvedValue(
      mockSignature as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findUnique>>
    );

    const mockExistingRemote = {
      number: 88,
      url: "https://github.com/org/repo/issues/88",
      title: "Existing GitHub Issue",
      state: "open",
    };

    const mockGithubClient = {
      searchIssueByHash: vi.fn().mockResolvedValue(mockExistingRemote),
      createIssue: vi.fn(),
    } as unknown as GitHubClient;

    const upsertedDefect = {
      id: "defect-dedup",
      projectId: "proj-1",
      failureSignatureId: "sig-test-1",
      githubIssueNumber: 88,
      githubIssueUrl: "https://github.com/org/repo/issues/88",
      issueTitle: "Existing GitHub Issue",
      syncStatus: SyncStatus.SYNCED,
      lastSyncError: null,
    };

    vi.mocked(prisma.defect.upsert).mockResolvedValue(
      upsertedDefect as unknown as Awaited<ReturnType<typeof prisma.defect.upsert>>
    );
    vi.mocked(prisma.gitHubSyncEvent.create).mockResolvedValue({} as never);

    const result = await createOrSyncDefect("sig-test-1", {
      githubClient: mockGithubClient,
    });

    expect(result.deduplicated).toBe(true);
    expect(result.alreadySynced).toBe(true);
    expect(result.defect.githubIssueNumber).toBe(88);
    expect(mockGithubClient.createIssue).not.toHaveBeenCalled();
  });

  it("records FAILED status on GitHub API failure and throws DefectSyncError", async () => {
    vi.mocked(prisma.failureSignature.findUnique).mockResolvedValue(
      mockSignature as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findUnique>>
    );

    const pendingDefect = {
      id: "defect-failed",
      projectId: "proj-1",
      failureSignatureId: "sig-test-1",
      issueTitle: "Test Issue",
      syncStatus: SyncStatus.PENDING,
      githubIssueNumber: null,
      githubIssueUrl: null,
      lastSyncError: null,
    };

    vi.mocked(prisma.defect.upsert).mockResolvedValue(
      pendingDefect as unknown as Awaited<ReturnType<typeof prisma.defect.upsert>>
    );
    vi.mocked(prisma.defect.update).mockResolvedValue({
      ...pendingDefect,
      syncStatus: SyncStatus.FAILED,
      lastSyncError: "Bad credentials",
    } as unknown as Awaited<ReturnType<typeof prisma.defect.update>>);
    vi.mocked(prisma.gitHubSyncEvent.create).mockResolvedValue({} as never);

    const mockGithubClient = {
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockRejectedValue(new GitHubApiError("Bad credentials", 401)),
    } as unknown as GitHubClient;

    await expect(
      createOrSyncDefect("sig-test-1", { githubClient: mockGithubClient })
    ).rejects.toThrow(DefectSyncError);

    expect(prisma.defect.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ syncStatus: SyncStatus.FAILED }),
      })
    );
    expect(prisma.gitHubSyncEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "ERROR" }),
      })
    );
  });

  it("retries a previously failed Defect and sets SYNCED on success", async () => {
    const failedDefect = {
      id: "defect-to-retry",
      projectId: "proj-1",
      failureSignatureId: "sig-test-1",
      issueTitle: "Test Bug",
      syncStatus: SyncStatus.FAILED,
      githubIssueNumber: null,
      githubIssueUrl: null,
      lastSyncError: "Temporary timeout",
      updatedAt: new Date(Date.now() - 60_000), // 1 min ago
      failureSignature: mockSignature,
    };

    vi.mocked(prisma.defect.findUnique).mockResolvedValue(
      failedDefect as unknown as Awaited<ReturnType<typeof prisma.defect.findUnique>>
    );

    vi.mocked(prisma.defect.update).mockResolvedValue({
      ...failedDefect,
      syncStatus: SyncStatus.SYNCED,
      githubIssueNumber: 99,
      githubIssueUrl: "https://github.com/org/repo/issues/99",
      lastSyncError: null,
    } as unknown as Awaited<ReturnType<typeof prisma.defect.update>>);

    vi.mocked(prisma.gitHubSyncEvent.create).mockResolvedValue({} as never);

    const mockGithubClient = {
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue({
        number: 99,
        url: "https://github.com/org/repo/issues/99",
        title: "Test Bug",
      }),
    } as unknown as GitHubClient;

    const result = await retryDefectSync("defect-to-retry", {
      githubClient: mockGithubClient,
    });

    expect(result.defect.syncStatus).toBe(SyncStatus.SYNCED);
    expect(result.defect.githubIssueNumber).toBe(99);
    expect(prisma.gitHubSyncEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "RETRY", status: "SUCCESS" }),
      })
    );
  });
});
