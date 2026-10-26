import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as handleCreateIssue } from "@/app/api/v1/failures/[id]/github-issue/route";
import { POST as handleRetrySync } from "@/app/api/v1/defects/[id]/retry-sync/route";
import {
  createOrSyncDefect,
  retryDefectSync,
  DefectSyncError,
  SyncInProgressError,
} from "@/lib/services/defect-sync";
import { SyncStatus } from "@prisma/client";

vi.mock("@/lib/services/defect-sync", () => ({
  createOrSyncDefect: vi.fn(),
  retryDefectSync: vi.fn(),
  DefectSyncError: class DefectSyncError extends Error {
    status: number;
    isRetryable: boolean;
    constructor(msg: string, status = 500, isRetryable = false) {
      super(msg);
      this.name = "DefectSyncError";
      this.status = status;
      this.isRetryable = isRetryable;
    }
  },
  SyncInProgressError: class SyncInProgressError extends Error {
    constructor(msg = "Sync is already in progress") {
      super(msg);
      this.name = "SyncInProgressError";
    }
  },
}));

describe("GitHub Action Routes", () => {
  const originalApiKey = process.env.CMS_API_KEY;

  beforeEach(() => {
    process.env.CMS_API_KEY = "test-secret-key-123";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CMS_API_KEY = originalApiKey;
  });

  describe("POST /api/v1/failures/[id]/github-issue", () => {
    it("returns 401 when unauthorized", async () => {
      const request = new Request("http://localhost:3000/api/v1/failures/sig-123/github-issue", {
        method: "POST",
      });

      const response = await handleCreateIssue(request, {
        params: Promise.resolve({ id: "sig-123" }),
      });

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toBe("Unauthorized");
    });

    it("returns 201 when issue is created successfully via API key", async () => {
      const mockResult = {
        defect: {
          id: "defect-new",
          projectId: "proj-1",
          failureSignatureId: "sig-123",
          githubIssueNumber: 10,
          githubIssueUrl: "https://github.com/org/repo/issues/10",
          issueTitle: "[Bug] Login error",
          syncStatus: SyncStatus.SYNCED,
          lastSyncError: null,
        },
        isNew: true,
        alreadySynced: false,
      };

      vi.mocked(createOrSyncDefect).mockResolvedValue(mockResult);

      const request = new Request("http://localhost:3000/api/v1/failures/sig-123/github-issue", {
        method: "POST",
        headers: {
          "x-api-key": "test-secret-key-123",
        },
      });

      const response = await handleCreateIssue(request, {
        params: Promise.resolve({ id: "sig-123" }),
      });

      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.defect.githubIssueNumber).toBe(10);
    });

    it("returns 200 when same-origin browser request is authorized", async () => {
      const mockResult = {
        defect: {
          id: "defect-existing",
          projectId: "proj-1",
          failureSignatureId: "sig-123",
          githubIssueNumber: 10,
          githubIssueUrl: "https://github.com/org/repo/issues/10",
          issueTitle: "[Bug] Login error",
          syncStatus: SyncStatus.SYNCED,
          lastSyncError: null,
        },
        isNew: false,
        alreadySynced: true,
      };

      vi.mocked(createOrSyncDefect).mockResolvedValue(mockResult);

      const request = new Request("http://localhost:3000/api/v1/failures/sig-123/github-issue", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
        },
      });

      const response = await handleCreateIssue(request, {
        params: Promise.resolve({ id: "sig-123" }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.alreadySynced).toBe(true);
    });

    it("returns 409 Conflict when sync is currently in progress", async () => {
      vi.mocked(createOrSyncDefect).mockRejectedValue(new SyncInProgressError());

      const request = new Request("http://localhost:3000/api/v1/failures/sig-123/github-issue", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
        },
      });

      const response = await handleCreateIssue(request, {
        params: Promise.resolve({ id: "sig-123" }),
      });

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json.error).toBe("Conflict");
    });

    it("handles DefectSyncError with appropriate status code", async () => {
      vi.mocked(createOrSyncDefect).mockRejectedValue(
        new DefectSyncError("GitHub API rate limit exceeded", 429, true)
      );

      const request = new Request("http://localhost:3000/api/v1/failures/sig-123/github-issue", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
        },
      });

      const response = await handleCreateIssue(request, {
        params: Promise.resolve({ id: "sig-123" }),
      });

      expect(response.status).toBe(429);
      const json = await response.json();
      expect(json.error).toBe("GitHub Synchronization Error");
      expect(json.retryable).toBe(true);
    });
  });

  describe("POST /api/v1/defects/[id]/retry-sync", () => {
    it("returns 401 when unauthorized", async () => {
      const request = new Request("http://localhost:3000/api/v1/defects/defect-123/retry-sync", {
        method: "POST",
      });

      const response = await handleRetrySync(request, {
        params: Promise.resolve({ id: "defect-123" }),
      });

      expect(response.status).toBe(401);
    });

    it("retries synchronization successfully", async () => {
      const mockResult = {
        defect: {
          id: "defect-123",
          projectId: "proj-1",
          failureSignatureId: "sig-123",
          githubIssueNumber: 15,
          githubIssueUrl: "https://github.com/org/repo/issues/15",
          issueTitle: "Retried Issue",
          syncStatus: SyncStatus.SYNCED,
          lastSyncError: null,
        },
        isNew: false,
        alreadySynced: false,
      };

      vi.mocked(retryDefectSync).mockResolvedValue(mockResult);

      const request = new Request("http://localhost:3000/api/v1/defects/defect-123/retry-sync", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
        },
      });

      const response = await handleRetrySync(request, {
        params: Promise.resolve({ id: "defect-123" }),
      });

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.success).toBe(true);
      expect(json.data.defect.githubIssueNumber).toBe(15);
    });
  });
});
