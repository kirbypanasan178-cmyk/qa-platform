import { describe, it, expect } from "vitest";
import { sanitizeText } from "@/lib/sanitizer";

describe("Sensitive Data Sanitizer", () => {
  it("redacts passwords and secrets in key-value pairs", () => {
    const input = 'Error: Failed logging in with password: "superSecretPassword123"';
    const sanitized = sanitizeText(input);
    expect(sanitized).not.toContain("superSecretPassword123");
    expect(sanitized).toContain('password: "[REDACTED]"');
  });

  it("redacts bearer tokens and authorization headers", () => {
    const input = "Headers: Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret";
    const sanitized = sanitizeText(input);
    expect(sanitized).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.secret");
    expect(sanitized).toContain("[REDACTED_TOKEN]");
  });

  it("redacts GitHub personal access tokens", () => {
    const input = "Request failed for repo using token ghp_1234567890abcdefghijklmnopqrstuvwxyzAB";
    const sanitized = sanitizeText(input);
    expect(sanitized).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwxyzAB");
    expect(sanitized).toContain("[REDACTED_GITHUB_TOKEN]");
  });

  it("redacts credentials embedded in URLs", () => {
    const input = "Connecting to https://admin:p@ssw0rd!@internal-api.example.com/v1/users";
    const sanitized = sanitizeText(input);
    expect(sanitized).not.toContain("admin:p@ssw0rd!");
    expect(sanitized).toContain("https://[REDACTED_USER]:[REDACTED_PASSWORD]@internal-api.example.com/v1/users");
  });

  it("redacts cookies from header strings", () => {
    const input = "Response header Set-Cookie: session_id=xyz789; Secure; HttpOnly";
    const sanitized = sanitizeText(input);
    expect(sanitized).not.toContain("session_id=xyz789");
    expect(sanitized).toContain("Set-Cookie: [REDACTED_COOKIES]");
  });

  it("redacts local user home filesystem paths", () => {
    const winPath = "Error at D:\\Website Project\\qa-platform or C:\\Users\\kirby\\tests\\app.spec.ts:15:3";
    const posixPath = "Error at /home/developer/workspace/app.spec.ts:15:3";

    expect(sanitizeText(winPath)).not.toContain("C:\\Users\\kirby");
    expect(sanitizeText(winPath)).toContain("C:\\Users\\[REDACTED_USER]");

    expect(sanitizeText(posixPath)).not.toContain("/home/developer");
    expect(sanitizeText(posixPath)).toContain("/home/[REDACTED_USER]");
  });

  it("strips ANSI escape sequences from terminal traces", () => {
    const ansiString = "\u001b[31mError:\u001b[39m \u001b[1mAssertion failed\u001b[22m";
    const sanitized = sanitizeText(ansiString);
    expect(sanitized).toBe("Error: Assertion failed");
  });

  it("redacts custom provided secrets", () => {
    const secret = "super-confidential-api-value";
    const input = `Request failed: ${secret} was rejected`;
    const sanitized = sanitizeText(input, { customSecrets: [secret] });
    expect(sanitized).not.toContain(secret);
    expect(sanitized).toContain("[REDACTED_SECRET]");
  });

  it("handles null, undefined, and empty string safely", () => {
    expect(sanitizeText(null)).toBe("");
    expect(sanitizeText(undefined)).toBe("");
    expect(sanitizeText("")).toBe("");
  });
});
