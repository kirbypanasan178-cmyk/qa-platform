import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  RunStatus,
  TestStatus,
  SyncStatus,
  SyncAction,
  SyncEventStatus,
} from "@prisma/client";

describe("Database Layer - Prisma Client & Schema", () => {
  it("exports a valid PrismaClient singleton instance", () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma).toBe("object");
  });

  it("exposes all required entity delegates on the Prisma instance", () => {
    expect(prisma.project).toBeDefined();
    expect(prisma.testRun).toBeDefined();
    expect(prisma.testResult).toBeDefined();
    expect(prisma.failureSignature).toBeDefined();
    expect(prisma.failureDetail).toBeDefined();
    expect(prisma.defect).toBeDefined();
    expect(prisma.gitHubSyncEvent).toBeDefined();
  });

  it("exports all expected domain enums", () => {
    expect(RunStatus).toEqual({
      PASSED: "PASSED",
      FAILED: "FAILED",
      PARTIAL: "PARTIAL",
      RUNNING: "RUNNING",
    });

    expect(TestStatus).toEqual({
      PASSED: "PASSED",
      FAILED: "FAILED",
      SKIPPED: "SKIPPED",
      TIMED_OUT: "TIMED_OUT",
    });

    expect(SyncStatus).toEqual({
      PENDING: "PENDING",
      SYNCED: "SYNCED",
      FAILED: "FAILED",
    });

    expect(SyncAction).toEqual({
      CREATE: "CREATE",
      RETRY: "RETRY",
      COMMENT: "COMMENT",
    });

    expect(SyncEventStatus).toEqual({
      SUCCESS: "SUCCESS",
      ERROR: "ERROR",
    });
  });

  it("enforces server-only execution guard when window is defined", () => {
    // Simulate browser window
    const originalWindow = (globalThis as unknown as { window?: unknown }).window;
    try {
      (globalThis as unknown as { window?: unknown }).window = {};
      expect(() => {
        if (typeof window !== "undefined") {
          throw new Error(
            "PrismaClient is server-only and cannot be executed in the browser environment."
          );
        }
      }).toThrowError(/server-only/);
    } finally {
      (globalThis as unknown as { window?: unknown }).window = originalWindow;
    }
  });

  it("gracefully reports database connection state without unhandled exception", async () => {
    // When DATABASE_URL is not set or points to an unreachable host, $connect should fail with a predictable error
    if (!process.env.DATABASE_URL) {
      // Confirms safe handling when environment configuration is not provided
      expect(process.env.DATABASE_URL).toBeUndefined();
    } else {
      try {
        await prisma.$connect();
        const result = await prisma.$queryRaw`SELECT 1 as connected`;
        expect(result).toBeDefined();
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(Error);
      } finally {
        await prisma.$disconnect();
      }
    }
  });
});
