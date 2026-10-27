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

  describe("listAccessibleRepositories with pagination and collaborator permissions", () => {
    it("traverses RFC 5988 link pagination across multiple pages", async () => {
      const page1Headers = new Headers();
      page1Headers.set(
        "link",
        '<https://api.github.com/user/repos?page=2&per_page=100>; rel="next", <https://api.github.com/user/repos?page=2&per_page=100>; rel="last"'
      );

      const page1Repos = [
        {
          id: 1,
          full_name: "user/repo-1",
          name: "repo-1",
          owner: { login: "user" },
          private: false,
          description: "Repo 1",
          default_branch: "main",
          html_url: "https://github.com/user/repo-1",
          has_issues: true,
          archived: false,
        },
      ];

      const page2Repos = [
        {
          id: 2,
          full_name: "collaborator-org/repo-2",
          name: "repo-2",
          owner: { login: "collaborator-org" },
          private: true,
          description: "Repo 2",
          default_branch: "master",
          html_url: "https://github.com/collaborator-org/repo-2",
          has_issues: true,
          archived: false,
          permissions: { triage: true, pull: true, push: false, admin: false },
        },
      ];

      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: page1Headers,
          json: vi.fn().mockResolvedValue(page1Repos),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: vi.fn().mockResolvedValue(page2Repos),
        });

      const client = new GitHubClient({ token: "ghp_validclassictoken" });
      const repos = await client.listAccessibleRepositories();

      expect(repos).toHaveLength(2);
      expect(repos[0].fullName).toBe("user/repo-1");
      expect(repos[1].fullName).toBe("collaborator-org/repo-2");
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("includes collaborator repositories with triage or maintain permissions", async () => {
      const mockRepos = [
        {
          id: 10,
          full_name: "collab-user/triage-repo",
          name: "triage-repo",
          owner: { login: "collab-user" },
          private: true,
          description: "Triage repo",
          default_branch: "main",
          html_url: "https://github.com/collab-user/triage-repo",
          has_issues: true,
          archived: false,
          permissions: { triage: true, pull: true, push: false, admin: false },
        },
        {
          id: 11,
          full_name: "archived-owner/archived-repo",
          name: "archived-repo",
          owner: { login: "archived-owner" },
          private: false,
          description: "Archived repo",
          default_branch: "main",
          html_url: "https://github.com/archived-owner/archived-repo",
          has_issues: true,
          archived: true,
        },
        {
          id: 12,
          full_name: "no-issues-owner/no-issues-repo",
          name: "no-issues-repo",
          owner: { login: "no-issues-owner" },
          private: false,
          description: "No issues repo",
          default_branch: "main",
          html_url: "https://github.com/no-issues-owner/no-issues-repo",
          has_issues: false,
          archived: false,
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue(mockRepos),
      });

      const client = new GitHubClient({ token: "ghp_validclassictoken" });
      const repos = await client.listAccessibleRepositories();

      expect(repos).toHaveLength(1);
      expect(repos[0].fullName).toBe("collab-user/triage-repo");
    });
  });

  describe("verifyRepositoryAccess diagnostics", () => {
    it("provides fine-grained token diagnostic notice when encountering 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ message: "Not Found" }),
      });

      const client = new GitHubClient({
        token: "github_pat_11BJH2HGI0xp3c1UiTdmPk_mocktoken",
      });

      try {
        await client.verifyRepositoryAccess("ileopoldo516382-blip", "sk-management-system");
        expect.fail("Should have thrown 404 GitHubApiError");
      } catch (err) {
        expect(err).toBeInstanceOf(GitHubApiError);
        const apiErr = err as GitHubApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.message).toContain("Fine-Grained Personal Access Token");
        expect(apiErr.message).toContain("Personal Access Token (classic)");
      }
    });
  });
});
