import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GET as handleGetSettings, POST as handleSaveRepo } from "@/app/api/v1/settings/github/route";
import { POST as handleConnect } from "@/app/api/v1/settings/github/connect/route";
import { POST as handleDisconnect } from "@/app/api/v1/settings/github/disconnect/route";
import { GET as handleGetRepos } from "@/app/api/v1/settings/github/repositories/route";
import { POST as handleTestConnection } from "@/app/api/v1/settings/github/test/route";
import { POST as handleTestIssue } from "@/app/api/v1/settings/github/test-issue/route";
import * as githubSettingsService from "@/lib/services/github-settings";
import { AccessibleRepository } from "@/lib/github/client";

vi.mock("@/lib/services/github-settings", async () => {
  const actual = await vi.importActual<typeof githubSettingsService>("@/lib/services/github-settings");
  return {
    ...actual,
    getGitHubSettings: vi.fn(),
    saveGitHubRepositorySelection: vi.fn(),
    connectGitHub: vi.fn(),
    disconnectGitHub: vi.fn(),
    listAccessibleRepositories: vi.fn(),
    testGitHubConnection: vi.fn(),
    createSandboxTestIssue: vi.fn(),
  };
});

describe("GitHub Settings API Routes", () => {
  const originalApiKey = process.env.CMS_API_KEY;

  beforeEach(() => {
    process.env.CMS_API_KEY = "test-secret-key-123";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.CMS_API_KEY = originalApiKey;
  });

  describe("GET /api/v1/settings/github", () => {
    it("rejects unauthorized requests with 401", async () => {
      const request = new Request("http://localhost:3000/api/v1/settings/github");
      const res = await handleGetSettings(request);
      expect(res.status).toBe(401);
    });

    it("returns settings data when authorized via same-origin", async () => {
      const mockSettings = {
        projectId: "p1",
        projectName: "Internship DTR",
        projectKey: "dtr-internship",
        status: "CONNECTED",
        isConnected: true,
        hasTokenConfigured: true,
        selectedOwner: "test-org",
        selectedRepo: "sandbox-repo",
      };
      vi.mocked(githubSettingsService.getGitHubSettings).mockResolvedValue(
        mockSettings as unknown as githubSettingsService.GitHubSettingsData
      );

      const request = new Request("http://localhost:3000/api/v1/settings/github", {
        headers: { "sec-fetch-site": "same-origin" },
      });
      const res = await handleGetSettings(request);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.selectedRepo).toBe("sandbox-repo");
    });
  });

  describe("POST /api/v1/settings/github (Save Repository Selection)", () => {
    it("validates input and returns 400 if owner or repo is missing", async () => {
      const request = new Request("http://localhost:3000/api/v1/settings/github", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner: "" }),
      });

      const res = await handleSaveRepo(request);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Validation Error");
    });

    it("saves repository selection successfully", async () => {
      vi.mocked(githubSettingsService.saveGitHubRepositorySelection).mockResolvedValue({
        selectedOwner: "sandbox-org",
        selectedRepo: "sandbox-repo",
      } as unknown as githubSettingsService.GitHubSettingsData);

      const request = new Request("http://localhost:3000/api/v1/settings/github", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner: "sandbox-org", repo: "sandbox-repo" }),
      });

      const res = await handleSaveRepo(request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(githubSettingsService.saveGitHubRepositorySelection).toHaveBeenCalledWith({
        owner: "sandbox-org",
        repo: "sandbox-repo",
      });
    });
  });

  describe("POST /api/v1/settings/github/connect", () => {
    it("connects integration successfully", async () => {
      vi.mocked(githubSettingsService.connectGitHub).mockResolvedValue({
        isConnected: true,
        status: "CONNECTED",
        accountLogin: "octocat",
      } as unknown as githubSettingsService.GitHubSettingsData);

      const request = new Request("http://localhost:3000/api/v1/settings/github/connect", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: "ghp_mockvalidtoken" }),
      });

      const res = await handleConnect(request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });

  describe("POST /api/v1/settings/github/disconnect", () => {
    it("disconnects integration successfully", async () => {
      vi.mocked(githubSettingsService.disconnectGitHub).mockResolvedValue({
        isConnected: false,
        status: "DISCONNECTED",
      } as unknown as githubSettingsService.GitHubSettingsData);

      const request = new Request("http://localhost:3000/api/v1/settings/github/disconnect", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
      });

      const res = await handleDisconnect(request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.status).toBe("DISCONNECTED");
    });
  });

  describe("GET /api/v1/settings/github/repositories", () => {
    it("returns list of accessible repositories", async () => {
      const mockRepos = [
        {
          id: 1,
          fullName: "org/repo1",
          name: "repo1",
          owner: "org",
          isPrivate: false,
          canCreateIssues: true,
        },
      ];
      vi.mocked(githubSettingsService.listAccessibleRepositories).mockResolvedValue(
        mockRepos as unknown as AccessibleRepository[]
      );

      const request = new Request("http://localhost:3000/api/v1/settings/github/repositories", {
        headers: { "sec-fetch-site": "same-origin" },
      });

      const res = await handleGetRepos(request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.count).toBe(1);
      expect(json.data[0].fullName).toBe("org/repo1");
    });
  });

  describe("POST /api/v1/settings/github/test", () => {
    it("tests connection and returns status and latency", async () => {
      vi.mocked(githubSettingsService.testGitHubConnection).mockResolvedValue({
        ok: true,
        login: "octocat",
        accountType: "User",
        latencyMs: 142,
      });

      const request = new Request("http://localhost:3000/api/v1/settings/github/test", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
      });

      const res = await handleTestConnection(request);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.latencyMs).toBe(142);
    });
  });

  describe("POST /api/v1/settings/github/test-issue", () => {
    it("creates sandbox test issue and returns 201 Created", async () => {
      vi.mocked(githubSettingsService.createSandboxTestIssue).mockResolvedValue({
        number: 99,
        url: "https://github.com/sandbox-org/sandbox-repo/issues/99",
        title: "[QA-Platform Test] Sandbox Integration Verification",
        targetOwner: "sandbox-org",
        targetRepo: "sandbox-repo",
      });

      const request = new Request("http://localhost:3000/api/v1/settings/github/test-issue", {
        method: "POST",
        headers: { "sec-fetch-site": "same-origin" },
      });

      const res = await handleTestIssue(request);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.number).toBe(99);
      expect(json.data.targetRepo).toBe("sandbox-repo");
    });

    it("accepts custom target repository in request body", async () => {
      vi.mocked(githubSettingsService.createSandboxTestIssue).mockResolvedValue({
        number: 100,
        url: "https://github.com/my-user/my-sandbox/issues/100",
        title: "[QA-Platform Test] Sandbox Integration Verification",
        targetOwner: "my-user",
        targetRepo: "my-sandbox",
      });

      const request = new Request("http://localhost:3000/api/v1/settings/github/test-issue", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ owner: "my-user", repo: "my-sandbox" }),
      });

      const res = await handleTestIssue(request);
      expect(res.status).toBe(201);
      expect(githubSettingsService.createSandboxTestIssue).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ owner: "my-user", repo: "my-sandbox" })
      );
    });
  });
});
