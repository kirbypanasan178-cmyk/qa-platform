import { describe, it, expect } from "vitest";
import {
  generateFailureSignature,
  normalizeErrorMessage,
  normalizeSpecFile,
} from "@/lib/signature";

describe("Failure Signature Generator", () => {
  it("normalizes dynamic timestamps, UUIDs, and durations in error messages", () => {
    const error1 = "Timeout 30000ms exceeded at 2026-10-26T08:00:00.000Z for entity 123e4567-e89b-12d3-a456-426614174000 at line 45";
    const error2 = "Timeout 60000ms exceeded at 2026-10-27T12:34:56.789Z for entity aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee at line 99";

    const norm1 = normalizeErrorMessage(error1);
    const norm2 = normalizeErrorMessage(error2);

    expect(norm1).toBe(norm2);
    expect(norm1).toContain("timeout [duration] exceeded at [timestamp] for entity [uuid] at line [line]");
  });

  it("normalizes Windows and POSIX spec file paths consistently", () => {
    const winPath = "C:\\Projects\\qa-platform\\tests\\intern\\clock-in.spec.ts";
    const posixPath = "/var/ci/workspace/tests/intern/clock-in.spec.ts";

    const normWin = normalizeSpecFile(winPath);
    const normPosix = normalizeSpecFile(posixPath);

    expect(normWin).toBe("tests/intern/clock-in.spec.ts");
    expect(normPosix).toBe("tests/intern/clock-in.spec.ts");
  });

  it("generates identical SHA-256 signatures for recurring failures across runs", () => {
    const failureRunA = {
      specFile: "tests\\coordinator\\approval.spec.ts",
      testTitle: "should approve pending intern DTR request",
      errorType: "TimeoutError",
      errorMessage: "locator.click: Timeout 5000ms exceeded at 2026-10-26T10:00:00.000Z",
    };

    const failureRunB = {
      specFile: "tests/coordinator/approval.spec.ts",
      testTitle: "  should approve pending intern DTR request  ",
      errorType: "TimeoutError",
      errorMessage: "locator.click: Timeout 10000ms exceeded at 2026-10-27T14:15:00.000Z",
    };

    const sigA = generateFailureSignature(failureRunA);
    const sigB = generateFailureSignature(failureRunB);

    expect(sigA.signatureHash).toBe(sigB.signatureHash);
    expect(sigA.signatureHash).toHaveLength(64); // SHA-256 hex string length
  });

  it("generates different signatures for different error types or test titles", () => {
    const sigA = generateFailureSignature({
      specFile: "tests/intern/dtr.spec.ts",
      testTitle: "should clock in",
      errorType: "AssertionError",
      errorMessage: "Expected 'Pending' but received 'Rejected'",
    });

    const sigB = generateFailureSignature({
      specFile: "tests/intern/dtr.spec.ts",
      testTitle: "should clock in",
      errorType: "TimeoutError",
      errorMessage: "Expected 'Pending' but received 'Rejected'",
    });

    const sigC = generateFailureSignature({
      specFile: "tests/intern/dtr.spec.ts",
      testTitle: "should clock out",
      errorType: "AssertionError",
      errorMessage: "Expected 'Pending' but received 'Rejected'",
    });

    expect(sigA.signatureHash).not.toBe(sigB.signatureHash);
    expect(sigA.signatureHash).not.toBe(sigC.signatureHash);
  });
});
