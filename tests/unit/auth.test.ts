import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  verifyApiKey,
  authenticateIngestionRequest,
} from "@/lib/auth/api-key";

describe("API Key Authentication", () => {
  const originalEnv = process.env.CMS_API_KEY;

  beforeEach(() => {
    process.env.CMS_API_KEY = "test-secret-api-key-12345";
  });

  afterEach(() => {
    process.env.CMS_API_KEY = originalEnv;
  });

  it("verifies matching keys using constant-time comparison", () => {
    expect(verifyApiKey("test-secret-api-key-12345", "test-secret-api-key-12345")).toBe(true);
    expect(verifyApiKey("wrong-key", "test-secret-api-key-12345")).toBe(false);
    expect(verifyApiKey(null, "test-secret-api-key-12345")).toBe(false);
    expect(verifyApiKey(undefined, "test-secret-api-key-12345")).toBe(false);
    expect(verifyApiKey("test-secret-api-key-12345", undefined)).toBe(false);
  });

  it("authenticates requests with valid X-API-Key header", () => {
    const request = new Request("http://localhost/api/v1/test-runs", {
      headers: { "x-api-key": "test-secret-api-key-12345" },
    });
    const result = authenticateIngestionRequest(request);
    expect(result.authenticated).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("authenticates requests with valid Authorization: Bearer token", () => {
    const request = new Request("http://localhost/api/v1/test-runs", {
      headers: { authorization: "Bearer test-secret-api-key-12345" },
    });
    const result = authenticateIngestionRequest(request);
    expect(result.authenticated).toBe(true);
  });

  it("rejects requests with missing authentication headers", () => {
    const request = new Request("http://localhost/api/v1/test-runs");
    const result = authenticateIngestionRequest(request);
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("Missing API key");
  });

  it("rejects requests with invalid credentials", () => {
    const request = new Request("http://localhost/api/v1/test-runs", {
      headers: { "x-api-key": "invalid-token" },
    });
    const result = authenticateIngestionRequest(request);
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("Invalid API key");
  });

  it("fails safely when server CMS_API_KEY is not configured", () => {
    delete process.env.CMS_API_KEY;
    const request = new Request("http://localhost/api/v1/test-runs", {
      headers: { "x-api-key": "some-key" },
    });
    const result = authenticateIngestionRequest(request);
    expect(result.authenticated).toBe(false);
    expect(result.error).toContain("unconfigured");
  });
});
