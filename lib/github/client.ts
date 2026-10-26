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

/**
 * Server-side GitHub API client with timeout protection,
 * rate limit detection, and structured error handling.
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
