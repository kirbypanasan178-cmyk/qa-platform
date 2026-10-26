import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubClient, GitHubApiError } from "@/lib/github/client";

describe("GitHubClient", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("throws 401 if GITHUB_TOKEN is not configured", async () => {
    const client = new GitHubClient({ token: "", owner: "owner", repo: "repo" });

    await expect(
      client.createIssue({ title: "Test Bug", body: "Diagnostic details" })
    ).rejects.toThrow(GitHubApiError);

    try {
      await client.createIssue({ title: "Test Bug", body: "Diagnostic details" });
    } catch (err) {
      expect((err as GitHubApiError).status).toBe(401);
    }
  });

  it("throws 400 if owner or repo is not configured", async () => {
    const client = new GitHubClient({ token: "ghp_validtoken", owner: "", repo: "" });

    await expect(
      client.createIssue({ title: "Test Bug", body: "Diagnostic details" })
    ).rejects.toThrow(GitHubApiError);

    try {
      await client.createIssue({ title: "Test Bug", body: "Diagnostic details" });
    } catch (err) {
      expect((err as GitHubApiError).status).toBe(400);
    }
  });

  it("successfully creates an issue when GitHub API responds 201", async () => {
    const mockResponse = {
      number: 42,
      html_url: "https://github.com/test-owner/test-repo/issues/42",
      title: "Test Issue",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue(mockResponse),
      headers: new Headers(),
    });

    const client = new GitHubClient({
      token: "ghp_validmocktoken12345",
      owner: "test-owner",
      repo: "test-repo",
    });

    const result = await client.createIssue({
      title: "Test Issue",
      body: "Issue description",
    });

    expect(result).toEqual({
      number: 42,
      url: "https://github.com/test-owner/test-repo/issues/42",
      title: "Test Issue",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [callUrl, callOptions] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callUrl).toContain("/repos/test-owner/test-repo/issues");
    expect(callOptions.method).toBe("POST");
  });

  it("detects and parses rate limit responses (403 with x-ratelimit-remaining: 0)", async () => {
    const headers = new Headers();
    headers.set("x-ratelimit-remaining", "0");
    headers.set("retry-after", "60");

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers,
      json: vi.fn().mockResolvedValue({ message: "API rate limit exceeded" }),
    });

    const client = new GitHubClient({
      token: "ghp_validmocktoken12345",
      owner: "test-owner",
      repo: "test-repo",
    });

    try {
      await client.createIssue({ title: "Rate Limit Test", body: "body" });
      expect.fail("Should have thrown GitHubApiError");
    } catch (err) {
      expect(err).toBeInstanceOf(GitHubApiError);
      const apiErr = err as GitHubApiError;
      expect(apiErr.isRateLimit).toBe(true);
      expect(apiErr.retryAfterSeconds).toBe(60);
    }
  });

  it("searches issues by hash and returns existing issue if found", async () => {
    const mockSearchResult = {
      total_count: 1,
      items: [
        {
          number: 101,
          html_url: "https://github.com/test-owner/test-repo/issues/101",
          title: "[Bug] Login failure",
          state: "open",
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(mockSearchResult),
      headers: new Headers(),
    });

    const client = new GitHubClient({
      token: "ghp_validmocktoken12345",
      owner: "test-owner",
      repo: "test-repo",
    });

    const found = await client.searchIssueByHash("hash-abc-123");
    expect(found).toEqual({
      number: 101,
      url: "https://github.com/test-owner/test-repo/issues/101",
      title: "[Bug] Login failure",
      state: "open",
    });
  });

  it("returns null when search yields no matches", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ total_count: 0, items: [] }),
      headers: new Headers(),
    });

    const client = new GitHubClient({
      token: "ghp_validmocktoken12345",
      owner: "test-owner",
      repo: "test-repo",
    });

    const found = await client.searchIssueByHash("nonexistent-hash");
    expect(found).toBeNull();
  });
});
