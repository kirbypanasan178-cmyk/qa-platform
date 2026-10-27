import { describe, it, expect } from "vitest";
import { RuleBasedFailureAnalyzer } from "@/lib/analyzer/rule-engine";
import { FailureEvidence } from "@/lib/analyzer/types";

describe("RuleBasedFailureAnalyzer", () => {
  const analyzer = new RuleBasedFailureAnalyzer();

  const baseEvidence: FailureEvidence = {
    testTitle: "should clock in intern",
    specFile: "tests/intern/clockin.spec.ts",
    status: "FAILED",
    durationMs: 4500,
    retryCount: 0,
    errorMessage: "",
  };

  it("classifies Playwright strict mode violations as TEST_DEFECT", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage:
        "Error: locator.click: Error: strict mode violation: locator('button.submit-btn') resolved to 2 elements",
      stackTrace: "at tests/intern/clockin.spec.ts:32:15",
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("TEST_DEFECT");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
    expect(result.detectedPatterns).toContain(
      "Playwright Strict Mode Violation (Multiple matching elements found)"
    );
  });

  it("classifies invalid querySelector syntax as TEST_DEFECT", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage:
        "DOMException: Failed to execute 'querySelector' on 'Document': '#[invalid-attr]' is not a valid selector.",
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("TEST_DEFECT");
    expect(result.detectedPatterns).toContain("Invalid or Malformed DOM Selector Syntax");
  });

  it("classifies fixture / hook timeout as TEST_DEFECT", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage: "Test timeout of 30000ms exceeded while setting up 'beforeEach' hook.",
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("TEST_DEFECT");
    expect(result.detectedPatterns).toContain("Test Hook or Fixture Setup Timeout/Failure");
  });

  it("classifies HTTP 500 / 5xx server responses as APPLICATION_BUG", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage: "Request failed with status code 500 Internal Server Error",
      executionLogs: ["[API] POST /api/v1/attendance -> 500 Internal Server Error"],
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("APPLICATION_BUG");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(result.detectedPatterns).toContain("Backend HTTP 5xx Server Error or Crash");
  });

  it("classifies uncaught client-side application TypeError as APPLICATION_BUG", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage:
        "TypeError: Cannot read properties of undefined (reading 'companyId')",
      stackTrace: "at app/dashboard/page.tsx:88:24",
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("APPLICATION_BUG");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(90);
    expect(result.detectedPatterns).toContain(
      "Unhandled Client-Side Application Exception (TypeError/ReferenceError)"
    );
  });

  it("classifies clean assertion mismatches without timing signals as APPLICATION_BUG", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorType: "AssertionError",
      errorMessage: "Error: expect(received).toBe(expected)\n\nExpected: 'APPROVED'\nReceived: 'PENDING'",
      retryCount: 0,
      historicalOccurrences: 3,
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("APPLICATION_BUG");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
    expect(result.detectedPatterns[0]).toContain("Functional Assertion Mismatch");
  });

  it("classifies DOM element detachment and race wait timeouts as FLAKY_TEST", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage:
        "Error: locator.click: Error: element is not attached to the DOM",
      retryCount: 1,
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("FLAKY_TEST");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(80);
    expect(result.detectedPatterns).toContain(
      "DOM Element Detachment / Browser Context Closed during Action"
    );
  });

  it("does not classify passing retries as proof of flaky test when timing/race signals are absent (Req 5)", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage: "AssertionError: Expected status 'READY' but received 'DRAFT'",
      retryCount: 2, // Retried multiple times, but no race/timing errors
    };

    const result = analyzer.analyze(evidence);
    // Passing retry alone is not treated as proven flaky
    expect(result.classification).toBe("INCONCLUSIVE");
    expect(result.summary).toContain("Passing retry alone does not confirm flakiness");
  });

  it("classifies generic timeouts without diagnostics as INCONCLUSIVE", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      errorMessage: "Timeout 30000ms exceeded.",
      status: "TIMED_OUT",
      retryCount: 0,
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("INCONCLUSIVE");
    expect(result.confidenceScore).toBeLessThanOrEqual(50);
  });

  it("classifies contradictory/inverted negative assertions as TEST_DEFECT rather than application bug", () => {
    const evidence: FailureEvidence = {
      ...baseEvidence,
      testTitle: "non-numeric intern profile id or dtr submission id should not return 500",
      specFile: "Playwright-local/tests/security/coordinator-access-control.spec.js",
      errorMessage: "Error: expect(received).toContain(expected) // indexOf\n\nExpected value: 500\nReceived array: [404, 400]",
      stackTrace: "at coordinator-access-control.spec.js:55:24",
    };

    const result = analyzer.analyze(evidence);
    expect(result.classification).toBe("TEST_DEFECT");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
    expect(result.detectedPatterns[0]).toContain("Contradictory or Inverted Test Assertion");
    expect(result.summary).toContain("inverted test assertion or test defect");
  });
});
