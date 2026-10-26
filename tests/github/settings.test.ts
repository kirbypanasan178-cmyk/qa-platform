import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getGitHubSettings,
  saveGitHubRepositorySelection,
  connectGitHub,
  disconnectGitHub,
  testGitHubConnection,
  listAccessibleRepositories,
  createSandboxTestIssue,
  GitHubSettingsError,
} from "@/lib/services/github-settings";
import { GitHubApiError } from "@/lib/github/client";

describe("GitHub Settings & Repository Selection Service", () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(async () => {
    vi.restoreAllMocks();
    process.env.CMS_API_KEY = "test-api-key";
    process.env.GITHUB_TOKEN = "ghp_mockservertoken12345";
    process.env.GITHUB_OWNER = "test-org";
    process.env.GITHUB_REPO = "sandbox-repo";

    // Clean up test database records
    await prisma.gitHubSyncEvent.deleteMany();
    await prisma.defect.deleteMany();
    await prisma.gitHubConfig.deleteMany();
    await prisma.failureDetail.deleteMany();
    await prisma.failureSignature.deleteMany();
    await prisma.testResult.deleteMany();
    await prisma.testRun.deleteMany();
    await prisma.project.deleteMany();

    // Create a seed project
    await prisma.project.create({
      data: {
        id: "proj-seed",
        key: "dtr-internship",
        name: "Internship DTR",
        repositoryUrl: "https://github.com/test-org/dtr-internship",
      },
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  describe("Retrieving Settings & Redacting Sensitive Information", () => {
    it("retrieves settings without exposing any secret tokens", async () => {
      const settings = await getGitHubSettings("proj-seed");

      expect(settings).toBeDefined();
      expect(settings.projectId).toBe("proj-seed");
      expect(settings.status).toBe("CONNECTED");
      expect(settings.hasTokenConfigured).toBe(true);

      // Verify strict token redaction: token must NEVER appear anywhere in the returned object
      const serialized = JSON.stringify(settings);
      expect(serialized).not.toContain("ghp_mockservertoken12345");
      expect((settings as unknown as Record<string, unknown>).token).toBeUndefined();
    });

    it("indicates NOT_CONFIGURED when no token is present", async () => {
      delete process.env.GITHUB_TOKEN;

      const settings = await getGitHubSettings("proj-seed");
      expect(settings.status).toBe("NOT_CONFIGURED");
      expect(settings.isConnected).toBe(false);
      expect(settings.hasTokenConfigured).toBe(false);
      expect(settings.setupInstructions.requiredPermissions.length).toBeGreaterThan(0);
    });
  });

  describe("Connecting & Disconnecting Integration", () => {
    it("connects integration with a valid token and saves account info", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo, issues" }),
        json: vi.fn().mockResolvedValue({
          login: "octocat-dev",
          name: "Octocat Developer",
          avatar_url: "https://github.com/images/octocat.png",
          type: "User",
        }),
      });

      const updated = await connectGitHub({
        projectId: "proj-seed",
        token: "ghp_customvalidtoken999",
      });

      expect(updated.isConnected).toBe(true);
      expect(updated.status).toBe("CONNECTED");
      expect(updated.accountLogin).toBe("octocat-dev");
      expect(updated.accountType).toBe("User");

      // Verify persisted in database
      const config = await prisma.gitHubConfig.findUnique({
        where: { projectId: "proj-seed" },
      });
      expect(config?.isConnected).toBe(true);
      expect(config?.accountLogin).toBe("octocat-dev");
      expect(config?.token).toBe("ghp_customvalidtoken999");
    });

    it("rejects connection with invalid credentials (401)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ message: "Bad credentials" }),
      });

      await expect(
        connectGitHub({
          projectId: "proj-seed",
          token: "ghp_invalid_expired_token",
        })
      ).rejects.toThrow(GitHubSettingsError);
    });

    it("disconnects the integration while preserving target repo", async () => {
      // First save a target repo
      await prisma.gitHubConfig.create({
        data: {
          projectId: "proj-seed",
          isConnected: true,
          targetOwner: "sandbox-org",
          targetRepo: "sandbox-tests",
        },
      });

      const disconnected = await disconnectGitHub("proj-seed");
      expect(disconnected.isConnected).toBe(false);
      expect(disconnected.status).toBe("DISCONNECTED");
      // Target repo must be preserved!
      expect(disconnected.selectedOwner).toBe("sandbox-org");
      expect(disconnected.selectedRepo).toBe("sandbox-tests");
    });
  });

  describe("Loading Accessible Repositories", () => {
    it("loads accessible repositories and filters out inaccessible / non-issue repos", async () => {
      const mockRepos = [
        {
          id: 101,
          full_name: "test-org/qa-sandbox",
          name: "qa-sandbox",
          owner: { login: "test-org" },
          private: false,
          description: "Sandbox for testing",
          default_branch: "main",
          html_url: "https://github.com/test-org/qa-sandbox",
          has_issues: true,
          permissions: { push: true, admin: false },
        },
        {
          id: 102,
          full_name: "test-org/read-only-repo",
          name: "read-only-repo",
          owner: { login: "test-org" },
          private: true,
          description: "Read only",
          default_branch: "main",
          html_url: "https://github.com/test-org/read-only-repo",
          has_issues: true,
          permissions: { push: false, admin: false }, // Cannot create issues!
        },
        {
          id: 103,
          full_name: "test-org/archived-repo",
          name: "archived-repo",
          owner: { login: "test-org" },
          private: false,
          description: "Archived",
          default_branch: "main",
          html_url: "https://github.com/test-org/archived-repo",
          has_issues: true,
          archived: true, // Archived!
          permissions: { push: true, admin: false },
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue(mockRepos),
      });

      const repos = await listAccessibleRepositories("proj-seed");

      // Should only include qa-sandbox; exclude read-only and archived repos
      expect(repos).toHaveLength(1);
      expect(repos[0].fullName).toBe("test-org/qa-sandbox");
      expect(repos[0].canCreateIssues).toBe(true);
    });

    it("throws 401 when integration is not connected", async () => {
      await prisma.gitHubConfig.create({
        data: {
          projectId: "proj-seed",
          isConnected: false,
          targetOwner: "test-org",
          targetRepo: "test-repo",
        },
      });

      await expect(listAccessibleRepositories("proj-seed")).rejects.toThrow(GitHubSettingsError);
    });
  });

  describe("Saving & Changing Repository Selection", () => {
    it("saves and retrieves repository selection in database", async () => {
      // Mock verifyRepositoryAccess
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({
          name: "qa-sandbox",
          full_name: "sandbox-org/qa-sandbox",
          permissions: { push: true, admin: false },
        }),
      });

      const updated = await saveGitHubRepositorySelection({
        projectId: "proj-seed",
        owner: "sandbox-org",
        repo: "qa-sandbox",
      });

      expect(updated.selectedOwner).toBe("sandbox-org");
      expect(updated.selectedRepo).toBe("qa-sandbox");
      expect(updated.selectedRepoFullName).toBe("sandbox-org/qa-sandbox");

      // Verify in PostgreSQL
      const dbConfig = await prisma.gitHubConfig.findUnique({
        where: { projectId: "proj-seed" },
      });
      expect(dbConfig?.targetOwner).toBe("sandbox-org");
      expect(dbConfig?.targetRepo).toBe("qa-sandbox");
    });

    it("rejects repository selection when repository is not found or lacks permissions (404/403)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({ message: "Not Found" }),
      });

      await expect(
        saveGitHubRepositorySelection({
          projectId: "proj-seed",
          owner: "unauthorized-org",
          repo: "secret-repo",
        })
      ).rejects.toThrow(GitHubApiError);
    });

    it("changing default repository updates the configuration cleanly", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({
          permissions: { push: true },
        }),
      });

      // Select Sandbox repo first
      await saveGitHubRepositorySelection({
        projectId: "proj-seed",
        owner: "sandbox-org",
        repo: "sandbox-tests",
      });

      let settings = await getGitHubSettings("proj-seed");
      expect(settings.selectedRepoFullName).toBe("sandbox-org/sandbox-tests");

      // Now switch to actual Internship DTR repo
      await saveGitHubRepositorySelection({
        projectId: "proj-seed",
        owner: "internship-org",
        repo: "internship-dtr",
      });

      settings = await getGitHubSettings("proj-seed");
      expect(settings.selectedRepoFullName).toBe("internship-org/internship-dtr");
    });
  });

  describe("Testing Connection & Sandbox Issue Creation", () => {
    it("tests connection successfully and returns latency and account info", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "x-oauth-scopes": "repo, issues" }),
        json: vi.fn().mockResolvedValue({
          login: "qa-tester",
          name: "QA Automated Tester",
          type: "User",
        }),
      });

      const result = await testGitHubConnection("proj-seed");
      expect(result.ok).toBe(true);
      expect(result.login).toBe("qa-tester");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it("creates a sandbox test issue without touching real issues", async () => {
      await prisma.gitHubConfig.create({
        data: {
          projectId: "proj-seed",
          isConnected: true,
          targetOwner: "sandbox-org",
          targetRepo: "sandbox-repo",
        },
      });

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: new Headers(),
        json: vi.fn().mockResolvedValue({
          number: 50,
          html_url: "https://github.com/sandbox-org/sandbox-repo/issues/50",
          title: "[QA-Platform Test] Sandbox Integration Verification",
        }),
      });

      const issue = await createSandboxTestIssue("proj-seed");
      expect(issue.number).toBe(50);
      expect(issue.targetOwner).toBe("sandbox-org");
      expect(issue.targetRepo).toBe("sandbox-repo");
      expect(issue.url).toContain("https://github.com/sandbox-org/sandbox-repo/issues/50");

      const [callUrl, callOptions] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callUrl).toContain("/repos/sandbox-org/sandbox-repo/issues");
      const sentBody = JSON.parse(callOptions.body);
      expect(sentBody.labels).toContain("qa-sandbox");
    });
  });
});
