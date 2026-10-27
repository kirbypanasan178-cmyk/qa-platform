import { describe, it, expect } from "vitest";
import { formatGitHubIssue } from "@/lib/github/formatter";

describe("formatGitHubIssue", () => {
  it("formats issue title, metadata table, and collapsible stack trace", () => {
    const input = {
      failureSignature: {
        id: "sig-123",
        signatureHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        errorType: "TimeoutError",
        normalizedError: "Timeout 5000ms exceeded while waiting for locator('[data-testid=\"login-btn\"]')",
        occurrenceCount: 8,
        firstSeenAt: new Date("2026-10-20T10:00:00Z"),
        lastSeenAt: new Date("2026-10-26T12:00:00Z"),
      },
      sampleDetail: {
        sanitizedErrorMessage: "Timeout 5000ms exceeded while waiting for locator('[data-testid=\"login-btn\"]')",
        sanitizedStackTrace: "Error: Timeout exceeded\n    at LoginPage.clickLogin (login.page.ts:45:10)",
        testResult: {
          testTitle: "Should submit login credentials",
          specFile: "e2e/auth/login.spec.ts",
          role: "admin",
          durationMs: 5120,
          retryCount: 1,
          testRun: {
            id: "run-xyz-123",
            environment: "staging",
            branch: "main",
            commitSha: "a1b2c3d4e5f6",
            project: {
              id: "proj-1",
              name: "Internship DTR",
              key: "dtr-internship",
              repositoryUrl: "https://github.com/org/repo",
            },
          },
          investigation: {
            id: "inv-1",
            classification: "FLAKY_TEST",
            confidenceScore: 78,
            summary: "Locator wait timeout during login action.",
            recommendedAction: "Add explicit element visibility wait before clicking login.",
          },
        },
      },
      cmsBaseUrl: "https://qa-cms.internal.local",
    };

    const formatted = formatGitHubIssue(input);

    // Title includes classification and severity
    expect(formatted.title).toBe(
      "[Flaky Test | Low] Should submit login credentials: Timeout 5000ms exceeded while waiting for locator('[data-testid=\"login-btn\"]')"
    );

    // Standardized labels
    expect(formatted.labels).toContain("automated-defect");
    expect(formatted.labels).toContain("qa-failure");
    expect(formatted.labels).toContain("classification:flaky-test");
    expect(formatted.labels).toContain("severity:low");
    expect(formatted.labels).toContain("role:admin");

    // All standard sections present
    expect(formatted.body).toContain("### Summary");
    expect(formatted.body).toContain("### Environment");
    expect(formatted.body).toContain("### Test Information");
    expect(formatted.body).toContain("### Steps to Reproduce");
    expect(formatted.body).toContain("### Technical Evidence");
    expect(formatted.body).toContain("### Initial QA Assessment");
    expect(formatted.body).toContain("### Recommended Investigation");
    expect(formatted.body).toContain("### Resolution Criteria");

    // Specific content checks
    expect(formatted.body).toContain("e2e/auth/login.spec.ts");
    expect(formatted.body).toContain("Should submit login credentials");
    expect(formatted.body).toContain("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(formatted.body).toContain("<details>");
    expect(formatted.body).toContain("LoginPage.clickLogin");
    expect(formatted.body).toContain("https://qa-cms.internal.local/failures/sig-123");
    expect(formatted.body).toContain("https://qa-cms.internal.local/runs/run-xyz-123");
  });

  it("correctly identifies non-numeric ID assertion failure as Potential Test Defect and not application bug", () => {
    const input = {
      failureSignature: {
        id: "sig-coordinator-500",
        signatureHash: "0361fc63adedb1195addfb5302795454f04c82b29f2173c3901400ead40ee317",
        errorType: "AssertionError",
        normalizedError:
          "error: expect(received).tocontain(expected) // indexof expected value: 500 received array: [404, 400]",
        occurrenceCount: 1,
        firstSeenAt: new Date("2026-10-27T03:59:51.188Z"),
        lastSeenAt: new Date("2026-10-27T03:59:51.188Z"),
      },
      sampleDetail: {
        sanitizedErrorMessage:
          "Error: expect(received).toContain(expected) // indexOf\n\nExpected value: 500\nReceived array: [404, 400]",
        sanitizedStackTrace:
          "Error: expect(received).toContain(expected) // indexOf\n\nExpected value: 500\nReceived array: [404, 400]\n    at D:\\Herd\\InternshipDTR\\Playwright-local\\tests\\security\\coordinator-access-control.spec.js:55:24",
        testResult: {
          testTitle: "non-numeric intern profile id or dtr submission id should not return 500",
          specFile: "Playwright-local/tests/security/coordinator-access-control.spec.js",
          suiteTitle: "Coordinator - access control & unauthenticated edge cases",
          durationMs: 1509,
          retryCount: 0,
          testRun: {
            id: "run-coord-999",
            environment: "staging",
            branch: "staging",
            commitSha: "95d576913918fd42dceedf06eafbb91ca0a9b083",
            project: {
              id: "proj-repo-test",
              name: "Internship DTR",
              key: "dtr-internship",
              repositoryUrl: "https://github.com/production-owner/internship-dtr",
            },
          },
        },
      },
      cmsBaseUrl: "http://localhost:3000",
    };

    const formatted = formatGitHubIssue(input);

    // Title MUST identify as Potential Test Defect, not application bug
    expect(formatted.title).toContain("[Potential Test Defect | Medium]");
    expect(formatted.title).toContain("non-numeric intern profile id or dtr submission id should not return 500");
    expect(formatted.title).not.toContain("Application Bug");

    // Labels
    expect(formatted.labels).toContain("classification:test-defect");
    expect(formatted.labels).toContain("severity:medium");
    expect(formatted.labels).not.toContain("classification:app-bug");

    // Location extraction cleans workstation path and extracts line 55
    expect(formatted.body).toContain("tests/security/coordinator-access-control.spec.js:55");
    expect(formatted.body).not.toContain("D:\\Herd\\InternshipDTR\\Playwright-local\\tests");

    // Expected & Actual Results
    expect(formatted.body).toContain("### Expected Result");
    expect(formatted.body).toContain("without crashing or leaking an HTTP 500");
    expect(formatted.body).toContain("### Actual Result");
    expect(formatted.body).toContain("Received array: [404, 400]");

    // Initial QA Assessment explicitly explains the inverted assertion
    expect(formatted.body).toContain("### Initial QA Assessment");
    expect(formatted.body).toContain("**Potential Test Defect**");
    expect(formatted.body).toContain("inverted assertion");
    expect(formatted.body).toContain("404/400 (proper client error validation)");

    // Recommended Investigation gives actionable steps
    expect(formatted.body).toContain("### Recommended Investigation");
    expect(formatted.body).toContain("coordinator-access-control.spec.js:55");
    expect(formatted.body).toContain("Update the test assertion");

    // Resolution Criteria
    expect(formatted.body).toContain("### Resolution Criteria");
    expect(formatted.body).toContain("executes and passes cleanly without errors");
  });

  it("gracefully omits unavailable optional fields without inventing fake information", () => {
    // Completely minimal input: no environment, no project, no investigation, no stack trace
    const minimalInput = {
      failureSignature: {
        id: "sig-minimal",
        signatureHash: "minhash123",
        normalizedError: "Assertion failed",
        occurrenceCount: 1,
        firstSeenAt: new Date("2026-10-27T00:00:00Z"),
        lastSeenAt: new Date("2026-10-27T00:00:00Z"),
      },
      sampleDetail: {
        sanitizedErrorMessage: "Expected true to be false",
      },
    };

    const formatted = formatGitHubIssue(minimalInput);

    expect(formatted.title).toBeDefined();
    expect(formatted.body).toBeDefined();
    // Environment section omitted because no environment fields exist
    expect(formatted.body).not.toContain("### Environment");
    // Summary, Test Information, Technical Evidence are always present
    expect(formatted.body).toContain("### Summary");
    expect(formatted.body).toContain("### Test Information");
    expect(formatted.body).toContain("### Technical Evidence");
    // Does not invent fake steps or fake endpoints
    expect(formatted.body).not.toContain("FakeStep");
    expect(formatted.body).not.toContain("undefined");
    expect(formatted.body).not.toContain("null");
  });

  it("redacts sensitive passwords, bearer tokens, and URLs with credentials from the body", () => {
    const input = {
      failureSignature: {
        id: "sig-sensitive",
        signatureHash: "abc123hash",
        errorType: "AuthError",
        normalizedError: "Failed with password: supersecretpassword123",
        occurrenceCount: 1,
        firstSeenAt: new Date("2026-10-26T10:00:00Z"),
        lastSeenAt: new Date("2026-10-26T10:00:00Z"),
      },
      sampleDetail: {
        sanitizedErrorMessage:
          "Request failed to https://admin:superSecret123@api.internal.com with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakMeNow",
        sanitizedStackTrace: "password: supersecretpassword123",
        testResult: {
          testTitle: "Authentication test with password: supersecretpassword123",
          specFile: "e2e/auth.spec.ts",
        },
      },
    };

    const formatted = formatGitHubIssue(input);

    expect(formatted.title).not.toContain("supersecretpassword123");
    expect(formatted.title).toContain("[REDACTED]");

    expect(formatted.body).not.toContain("superSecret123");
    expect(formatted.body).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
    expect(formatted.body).toContain("[REDACTED_PASSWORD]");
    expect(formatted.body).toContain("[REDACTED_TOKEN]");
  });

  it("truncates long titles to 150 characters maximum", () => {
    const longTestTitle = "A".repeat(120);
    const longError = "B".repeat(100);

    const input = {
      failureSignature: {
        id: "sig-long",
        signatureHash: "longhash",
        normalizedError: longError,
        occurrenceCount: 1,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      sampleDetail: {
        sanitizedErrorMessage: longError,
        testResult: {
          testTitle: longTestTitle,
          specFile: "spec.ts",
        },
      },
    };

    const formatted = formatGitHubIssue(input);
    expect(formatted.title.length).toBeLessThanOrEqual(150);
    expect(formatted.title.endsWith("...")).toBe(true);
  });
});
