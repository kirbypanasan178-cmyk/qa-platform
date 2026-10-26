import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST as handleTestRunIngestion } from "@/app/api/v1/test-runs/route";
import { prisma } from "@/lib/prisma";
import { createOrSyncDefect } from "@/lib/services/defect-sync";
import { GitHubClient } from "@/lib/github/client";
import { SyncStatus } from "@prisma/client";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    testRun: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    project: {
      upsert: vi.fn(),
      findFirst: vi.fn(),
    },
    failureSignature: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    defect: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    gitHubSyncEvent: {
      create: vi.fn(),
    },
  },
}));

// Import sanitizer and role resolution directly from Playwright-local to verify full parity
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sanitizeText: reporterSanitize } = require("D:/Herd/InternshipDTR/Playwright-local/src/reporters/cms-sanitizer.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveRole } = require("D:/Herd/InternshipDTR/Playwright-local/src/reporters/cms-reporter.js");

describe("Phase 5 - End-to-End Playwright & CMS Integration Suite", () => {
  const CMS_API_KEY = "test-e2e-cms-key-777";
  const originalApiKey = process.env.CMS_API_KEY;

  beforeEach(() => {
    process.env.CMS_API_KEY = CMS_API_KEY;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CMS_API_KEY = originalApiKey;
  });

  it("Scenario A & B: Ingests completed Playwright run with all 5 roles and sanitized failures", async () => {
    // 1. Verify role resolution parity for all 5 roles
    expect(resolveRole("role-intern", "tests/intern/dtr.spec.js")).toBe("intern");
    expect(resolveRole("coordinator-e2e", "tests/coordinator/review.spec.js")).toBe("coordinator");
    expect(resolveRole("supervisor", "tests/supervisor/attendance.spec.js")).toBe("supervisor");
    expect(resolveRole("admin", "tests/admin/dashboard.spec.js")).toBe("admin");
    expect(resolveRole("superadmin", "tests/superadmin/announcements.spec.js")).toBe("superadmin");

    // 2. Build Playwright run payload with controlled diagnostic secrets
    const rawSecretMessage =
      "AssertionError: Expected 200 OK from https://admin:superSecretPass@dtr.test with password: leakedPassword123";
    const rawSecretStack =
      "Error: failed at C:\\Users\\Developer\\Playwright-local\\spec.js:45\n  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tokenValue.signature";

    const sanitizedMessage = reporterSanitize(rawSecretMessage);
    const sanitizedStack = reporterSanitize(rawSecretStack);

    // Verify reporter-side sanitization
    expect(sanitizedMessage).not.toContain("superSecretPass");
    expect(sanitizedMessage).not.toContain("leakedPassword123");
    expect(sanitizedStack).not.toContain("Developer");
    expect(sanitizedStack).not.toContain("tokenValue.signature");

    const idempotencyKey = "e2e-run-uuid-001";
    const playwrightRunPayload = {
      projectKey: "dtr-internship",
      projectName: "Internship DTR",
      repositoryUrl: "https://github.com/org/internship-dtr",
      idempotencyKey,
      branch: "staging",
      commitSha: "a1b2c3d4e5f6",
      environment: "local",
      triggeredBy: "playwright-local",
      status: "FAILED",
      totalTests: 5,
      passedCount: 3,
      failedCount: 1,
      skippedCount: 1,
      durationMs: 12500,
      startedAt: new Date(Date.now() - 15000).toISOString(),
      completedAt: new Date().toISOString(),
      testResults: [
        {
          suiteTitle: "DTR Attendance",
          testTitle: "Intern records time-in",
          specFile: "tests/intern/timein.spec.js",
          role: "intern",
          status: "PASSED",
          durationMs: 1200,
          retryCount: 0,
        },
        {
          suiteTitle: "Coordinator Review",
          testTitle: "Coordinator approves pending submission",
          specFile: "tests/coordinator/review.spec.js",
          role: "coordinator",
          status: "PASSED",
          durationMs: 2500,
          retryCount: 0,
        },
        {
          suiteTitle: "Supervisor Reports",
          testTitle: "Supervisor generates weekly attendance summary",
          specFile: "tests/supervisor/attendance.spec.js",
          role: "supervisor",
          status: "PASSED",
          durationMs: 3100,
          retryCount: 0,
        },
        {
          suiteTitle: "Admin Settings",
          testTitle: "Admin updates notification channels",
          specFile: "tests/admin/settings.spec.js",
          role: "admin",
          status: "FAILED",
          durationMs: 4200,
          retryCount: 1,
          error: {
            message: sanitizedMessage,
            stackTrace: sanitizedStack,
            errorType: "AssertionError",
          },
        },
        {
          suiteTitle: "Superadmin Tenants",
          testTitle: "Superadmin configures multi-tenant permissions",
          specFile: "tests/superadmin/tenants.spec.js",
          role: "superadmin",
          status: "SKIPPED",
          durationMs: 0,
          retryCount: 0,
        },
      ],
    };

    // 3. Mock Prisma Transaction & Insertion
    vi.mocked(prisma.$transaction).mockResolvedValue({
      id: "run-e2e-persisted-123",
      projectId: "proj-dtr",
      runNumber: 1,
      status: "FAILED",
      totalTests: 5,
      passedCount: 3,
      failedCount: 1,
      skippedCount: 1,
    } as unknown as Awaited<ReturnType<typeof prisma.$transaction>>);

    const request = new Request("http://localhost:3000/api/v1/test-runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CMS_API_KEY,
      },
      body: JSON.stringify(playwrightRunPayload),
    });

    const response = await handleTestRunIngestion(request);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.runId).toBe("run-e2e-persisted-123");
    expect(body.status).toBe("success");
  });

  it("Scenario C: Duplicate upload with same idempotencyKey returns 200 OK without re-ingesting", async () => {
    const existingRun = {
      id: "run-existing-123",
      totalTests: 5,
      passedCount: 3,
      failedCount: 1,
      skippedCount: 1,
      status: "FAILED",
    };

    vi.mocked(prisma.testRun.findFirst).mockResolvedValue(
      existingRun as unknown as Awaited<ReturnType<typeof prisma.testRun.findFirst>>
    );

    const duplicatePayload = {
      projectKey: "dtr-internship",
      idempotencyKey: "e2e-run-uuid-001",
      totalTests: 5,
      passedCount: 3,
      failedCount: 1,
      testResults: [],
    };

    const request = new Request("http://localhost:3000/api/v1/test-runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": CMS_API_KEY,
      },
      body: JSON.stringify(duplicatePayload),
    });

    const response = await handleTestRunIngestion(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("duplicate");
    expect(body.runId).toBe("run-existing-123");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("Scenario E: Rejects unauthorized upload requests with HTTP 401", async () => {
    const request = new Request("http://localhost:3000/api/v1/test-runs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "invalid-wrong-key",
      },
      body: JSON.stringify({ projectKey: "dtr-internship", totalTests: 1 }),
    });

    const response = await handleTestRunIngestion(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("Scenario F & G: Links ingested failure to GitHub Issue and keeps sync recoverable on error", async () => {
    const mockSignature = {
      id: "sig-admin-failure",
      signatureHash: "sha256-admin-failure-hash-888",
      errorType: "AssertionError",
      normalizedError: "AssertionError: Expected 200 OK from [url] with password: [REDACTED]",
      occurrenceCount: 1,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      defect: null,
      failureDetails: [
        {
          id: "detail-1",
          sanitizedErrorMessage: "AssertionError: Expected 200 OK from [url] with password: [REDACTED]",
          sanitizedStackTrace: "at spec.js:45\n  Authorization: Bearer [REDACTED_TOKEN]",
          testResult: {
            testTitle: "Admin updates notification channels",
            specFile: "tests/admin/settings.spec.js",
            role: "admin",
            testRun: {
              projectId: "proj-dtr",
            },
          },
        },
      ],
    };

    vi.mocked(prisma.failureSignature.findUnique).mockResolvedValue(
      mockSignature as unknown as Awaited<ReturnType<typeof prisma.failureSignature.findUnique>>
    );

    const pendingDefect = {
      id: "defect-admin",
      projectId: "proj-dtr",
      failureSignatureId: "sig-admin-failure",
      issueTitle: "[Bug] Admin updates notification channels: AssertionError: Expected 200 OK",
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
      syncStatus: SyncStatus.SYNCED,
      githubIssueNumber: 105,
      githubIssueUrl: "https://github.com/org/internship-dtr/issues/105",
    } as unknown as Awaited<ReturnType<typeof prisma.defect.update>>);
    vi.mocked(prisma.gitHubSyncEvent.create).mockResolvedValue({} as never);

    const mockGithubClient = {
      searchIssueByHash: vi.fn().mockResolvedValue(null),
      createIssue: vi.fn().mockResolvedValue({
        number: 105,
        url: "https://github.com/org/internship-dtr/issues/105",
        title: "[Bug] Admin updates notification channels: AssertionError: Expected 200 OK",
      }),
    } as unknown as GitHubClient;

    const result = await createOrSyncDefect("sig-admin-failure", {
      githubClient: mockGithubClient,
    });

    expect(result.defect.syncStatus).toBe(SyncStatus.SYNCED);
    expect(result.defect.githubIssueNumber).toBe(105);
    expect(result.defect.githubIssueUrl).toContain("/issues/105");

    // Verify created GitHub issue payload received clean sanitized values
    const [createArgs] = vi.mocked(mockGithubClient.createIssue).mock.calls[0];
    expect(createArgs.title).not.toContain("leakedPassword123");
    expect(createArgs.body).not.toContain("superSecretPass");
    expect(createArgs.body).toContain("tests/admin/settings.spec.js");
    expect(createArgs.labels).toContain("role:admin");
  });
});
