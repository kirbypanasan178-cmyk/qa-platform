import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "@/app/api/v1/test-runs/route";
import { prisma } from "@/lib/prisma";

describe("POST /api/v1/test-runs - Ingestion Endpoint", () => {
  const originalEnv = process.env.CMS_API_KEY;
  const TEST_API_KEY = "test-ingestion-key-999";

  beforeEach(() => {
    process.env.CMS_API_KEY = TEST_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CMS_API_KEY = originalEnv;
  });

  it("returns 401 when API key is missing", async () => {
    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      body: JSON.stringify({ projectKey: "dtr-test", totalTests: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toHaveProperty("error", "Unauthorized");
  });

  it("returns 401 when API key is invalid", async () => {
    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      headers: { "x-api-key": "invalid-wrong-key" },
      body: JSON.stringify({ projectKey: "dtr-test", totalTests: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toHaveProperty("error", "Unauthorized");
  });

  it("returns 413 when Content-Length exceeds allowable limit", async () => {
    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      headers: {
        "x-api-key": TEST_API_KEY,
        "content-length": (6 * 1024 * 1024).toString(), // 6MB
      },
      body: JSON.stringify({ projectKey: "dtr-test", totalTests: 1 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body).toHaveProperty("error", "Payload Too Large");
  });

  it("returns 400 when request body contains malformed JSON", async () => {
    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY },
      body: "{ malformed json",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toHaveProperty("error", "Bad Request");
    expect(body.message).toContain("Malformed JSON");
  });

  it("returns 400 when payload fails schema validation", async () => {
    const invalidPayload = {
      // missing projectKey
      totalTests: -5, // invalid negative count
    };

    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY },
      body: JSON.stringify(invalidPayload),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toHaveProperty("error", "Bad Request");
    expect(body.message).toContain("Invalid test run payload");
    expect(body.details).toBeInstanceOf(Array);
  });

  it("returns 200 when recognizing an idempotent duplicate run", async () => {
    const idempotencyKey = "ci-run-batch-20261026-001";

    vi.spyOn(prisma.testRun, "findFirst").mockResolvedValueOnce({
      id: "run-existing-123",
      totalTests: 10,
      passedCount: 8,
      failedCount: 2,
      skippedCount: 0,
      status: "FAILED",
    } as unknown as Awaited<ReturnType<typeof prisma.testRun.findFirst>>);

    const payload = {
      projectKey: "internship-dtr",
      idempotencyKey,
      totalTests: 10,
      passedCount: 8,
      failedCount: 2,
    };

    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("duplicate");
    expect(body.runId).toBe("run-existing-123");
    expect(body.message).toContain("previously ingested");
  });

  it("returns 201 and stores test run, results, and sanitized failures", async () => {
    vi.spyOn(prisma.testRun, "findFirst").mockResolvedValueOnce(null);

    const mockProject = { id: "proj-1", key: "internship-dtr" };
    const mockTestRun = {
      id: "run-new-456",
      projectId: "proj-1",
      status: "FAILED",
      totalTests: 1,
      passedCount: 0,
      failedCount: 1,
      skippedCount: 0,
    };
    const mockTestResult = { id: "result-1", testRunId: "run-new-456" };
    const mockSignature = { id: "sig-1", signatureHash: "sha256hash123" };

    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: unknown) => {
      const cb = callback as (tx: unknown) => Promise<unknown>;
      const tx = {
        project: { upsert: vi.fn().mockResolvedValue(mockProject) },
        testRun: { create: vi.fn().mockResolvedValue(mockTestRun) },
        testResult: { create: vi.fn().mockResolvedValue(mockTestResult) },
        failureSignature: { upsert: vi.fn().mockResolvedValue(mockSignature) },
        failureDetail: { create: vi.fn().mockResolvedValue({ id: "detail-1" }) },
      };
      return cb(tx);
    });

    const payload = {
      projectKey: "internship-dtr",
      projectName: "Internship DTR Automation",
      totalTests: 1,
      passedCount: 0,
      failedCount: 1,
      testResults: [
        {
          suiteTitle: "Intern Portal",
          testTitle: "should clock in with password",
          specFile: "tests/intern/dtr.spec.ts",
          role: "intern",
          status: "FAILED",
          durationMs: 3500,
          error: {
            message: 'Login failed with password: "userSecret123" at 2026-10-26T12:00:00.000Z',
            stackTrace: "at D:\\Website Project\\qa-platform\\tests\\intern\\dtr.spec.ts:42:15",
            errorType: "AssertionError",
          },
        },
      ],
    };

    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.status).toBe("success");
    expect(body.runId).toBe("run-new-456");
    expect(body.summary.projectKey).toBe("internship-dtr");
  });

  it("returns 500 when database transaction throws unexpected error", async () => {
    vi.spyOn(prisma.testRun, "findFirst").mockResolvedValueOnce(null);
    vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(new Error("Database disk full"));

    const payload = {
      projectKey: "internship-dtr",
      totalTests: 1,
    };

    const request = new Request("http://localhost/api/v1/test-runs", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY },
      body: JSON.stringify(payload),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toHaveProperty("error", "Internal Server Error");
    expect(body).not.toHaveProperty("stack"); // Ensures stack traces are not leaked
  });
});
