import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDashboardMetrics } from "@/lib/data/dashboard";
import { getTestRuns, getTestRunById } from "@/lib/data/runs";
import { getFailures, getFailureById } from "@/lib/data/failures";
import { prisma } from "@/lib/prisma";

describe("Dashboard Data Access Layer", () => {
  const originalDbUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.DATABASE_URL = originalDbUrl;
  });

  describe("getDashboardMetrics", () => {
    it("returns zero-state metrics when database is empty", async () => {
      vi.spyOn(prisma.testRun, "count").mockResolvedValueOnce(0);
      vi.spyOn(prisma.testRun, "aggregate").mockResolvedValueOnce({
        _sum: {
          totalTests: null,
          passedCount: null,
          failedCount: null,
          skippedCount: null,
        },
      } as unknown as Awaited<ReturnType<typeof prisma.testRun.aggregate>>);
      vi.spyOn(prisma.testRun, "findMany").mockResolvedValueOnce([]);
      vi.spyOn(prisma.failureSignature, "findMany").mockResolvedValueOnce([]);

      const metrics = await getDashboardMetrics();

      expect(metrics.totalRuns).toBe(0);
      expect(metrics.totalTests).toBe(0);
      expect(metrics.passRate).toBe(0);
      expect(metrics.recentRuns).toHaveLength(0);
      expect(metrics.recentFailures).toHaveLength(0);
    });

    it("calculates accurate pass rate and returns metrics", async () => {
      vi.spyOn(prisma.testRun, "count").mockResolvedValueOnce(5);
      vi.spyOn(prisma.testRun, "aggregate").mockResolvedValueOnce({
        _sum: {
          totalTests: 100,
          passedCount: 85,
          failedCount: 10,
          skippedCount: 5,
        },
      } as unknown as Awaited<ReturnType<typeof prisma.testRun.aggregate>>);
      vi.spyOn(prisma.testRun, "findMany").mockResolvedValueOnce([
        {
          id: "run-1",
          runNumber: 1,
          status: "PASSED",
          branch: "main",
          commitSha: "abc",
          environment: "ci",
          totalTests: 20,
          passedCount: 20,
          failedCount: 0,
          skippedCount: 0,
          durationMs: 5000,
          startedAt: new Date(),
          project: { key: "dtr", name: "DTR" },
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.testRun.findMany>>);
      vi.spyOn(prisma.failureSignature, "findMany").mockResolvedValueOnce([]);

      const metrics = await getDashboardMetrics();

      expect(metrics.totalRuns).toBe(5);
      expect(metrics.totalTests).toBe(100);
      expect(metrics.totalPassed).toBe(85);
      expect(metrics.passRate).toBe(85);
      expect(metrics.recentRuns).toHaveLength(1);
    });
  });

  describe("getTestRuns", () => {
    it("applies pagination parameters and returns runs list", async () => {
      vi.spyOn(prisma.testRun, "count").mockResolvedValueOnce(25);
      vi.spyOn(prisma.testRun, "findMany").mockResolvedValueOnce([
        {
          id: "run-10",
          runNumber: 10,
          status: "FAILED",
          branch: "feat/clockin",
          commitSha: "123",
          environment: "ci",
          triggeredBy: "github-actions",
          totalTests: 15,
          passedCount: 14,
          failedCount: 1,
          skippedCount: 0,
          durationMs: 12000,
          startedAt: new Date(),
          project: { key: "internship-dtr", name: "DTR" },
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.testRun.findMany>>);
 
      const result = await getTestRuns({ page: 2, pageSize: 10, status: "FAILED" });

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.runs).toHaveLength(1);
    });

    it("fetches single test run details with relations", async () => {
      const mockRun = {
        id: "run-xyz",
        status: "FAILED",
        project: { key: "dtr" },
        testResults: [
          {
            id: "res-1",
            testTitle: "clock in",
            status: "FAILED",
            failureDetail: { sanitizedErrorMessage: "Timeout" },
          },
        ],
      };
      vi.spyOn(prisma.testRun, "findUnique").mockResolvedValueOnce(mockRun as unknown as Awaited<ReturnType<typeof prisma.testRun.findUnique>>);

      const run = await getTestRunById("run-xyz");
      expect(run).toBeDefined();
      expect(run?.id).toBe("run-xyz");
      expect(run?.testResults).toHaveLength(1);
    });
  });

  describe("getFailures", () => {
    it("paginates recurring failure signatures", async () => {
      vi.spyOn(prisma.failureSignature, "count").mockResolvedValueOnce(8);
      vi.spyOn(prisma.failureSignature, "findMany").mockResolvedValueOnce([
        {
          id: "sig-1",
          signatureHash: "sha256-hash",
          errorType: "TimeoutError",
          normalizedError: "timeout [duration] exceeded",
          occurrenceCount: 5,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          _count: { failureDetails: 5 },
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findMany>>);

      const result = await getFailures({ page: 1, pageSize: 10 });
      expect(result.total).toBe(8);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0].occurrenceCount).toBe(5);
    });

    it("retrieves failure signature by id with details", async () => {
      const mockFailure = {
        id: "sig-1",
        signatureHash: "hash123",
        failureDetails: [],
      };
      vi.spyOn(prisma.failureSignature, "findUnique").mockResolvedValueOnce(mockFailure as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findUnique>>);

      const failure = await getFailureById("sig-1");
      expect(failure?.signatureHash).toBe("hash123");
    });
  });
});
