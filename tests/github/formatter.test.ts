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
        },
      },
      cmsBaseUrl: "https://qa-cms.internal.local",
    };

    const formatted = formatGitHubIssue(input);

    expect(formatted.title).toBe(
      "[Bug] Should submit login credentials: Timeout 5000ms exceeded while waiting for locator('[data-testid=\"login-btn\"]')"
    );
    expect(formatted.labels).toContain("automated-defect");
    expect(formatted.labels).toContain("qa-failure");
    expect(formatted.labels).toContain("role:admin");

    expect(formatted.body).toContain("e2e/auth/login.spec.ts");
    expect(formatted.body).toContain("Should submit login credentials");
    expect(formatted.body).toContain("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(formatted.body).toContain("<details>");
    expect(formatted.body).toContain("LoginPage.clickLogin");
    expect(formatted.body).toContain("https://qa-cms.internal.local/failures/sig-123");
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
