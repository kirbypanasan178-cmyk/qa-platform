export class GitHubApiError extends Error {
  status: number;
  isRateLimit: boolean;
  retryAfterSeconds?: number;

  constructor(message: string, status: number, isRateLimit = false, retryAfterSeconds?: number) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.isRateLimit = isRateLimit;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels?: string[];
  owner?: string;
  repo?: string;
}

export interface CreatedIssueResponse {
  number: number;
  url: string;
  title: string;
}

export interface ExistingIssueResponse {
  number: number;
  url: string;
  title: string;
  state: string;
}

export interface AccessibleRepository {
  id: number;
  fullName: string;
  name: string;
  owner: string;
  isPrivate: boolean;
  description: string | null;
  defaultBranch: string;
  htmlUrl: string;
  canCreateIssues: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  login: string;
  name?: string | null;
  avatarUrl?: string | null;
  accountType: "User" | "Organization" | "App";
  scopes?: string;
}

/**
 * Server-side GitHub API client with timeout protection,
 * rate limit detection, repository querying, and structured error handling.
 */
export class GitHubClient {
  private token: string;
  private defaultOwner: string;
  private defaultRepo: string;
  private baseUrl = "https://api.github.com";

  constructor(options?: { token?: string; owner?: string; repo?: string }) {
    this.token = options?.token || process.env.GITHUB_TOKEN || "";
    this.defaultOwner = options?.owner || process.env.GITHUB_OWNER || "";
    this.defaultRepo = options?.repo || process.env.GITHUB_REPO || "";
  }

  getDefaultOwner(): string {
    return this.defaultOwner;
  }

  getDefaultRepo(): string {
    return this.defaultRepo;
  }

  private getHeaders(): HeadersInit {
    if (!this.token) {
      throw new GitHubApiError("GITHUB_TOKEN is not configured on the server", 401);
    }

    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "QA-Platform-CMS/1.0",
      "Content-Type": "application/json",
    };
  }

  /**
   * Tests the connection and authorization against the GitHub API.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.token) {
      throw new GitHubApiError("GITHUB_TOKEN is not configured on the server", 401);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 401) {
        throw new GitHubApiError("Invalid or expired GitHub credentials", 401);
      }

      if (response.ok) {
        const data = (await response.json()) as {
          login: string;
          name?: string | null;
          avatar_url?: string | null;
          type?: string;
        };
        return {
          ok: true,
          login: data.login,
          name: data.name || data.login,
          avatarUrl: data.avatar_url,
          accountType: data.type === "Organization" ? "Organization" : "User",
          scopes: response.headers.get("x-oauth-scopes") || undefined,
        };
      }

      // If /user is not accessible (e.g. GitHub App token), try /installation/repositories
      const appController = new AbortController();
      const appTimeout = setTimeout(() => appController.abort(), 8000);
      try {
        const appRes = await fetch(`${this.baseUrl}/installation/repositories?per_page=1`, {
          method: "GET",
          headers: this.getHeaders(),
          signal: appController.signal,
        });
        clearTimeout(appTimeout);
        if (appRes.ok) {
          const appData = (await appRes.json()) as {
            repositories?: Array<{
              owner?: { login: string; avatar_url?: string };
            }>;
          };
          const firstRepo = appData.repositories?.[0];
          return {
            ok: true,
            login: firstRepo?.owner?.login || "GitHub App",
            name: "GitHub App Installation",
            avatarUrl: firstRepo?.owner?.avatar_url,
            accountType: "App",
          };
        }
      } catch {
        clearTimeout(appTimeout);
      }

      let errMessage = `GitHub API request failed with status ${response.status}`;
      try {
        const errJson = (await response.json()) as { message?: string };
        if (errJson.message) errMessage = errJson.message;
      } catch {
        // ignore
      }
      throw new GitHubApiError(errMessage, response.status);
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof GitHubApiError) throw err;
      if ((err as Error)?.name === "AbortError") {
        throw new GitHubApiError("GitHub API request timed out after 8000ms", 504);
      }
      throw new GitHubApiError((err as Error)?.message || "Failed to communicate with GitHub API", 502);
    }
  }

  /**
   * Retrieves repositories accessible to the authorized integration.
   * Excludes archived repositories and repositories where issues cannot be created.
   */
  async listAccessibleRepositories(): Promise<AccessibleRepository[]> {
    if (!this.token) {
      throw new GitHubApiError("GITHUB_TOKEN is not configured on the server", 401);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      // 1. Try /user/repos for PAT and OAuth tokens
      const userReposRes = await fetch(
        `${this.baseUrl}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
        {
          method: "GET",
          headers: this.getHeaders(),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (userReposRes.status === 401) {
        throw new GitHubApiError("Invalid or expired GitHub credentials", 401);
      }

      if (userReposRes.ok) {
        const repos = (await userReposRes.json()) as Array<{
          id: number;
          full_name: string;
          name: string;
          owner: { login: string };
          private: boolean;
          description: string | null;
          default_branch: string;
          html_url: string;
          permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
          has_issues?: boolean;
          archived?: boolean;
        }>;

        return repos
          .filter((r) => !r.archived && r.has_issues !== false)
          .filter((r) => {
            if (r.permissions) {
              return r.permissions.push === true || r.permissions.admin === true;
            }
            return true;
          })
          .map((r) => ({
            id: r.id,
            fullName: r.full_name,
            name: r.name,
            owner: r.owner.login,
            isPrivate: r.private,
            description: r.description,
            defaultBranch: r.default_branch,
            htmlUrl: r.html_url,
            canCreateIssues: true,
          }));
      }

      // 2. Try /installation/repositories for GitHub App tokens
      if (userReposRes.status === 403 || userReposRes.status === 404) {
        const appController = new AbortController();
        const appTimeout = setTimeout(() => appController.abort(), 10000);

        try {
          const appRes = await fetch(`${this.baseUrl}/installation/repositories?per_page=100`, {
            method: "GET",
            headers: this.getHeaders(),
            signal: appController.signal,
          });
          clearTimeout(appTimeout);

          if (appRes.ok) {
            const data = (await appRes.json()) as {
              repositories?: Array<{
                id: number;
                full_name: string;
                name: string;
                owner: { login: string };
                private: boolean;
                description: string | null;
                default_branch: string;
                html_url: string;
                permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
                has_issues?: boolean;
                archived?: boolean;
              }>;
            };

            return (data.repositories || [])
              .filter((r) => !r.archived && r.has_issues !== false)
              .map((r) => ({
                id: r.id,
                fullName: r.full_name,
                name: r.name,
                owner: r.owner.login,
                isPrivate: r.private,
                description: r.description,
                defaultBranch: r.default_branch,
                htmlUrl: r.html_url,
                canCreateIssues: true,
              }));
          }
        } catch {
          clearTimeout(appTimeout);
        }
      }

      let errMessage = `Failed to list repositories (Status ${userReposRes.status})`;
      try {
        const errJson = (await userReposRes.json()) as { message?: string };
        if (errJson.message) errMessage = errJson.message;
      } catch {
        // ignore
      }
      throw new GitHubApiError(errMessage, userReposRes.status);
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof GitHubApiError) throw err;
      if ((err as Error)?.name === "AbortError") {
        throw new GitHubApiError("GitHub API request timed out after 10000ms", 504);
      }
      throw new GitHubApiError((err as Error)?.message || "Failed to communicate with GitHub API", 502);
    }
  }

  /**
   * Verifies that the repository exists and the authorized integration can access it.
   */
  async verifyRepositoryAccess(owner: string, repo: string): Promise<boolean> {
    if (!owner || !repo) {
      throw new GitHubApiError("Target GitHub owner or repository is not configured", 400);
    }
    if (!this.token) {
      throw new GitHubApiError("GITHUB_TOKEN is not configured on the server", 401);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(
        `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          method: "GET",
          headers: this.getHeaders(),
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (response.status === 404) {
        throw new GitHubApiError(
          `Repository '${owner}/${repo}' was not found or the integration lacks access permissions`,
          404
        );
      }

      if (response.status === 401) {
        throw new GitHubApiError("Invalid or expired GitHub credentials", 401);
      }

      if (!response.ok) {
        let errMessage = `GitHub API request failed with status ${response.status}`;
        try {
          const errJson = (await response.json()) as { message?: string };
          if (errJson.message) errMessage = errJson.message;
        } catch {
          // ignore
        }
        throw new GitHubApiError(errMessage, response.status);
      }

      const data = (await response.json()) as {
        permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
      };

      if (data.permissions && data.permissions.push === false && data.permissions.admin === false) {
        throw new GitHubApiError(
          `The integration does not have write permissions for repository '${owner}/${repo}'`,
          403
        );
      }

      return true;
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof GitHubApiError) throw err;
      if ((err as Error)?.name === "AbortError") {
        throw new GitHubApiError("GitHub API request timed out after 8000ms", 504);
      }
      throw new GitHubApiError((err as Error)?.message || "Failed to communicate with GitHub API", 502);
    }
  }

  /**
   * Creates a dedicated sandbox test issue in the specified repository.
   */
  async createSandboxTestIssue(
    owner: string,
    repo: string,
    options?: { cmsBaseUrl?: string }
  ): Promise<CreatedIssueResponse> {
    const baseUrl = options?.cmsBaseUrl || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const timestamp = new Date().toISOString();

    const body = `## QA-Platform Integration Verification

This automated issue confirms that **QA-Platform CMS** is successfully connected to repository \`${owner}/${repo}\`.

### Verification Details
- **Target Repository:** \`${owner}/${repo}\`
- **CMS URL:** ${baseUrl}
- **Timestamp:** \`${timestamp}\`
- **Issue Creation:** Operational

---
*Generated from the QA-Platform CMS Settings dashboard for sandbox integration testing.*`.trim();

    return this.createIssue({
      owner,
      repo,
      title: `[QA-Platform Test] Sandbox Integration Verification`,
      body,
      labels: ["qa-sandbox", "integration-test"],
    });
  }

  /**
   * Creates a new issue in the target repository.
   */
  async createIssue(params: CreateIssueParams): Promise<CreatedIssueResponse> {
    const owner = params.owner || this.defaultOwner;
    const repo = params.repo || this.defaultRepo;

    if (!owner || !repo) {
      throw new GitHubApiError("Target GitHub owner or repository is not configured", 400);
    }

    const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          labels: params.labels || ["automated-defect", "qa-failure"],
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      // Handle Rate Limiting
      if (response.status === 403 || response.status === 429) {
        const remaining = response.headers.get("x-ratelimit-remaining");
        const retryAfterHeader = response.headers.get("retry-after");
        const resetHeader = response.headers.get("x-ratelimit-reset");

        let retryAfterSeconds: number | undefined;
        if (retryAfterHeader) {
          retryAfterSeconds = parseInt(retryAfterHeader, 10);
        } else if (resetHeader) {
          const resetTime = parseInt(resetHeader, 10) * 1000;
          retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
        }

        if (remaining === "0" || response.status === 429) {
          throw new GitHubApiError(
            `GitHub API rate limit exceeded. Retry after ${retryAfterSeconds || 60}s`,
            response.status,
            true,
            retryAfterSeconds
          );
        }
      }

      if (!response.ok) {
        let errMessage = `GitHub API request failed with status ${response.status}`;
        try {
          const errorJson = (await response.json()) as { message?: string };
          if (errorJson.message) errMessage = errorJson.message;
        } catch {
          // ignore parsing error
        }

        if (response.status === 404) {
          errMessage = `Target repository '${owner}/${repo}' was not found on GitHub, or the authorized token lacks write permissions to it.`;
        } else if (response.status === 401) {
          errMessage = `GitHub authentication failed. Your token is invalid or has expired.`;
        }

        throw new GitHubApiError(errMessage, response.status);
      }

      const data = (await response.json()) as {
        number: number;
        html_url: string;
        title: string;
      };

      return {
        number: data.number,
        url: data.html_url,
        title: data.title,
      };
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof GitHubApiError) throw err;

      if ((err as Error)?.name === "AbortError") {
        throw new GitHubApiError("GitHub API request timed out after 10000ms", 504);
      }

      throw new GitHubApiError(
        (err as Error)?.message || "Failed to communicate with GitHub API",
        502
      );
    }
  }

  /**
   * Searches for an existing open or closed issue containing the failure signature hash.
   * Useful to prevent duplicates if a previous creation succeeded but timed out during response.
   */
  async searchIssueByHash(
    signatureHash: string,
    params?: { owner?: string; repo?: string }
  ): Promise<ExistingIssueResponse | null> {
    const owner = params?.owner || this.defaultOwner;
    const repo = params?.repo || this.defaultRepo;

    if (!owner || !repo || !this.token) {
      return null;
    }

    const query = encodeURIComponent(`repo:${owner}/${repo} "${signatureHash}" in:body is:issue`);
    const url = `${this.baseUrl}/search/issues?q=${query}&sort=created&order=desc`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = (await response.json()) as {
        items?: Array<{
          number: number;
          html_url: string;
          title: string;
          state: string;
        }>;
      };

      if (data.items && data.items.length > 0) {
        const item = data.items[0];
        return {
          number: item.number,
          url: item.html_url,
          title: item.title,
          state: item.state,
        };
      }

      return null;
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }
}
