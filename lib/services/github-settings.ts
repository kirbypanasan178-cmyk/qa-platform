import { prisma } from "@/lib/prisma";
import {
  GitHubClient,
  GitHubApiError,
  AccessibleRepository,
  ConnectionTestResult,
  CreatedIssueResponse,
} from "@/lib/github/client";

export type GitHubConnectionStatus = "CONNECTED" | "DISCONNECTED" | "NOT_CONFIGURED" | "INVALID_TOKEN";

export interface GitHubSettingsData {
  projectId: string;
  projectName: string;
  projectKey: string;
  status: GitHubConnectionStatus;
  isConnected: boolean;
  hasTokenConfigured: boolean;
  tokenSource: "DATABASE" | "ENVIRONMENT" | "NONE";
  accountLogin: string | null;
  accountType: string | null;
  installationId: string | null;
  selectedOwner: string | null;
  selectedRepo: string | null;
  selectedRepoFullName: string | null;
  scopes?: string;
  setupInstructions: {
    title: string;
    description: string;
    requiredPermissions: string[];
  };
}

export class GitHubSettingsError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GitHubSettingsError";
    this.status = status;
  }
}

/**
 * Checks whether an environment token is a real token or a template placeholder.
 */
function isValidEnvToken(token?: string | null): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  if (trimmed === "" || trimmed.includes("yourGitHubPersonalAccessTokenHere")) {
    return false;
  }
  return true;
}

/**
 * Resolves the target Project record (defaults to the first project in CMS if none specified).
 */
export async function resolveProject(projectId?: string) {
  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { gitHubConfig: true },
    });
    if (!project) throw new GitHubSettingsError(`Project not found with ID '${projectId}'`, 404);
    return project;
  }

  let project = await prisma.project.findFirst({
    include: { gitHubConfig: true },
  });

  if (!project) {
    project = await prisma.project.create({
      data: {
        key: "dtr-internship",
        name: "Internship DTR",
        repositoryUrl: "",
      },
      include: { gitHubConfig: true },
    });
  }

  return project;
}

/**
 * Resolves the active GitHub client and repository for a given project.
 */
export async function resolveProjectGitHubClient(projectId?: string): Promise<{
  client: GitHubClient;
  owner: string;
  repo: string;
  projectId: string;
  isConnected: boolean;
}> {
  const project = await resolveProject(projectId);
  const config = project.gitHubConfig;

  const envToken = isValidEnvToken(process.env.GITHUB_TOKEN) ? process.env.GITHUB_TOKEN : undefined;
  const token = config?.token || envToken || "";

  const owner =
    config?.targetOwner ||
    (process.env.GITHUB_OWNER && process.env.GITHUB_OWNER !== "your-github-organization-or-username"
      ? process.env.GITHUB_OWNER
      : "");

  const repo =
    config?.targetRepo ||
    (process.env.GITHUB_REPO && process.env.GITHUB_REPO !== "your-target-repo-name"
      ? process.env.GITHUB_REPO
      : "");

  const isConnected = (config ? config.isConnected : true) && !!token;

  const client = new GitHubClient({
    token,
    owner,
    repo,
  });

  return {
    client,
    owner,
    repo,
    projectId: project.id,
    isConnected,
  };
}

/**
 * Returns current GitHub settings without leaking sensitive credentials.
 */
export async function getGitHubSettings(projectId?: string): Promise<GitHubSettingsData> {
  const project = await resolveProject(projectId);
  const config = project.gitHubConfig;

  const hasEnvToken = isValidEnvToken(process.env.GITHUB_TOKEN);
  const hasDbToken = !!config?.token;
  const hasTokenConfigured = hasDbToken || hasEnvToken;

  const tokenSource: "DATABASE" | "ENVIRONMENT" | "NONE" = hasDbToken
    ? "DATABASE"
    : hasEnvToken
    ? "ENVIRONMENT"
    : "NONE";

  let status: GitHubConnectionStatus = "NOT_CONFIGURED";
  if (hasTokenConfigured) {
    if (config?.isConnected === false) {
      status = "DISCONNECTED";
    } else {
      status = "CONNECTED";
    }
  }

  const selectedOwner =
    config?.targetOwner ||
    (process.env.GITHUB_OWNER && process.env.GITHUB_OWNER !== "your-github-organization-or-username"
      ? process.env.GITHUB_OWNER
      : null);

  const selectedRepo =
    config?.targetRepo ||
    (process.env.GITHUB_REPO && process.env.GITHUB_REPO !== "your-target-repo-name"
      ? process.env.GITHUB_REPO
      : null);

  const selectedRepoFullName =
    selectedOwner && selectedRepo ? `${selectedOwner}/${selectedRepo}` : null;

  return {
    projectId: project.id,
    projectName: project.name,
    projectKey: project.key,
    status,
    isConnected: status === "CONNECTED",
    hasTokenConfigured,
    tokenSource,
    accountLogin: config?.accountLogin || null,
    accountType: config?.accountType || null,
    installationId: config?.installationId || null,
    selectedOwner,
    selectedRepo,
    selectedRepoFullName,
    setupInstructions: {
      title: "GitHub Authorization Setup",
      description:
        "Connect QA-Platform CMS using a GitHub App installation or Fine-Grained Personal Access Token (PAT). Tokens are verified server-side and never exposed to the client.",
      requiredPermissions: [
        "Repository Permissions: Issues -> Read and write (to create defect reports)",
        "Repository Permissions: Metadata -> Read-only (to list accessible repositories)",
        "Optional: Workflows / Actions -> Read-only (for CI integration status)",
      ],
    },
  };
}

/**
 * Connects the integration by validating credentials and persisting configuration.
 */
export async function connectGitHub(params: {
  projectId?: string;
  token?: string;
  installationId?: string;
}): Promise<GitHubSettingsData> {
  const project = await resolveProject(params.projectId);
  const candidateToken = params.token?.trim() || (isValidEnvToken(process.env.GITHUB_TOKEN) ? process.env.GITHUB_TOKEN! : "");

  if (!candidateToken) {
    throw new GitHubSettingsError(
      "No valid GitHub token provided and GITHUB_TOKEN is not configured on the server",
      400
    );
  }

  // Verify token against GitHub API
  const testClient = new GitHubClient({ token: candidateToken });
  let testResult: ConnectionTestResult;
  try {
    testResult = await testClient.testConnection();
  } catch (err) {
    const message = err instanceof GitHubApiError ? err.message : "GitHub authentication failed";
    const status = err instanceof GitHubApiError ? err.status : 401;
    throw new GitHubSettingsError(message, status);
  }

  // Default target owner and repo fallback
  const defaultOwner =
    project.gitHubConfig?.targetOwner ||
    testResult.login ||
    process.env.GITHUB_OWNER ||
    "";
  const defaultRepo =
    project.gitHubConfig?.targetRepo ||
    process.env.GITHUB_REPO ||
    "";

  // Upsert GitHubConfig in PostgreSQL
  await prisma.gitHubConfig.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      isConnected: true,
      token: params.token ? params.token.trim() : null,
      accountLogin: testResult.login,
      accountType: testResult.accountType,
      installationId: params.installationId || null,
      targetOwner: defaultOwner,
      targetRepo: defaultRepo,
    },
    update: {
      isConnected: true,
      ...(params.token ? { token: params.token.trim() } : {}),
      accountLogin: testResult.login,
      accountType: testResult.accountType,
      installationId: params.installationId || project.gitHubConfig?.installationId || null,
    },
  });

  return getGitHubSettings(project.id);
}

/**
 * Disconnects the GitHub integration without deleting the saved repository choice.
 */
export async function disconnectGitHub(projectId?: string): Promise<GitHubSettingsData> {
  const project = await resolveProject(projectId);

  if (project.gitHubConfig) {
    await prisma.gitHubConfig.update({
      where: { projectId: project.id },
      data: {
        isConnected: false,
      },
    });
  }

  return getGitHubSettings(project.id);
}

/**
 * Tests connection and returns latency and authorized account details.
 */
export async function testGitHubConnection(projectId?: string): Promise<ConnectionTestResult & { latencyMs: number }> {
  const { client, isConnected } = await resolveProjectGitHubClient(projectId);

  if (!isConnected) {
    throw new GitHubSettingsError("GitHub integration is not currently connected", 400);
  }

  const start = Date.now();
  const result = await client.testConnection();
  const latencyMs = Date.now() - start;

  return {
    ...result,
    latencyMs,
  };
}

/**
 * Lists repositories accessible to the authorized integration.
 */
export async function listAccessibleRepositories(projectId?: string): Promise<AccessibleRepository[]> {
  const { client, isConnected } = await resolveProjectGitHubClient(projectId);

  if (!isConnected) {
    throw new GitHubSettingsError("GitHub integration is not connected. Please connect first.", 401);
  }

  return client.listAccessibleRepositories();
}

/**
 * Saves the selected repository for automated issue creation.
 */
export async function saveGitHubRepositorySelection(params: {
  projectId?: string;
  owner: string;
  repo: string;
}): Promise<GitHubSettingsData> {
  const owner = params.owner?.trim();
  const repo = params.repo?.trim();

  if (!owner || !repo) {
    throw new GitHubSettingsError("Owner and repository name are required", 400);
  }

  const project = await resolveProject(params.projectId);
  const { client, isConnected } = await resolveProjectGitHubClient(project.id);

  if (!isConnected) {
    throw new GitHubSettingsError("GitHub integration is not connected. Connect before selecting a repository.", 401);
  }

  // Verify access to the requested repository
  await client.verifyRepositoryAccess(owner, repo);

  // Save selection in PostgreSQL
  await prisma.gitHubConfig.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      isConnected: true,
      targetOwner: owner,
      targetRepo: repo,
    },
    update: {
      targetOwner: owner,
      targetRepo: repo,
    },
  });

  return getGitHubSettings(project.id);
}

/**
 * Creates a sandbox test issue in the selected repository.
 */
export async function createSandboxTestIssue(
  projectId?: string,
  options?: { cmsBaseUrl?: string; owner?: string; repo?: string }
): Promise<CreatedIssueResponse & { targetOwner: string; targetRepo: string }> {
  const { client, owner: configuredOwner, repo: configuredRepo, isConnected } =
    await resolveProjectGitHubClient(projectId);

  if (!isConnected) {
    throw new GitHubSettingsError("GitHub integration is not connected", 401);
  }

  const targetOwner = options?.owner?.trim() || configuredOwner;
  const targetRepo = options?.repo?.trim() || configuredRepo;

  if (!targetOwner || !targetRepo) {
    throw new GitHubSettingsError(
      "No target repository specified. Please select a repository first.",
      400
    );
  }

  const issue = await client.createSandboxTestIssue(targetOwner, targetRepo, options);

  return {
    ...issue,
    targetOwner,
    targetRepo,
  };
}
