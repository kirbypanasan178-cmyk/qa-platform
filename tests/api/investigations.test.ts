import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET as listInvestigationsHandler } from "@/app/api/v1/investigations/route";
import { POST as triageActionHandler } from "@/app/api/v1/investigations/[id]/action/route";
import { createOrSyncDefect, DefectSyncError } from "@/lib/services/defect-sync";
import { prisma } from "@/lib/prisma";
import { SyncStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    investigation: {
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    investigationHistory: {
      create: vi.fn(),
    },
    failureSignature: {
      findUnique: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
    },
    defect: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    gitHubSyncEvent: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

describe("AI & Rule-Based Investigations API", () => {
  const TEST_API_KEY = "test-investigations-key-999";
  const originalApiKey = process.env.CMS_API_KEY;

  beforeEach(() => {
    process.env.CMS_API_KEY = TEST_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CMS_API_KEY = originalApiKey;
  });

  describe("GET /api/v1/investigations", () => {
    it("returns 401 when unauthenticated", async () => {
      const request = new Request("http://localhost/api/v1/investigations", {
        method: "GET",
      });

      const response = await listInvestigationsHandler(request);
      expect(response.status).toBe(401);
    });

    it("returns 200 with investigations list and stats when authenticated", async () => {
      vi.mocked(prisma.investigation.count)
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(1) // total for stats
        .mockResolvedValueOnce(1) // pendingReview
        .mockResolvedValueOnce(0) // confirmedBugs
        .mockResolvedValueOnce(0) // rerunRequested
        .mockResolvedValueOnce(0) // testDefects
        .mockResolvedValueOnce(0); // rejected

      const mockInvestigation = {
        id: "inv-1",
        classification: "APPLICATION_BUG",
        confidenceScore: 92,
        summary: "Identified application crash",
        recommendedAction: "Confirm bug",
        status: "PENDING_REVIEW",
        createdAt: new Date(),
        testResult: {
          testTitle: "should clock in",
          specFile: "tests/intern/dtr.spec.ts",
          testRun: {
            project: { key: "dtr-internship", name: "Internship DTR" },
          },
        },
      };

      vi.mocked(prisma.investigation.findMany).mockResolvedValueOnce([
        mockInvestigation as unknown as Awaited<
          ReturnType<typeof prisma.investigation.findMany>
        >[0],
      ]);

      const request = new Request("http://localhost/api/v1/investigations", {
        method: "GET",
        headers: { "x-api-key": TEST_API_KEY },
      });

      const response = await listInvestigationsHandler(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe("inv-1");
      expect(body.stats.pendingReview).toBe(1);
    });
  });

  describe("POST /api/v1/investigations/[id]/action - Admin Triage", () => {
    it("returns 401 when triage action request is unauthenticated", async () => {
      const request = new Request("http://localhost/api/v1/investigations/inv-1/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CONFIRM_BUG" }),
      });

      const response = await triageActionHandler(request, {
        params: Promise.resolve({ id: "inv-1" }),
      });
      expect(response.status).toBe(401);
    });

    it("returns 400 when action is missing or invalid", async () => {
      const request = new Request("http://localhost/api/v1/investigations/inv-1/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": TEST_API_KEY,
        },
        body: JSON.stringify({ action: "INVALID_ACTION_NAME" }),
      });

      const response = await triageActionHandler(request, {
        params: Promise.resolve({ id: "inv-1" }),
      });
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("Validation Error");
    });

    it("returns 404 when investigation does not exist", async () => {
      vi.mocked(prisma.investigation.findUnique).mockResolvedValueOnce(null);

      const request = new Request("http://localhost/api/v1/investigations/non-existent/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": TEST_API_KEY,
        },
        body: JSON.stringify({ action: "CONFIRM_BUG" }),
      });

      const response = await triageActionHandler(request, {
        params: Promise.resolve({ id: "non-existent" }),
      });
      expect(response.status).toBe(404);
    });

    it("successfully applies CONFIRM_BUG action and updates audit history", async () => {
      const existing = {
        id: "inv-1",
        status: "PENDING_REVIEW",
        classification: "APPLICATION_BUG",
        testResultId: "res-1",
        failureDetailId: "det-1",
      };

      vi.mocked(prisma.investigation.findUnique).mockResolvedValueOnce(
        existing as unknown as Awaited<ReturnType<typeof prisma.investigation.findUnique>>
      );

      const updated = {
        ...existing,
        status: "CONFIRMED_BUG",
        adminNotes: "Manually verified bug on staging",
        reviewedBy: "QA Lead",
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) => {
        const cb = callback as (tx: unknown) => Promise<unknown>;
        const tx = {
          investigation: { update: vi.fn().mockResolvedValue(updated) },
          investigationHistory: { create: vi.fn().mockResolvedValue({ id: "hist-1" }) },
        };
        return cb(tx);
      });

      const request = new Request("http://localhost/api/v1/investigations/inv-1/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": TEST_API_KEY,
        },
        body: JSON.stringify({
          action: "CONFIRM_BUG",
          notes: "Manually verified bug on staging",
          reviewedBy: "QA Lead",
        }),
      });

      const response = await triageActionHandler(request, {
        params: Promise.resolve({ id: "inv-1" }),
      });
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe("CONFIRMED_BUG");
    });
  });

  describe("GitHub Issue Creation Restriction (Requirement 9)", () => {
    it("blocks GitHub issue creation for unconfirmed failures with 403 Forbidden", async () => {
      const mockSignature = {
        id: "sig-unconfirmed",
        signatureHash: "hash-unconfirmed",
        errorType: "AssertionError",
        normalizedError: "Assertion mismatch",
        occurrenceCount: 1,
        defect: null,
        failureDetails: [
          {
            id: "det-1",
            sanitizedErrorMessage: "Failed test",
            sanitizedStackTrace: "at spec.ts:10",
            testResult: {
              testTitle: "Unconfirmed test",
              specFile: "tests/intern/test.spec.ts",
              role: "intern",
              testRun: { projectId: "proj-1" },
              investigation: {
                id: "inv-unconfirmed",
                status: "PENDING_REVIEW", // NOT CONFIRMED_BUG
              },
            },
          },
        ],
      };

      vi.mocked(prisma.failureSignature.findUnique).mockResolvedValueOnce(
        mockSignature as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findUnique>>
      );

      await expect(
        createOrSyncDefect("sig-unconfirmed")
      ).rejects.toThrowError(
        /GitHub issues can only be created for confirmed bugs/
      );
    });

    it("permits GitHub issue creation when failure is confirmed as CONFIRMED_BUG", async () => {
      const mockSignature = {
        id: "sig-confirmed",
        signatureHash: "hash-confirmed",
        errorType: "AssertionError",
        normalizedError: "Server error",
        occurrenceCount: 2,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        defect: null,
        failureDetails: [
          {
            id: "det-2",
            sanitizedErrorMessage: "Server error 500",
            sanitizedStackTrace: "at spec.ts:25",
            testResult: {
              testTitle: "Confirmed bug test",
              specFile: "tests/intern/test.spec.ts",
              role: "intern",
              testRun: { projectId: "proj-1" },
              investigation: {
                id: "inv-confirmed",
                status: "CONFIRMED_BUG", // Confirmed by admin!
              },
            },
          },
        ],
      };

      vi.mocked(prisma.failureSignature.findUnique).mockResolvedValueOnce(
        mockSignature as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findUnique>>
      );

      const pendingDefect = {
        id: "defect-confirmed",
        projectId: "proj-1",
        failureSignatureId: "sig-confirmed",
        issueTitle: "[Bug] Confirmed bug test: Server error",
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
        githubIssueNumber: 88,
        githubIssueUrl: "https://github.com/org/repo/issues/88",
      };

      vi.mocked(prisma.defect.upsert).mockResolvedValueOnce(
        pendingDefect as unknown as Awaited<ReturnType<typeof prisma.defect.upsert>>
      );
      vi.mocked(prisma.defect.update).mockResolvedValueOnce(
        syncedDefect as unknown as Awaited<ReturnType<typeof prisma.defect.update>>
      );
      vi.mocked(prisma.gitHubSyncEvent.create).mockResolvedValueOnce({} as never);

      const mockGithubClient = {
        searchIssueByHash: vi.fn().mockResolvedValue(null),
        createIssue: vi.fn().mockResolvedValue({
          number: 88,
          url: "https://github.com/org/repo/issues/88",
          title: "[Bug] Confirmed bug test: Server error",
        }),
        getDefaultOwner: vi.fn().mockReturnValue("org"),
        getDefaultRepo: vi.fn().mockReturnValue("repo"),
      };

      const result = await createOrSyncDefect("sig-confirmed", {
        githubClient: mockGithubClient as never,
      });

      expect(result.defect.syncStatus).toBe(SyncStatus.SYNCED);
      expect(result.defect.githubIssueNumber).toBe(88);
      expect(mockGithubClient.createIssue).toHaveBeenCalledTimes(1);
    });
  });
});
