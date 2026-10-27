import { prisma } from "@/lib/prisma";
import { GitHubClient, GitHubApiError } from "@/lib/github/client";
import { formatGitHubIssue } from "@/lib/github/formatter";
import { resolveProjectGitHubClient } from "@/lib/services/github-settings";
import { SyncStatus, SyncAction, SyncEventStatus } from "@prisma/client";

export class DefectSyncError extends Error {
  status: number;
  isRetryable: boolean;

  constructor(message: string, status = 500, isRetryable = false) {
    super(message);
    this.name = "DefectSyncError";
    this.status = status;
    this.isRetryable = isRetryable;
  }
}

export class SyncInProgressError extends DefectSyncError {
  constructor(message = "Synchronization is currently in progress. Please wait.") {
    super(message, 409, false);
    this.name = "SyncInProgressError";
  }
}

export interface SyncDefectResult {
  defect: {
    id: string;
    projectId: string;
    failureSignatureId: string;
    githubOwner?: string | null;
    githubRepo?: string | null;
    githubIssueNumber: number | null;
    githubIssueUrl: string | null;
    issueTitle: string;
    syncStatus: SyncStatus;
    lastSyncError: string | null;
  };
  isNew: boolean;
  alreadySynced: boolean;
  deduplicated?: boolean;
}

export interface DefectSyncOptions {
  githubClient?: GitHubClient;
  cmsBaseUrl?: string;
  bypassInvestigationCheck?: boolean;
}

/**
 * Creates or synchronizes a GitHub issue for a given failure signature in the configured repository.
 * Enforces deduplication across existing database records and remote GitHub search.
 */
export async function createOrSyncDefect(
  failureSignatureId: string,
  options?: DefectSyncOptions
): Promise<SyncDefectResult> {
  // 1. Fetch Failure Signature with its existing Defect and diagnostic samples
  const signature = await prisma.failureSignature.findUnique({
    where: { id: failureSignatureId },
    include: {
      defect: true,
      failureDetails: {
        take: 1,
        orderBy: { createdAt: "desc" },
        include: {
          testResult: {
            include: {
              testRun: {
                select: { projectId: true },
              },
              investigation: true,
            },
          },
        },
      },
    },
  });

  if (!signature) {
    throw new DefectSyncError("Failure signature not found", 404);
  }

  // Enforce investigation confirmation: Never create issues for unconfirmed failures
  const latestResult = signature.failureDetails[0]?.testResult;
  if (
    latestResult?.investigation &&
    latestResult.investigation.status !== "CONFIRMED_BUG" &&
    !options?.bypassInvestigationCheck
  ) {
    throw new DefectSyncError(
      `GitHub issues can only be created for confirmed bugs. Current investigation status is '${latestResult.investigation.status}'.`,
      403
    );
  }

  // Determine Project ID
  let projectId = signature.failureDetails[0]?.testResult?.testRun?.projectId;
  if (!projectId) {
    const defaultProject = await prisma.project.findFirst({
      select: { id: true },
    });
    if (!defaultProject) {
      throw new DefectSyncError("No target project found in CMS", 400);
    }
    projectId = defaultProject.id;
  }

  // 2. Resolve target GitHub client and target repository
  let client: GitHubClient;
  let targetOwner = "";
  let targetRepo = "";

  if (options?.githubClient) {
    client = options.githubClient;
    const clientOwner = typeof client.getDefaultOwner === "function" ? client.getDefaultOwner() : "";
    const clientRepo = typeof client.getDefaultRepo === "function" ? client.getDefaultRepo() : "";
    targetOwner = clientOwner;
    targetRepo = clientRepo;

    if (!targetOwner || !targetRepo) {
      try {
        const resolved = await resolveProjectGitHubClient(projectId);
        targetOwner = targetOwner || resolved.owner;
        targetRepo = targetRepo || resolved.repo;
      } catch {
        // Fallback
      }
      targetOwner = targetOwner || process.env.GITHUB_OWNER || "mock-owner";
      targetRepo = targetRepo || process.env.GITHUB_REPO || "mock-repo";
    }
  } else {
    const resolved = await resolveProjectGitHubClient(projectId);
    client = resolved.client;
    targetOwner = resolved.owner;
    targetRepo = resolved.repo;
  }

  if (!targetOwner || !targetRepo) {
    throw new DefectSyncError(
      "Target GitHub repository is not configured. Please select a repository in Settings.",
      400
    );
  }

  // 3. Check Existing Defect Record
  if (signature.defect) {
    if (signature.defect.syncStatus === SyncStatus.SYNCED) {
      return {
        defect: signature.defect,
        isNew: false,
        alreadySynced: true,
      };
    }

    // Concurrency protection: If status is PENDING and was updated within the last 30s
    if (signature.defect.syncStatus === SyncStatus.PENDING) {
      const msSinceLastUpdate = Date.now() - signature.defect.updatedAt.getTime();
      if (msSinceLastUpdate < 30_000) {
        throw new SyncInProgressError();
      }
    }
  }

  // 4. Search Remote GitHub Issues in target repository to avoid duplicate issues
  const existingRemoteIssue = await client.searchIssueByHash(signature.signatureHash, {
    owner: targetOwner,
    repo: targetRepo,
  });

  if (existingRemoteIssue) {
    const defect = await prisma.defect.upsert({
      where: { failureSignatureId },
      create: {
        projectId,
        failureSignatureId,
        githubOwner: targetOwner,
        githubRepo: targetRepo,
        githubIssueNumber: existingRemoteIssue.number,
        githubIssueUrl: existingRemoteIssue.url,
        issueTitle: existingRemoteIssue.title,
        syncStatus: SyncStatus.SYNCED,
        lastSyncError: null,
      },
      update: {
        githubOwner: targetOwner,
        githubRepo: targetRepo,
        githubIssueNumber: existingRemoteIssue.number,
        githubIssueUrl: existingRemoteIssue.url,
        issueTitle: existingRemoteIssue.title,
        syncStatus: SyncStatus.SYNCED,
        lastSyncError: null,
      },
    });

    await prisma.gitHubSyncEvent.create({
      data: {
        defectId: defect.id,
        action: SyncAction.CREATE,
        status: SyncEventStatus.SUCCESS,
      },
    });

    return {
      defect,
      isNew: false,
      alreadySynced: true,
      deduplicated: true,
    };
  }

  // 5. Format Issue Payload
  const formatted = formatGitHubIssue({
    failureSignature: signature,
    sampleDetail: signature.failureDetails[0],
    cmsBaseUrl: options?.cmsBaseUrl,
  });

  // 6. Mark Defect as PENDING with the targeted repository before initiating network call
  let defect = await prisma.defect.upsert({
    where: { failureSignatureId },
    create: {
      projectId,
      failureSignatureId,
      githubOwner: targetOwner,
      githubRepo: targetRepo,
      issueTitle: formatted.title,
      syncStatus: SyncStatus.PENDING,
      lastSyncError: null,
    },
    update: {
      githubOwner: targetOwner,
      githubRepo: targetRepo,
      issueTitle: formatted.title,
      syncStatus: SyncStatus.PENDING,
      lastSyncError: null,
    },
  });

  // 7. Execute Issue Creation in the target repository with 1 transient retry on 5xx/network errors
  try {
    let created;
    try {
      created = await client.createIssue({
        owner: targetOwner,
        repo: targetRepo,
        title: formatted.title,
        body: formatted.body,
        labels: formatted.labels,
      });
    } catch (firstErr: unknown) {
      const isTransient =
        firstErr instanceof GitHubApiError &&
        (firstErr.status >= 500 || firstErr.status === 502 || firstErr.status === 504);

      if (isTransient) {
        // Wait 1000ms bounded backoff and retry once
        await new Promise((res) => setTimeout(res, 1000));
        created = await client.createIssue({
          owner: targetOwner,
          repo: targetRepo,
          title: formatted.title,
          body: formatted.body,
          labels: formatted.labels,
        });
      } else {
        throw firstErr;
      }
    }

    // 8. On Success: Update Defect & record Sync Event
    defect = await prisma.defect.update({
      where: { id: defect.id },
      data: {
        syncStatus: SyncStatus.SYNCED,
        githubOwner: targetOwner,
        githubRepo: targetRepo,
        githubIssueNumber: created.number,
        githubIssueUrl: created.url,
        issueTitle: created.title,
        lastSyncError: null,
      },
    });

    await prisma.gitHubSyncEvent.create({
      data: {
        defectId: defect.id,
        action: SyncAction.CREATE,
        status: SyncEventStatus.SUCCESS,
      },
    });

    return {
      defect,
      isNew: true,
      alreadySynced: false,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to create issue on GitHub";
    const status = err instanceof GitHubApiError ? err.status : 500;
    const isRetryable = status >= 500 || (err instanceof GitHubApiError && err.isRateLimit);

    defect = await prisma.defect.update({
      where: { id: defect.id },
      data: {
        syncStatus: SyncStatus.FAILED,
        lastSyncError: errorMsg,
      },
    });

    await prisma.gitHubSyncEvent.create({
      data: {
        defectId: defect.id,
        action: SyncAction.CREATE,
        status: SyncEventStatus.ERROR,
        errorMessage: errorMsg,
      },
    });

    throw new DefectSyncError(errorMsg, status, isRetryable);
  }
}

/**
 * Retries a previously failed Defect synchronization.
 * Preserves the defect's originally designated target repository.
 */
export async function retryDefectSync(
  defectId: string,
  options?: DefectSyncOptions
): Promise<SyncDefectResult> {
  const defect = await prisma.defect.findUnique({
    where: { id: defectId },
    include: {
      failureSignature: {
        include: {
          failureDetails: {
            take: 1,
            orderBy: { createdAt: "desc" },
            include: {
              testResult: true,
            },
          },
        },
      },
    },
  });

  if (!defect) {
    throw new DefectSyncError("Defect record not found", 404);
  }

  if (defect.syncStatus === SyncStatus.SYNCED) {
    return {
      defect,
      isNew: false,
      alreadySynced: true,
    };
  }

  // Concurrency check
  if (defect.syncStatus === SyncStatus.PENDING) {
    const msSinceLastUpdate = Date.now() - defect.updatedAt.getTime();
    if (msSinceLastUpdate < 30_000) {
      throw new SyncInProgressError();
    }
  }

  // When an issue has never been successfully created, retry using the project's current repository configuration.
  const hasNeverSynced = !defect.githubIssueNumber;

  let targetOwner = hasNeverSynced ? "" : (defect.githubOwner || "");
  let targetRepo = hasNeverSynced ? "" : (defect.githubRepo || "");
  let client: GitHubClient;

  if (options?.githubClient) {
    client = options.githubClient;
    const clientOwner = typeof client.getDefaultOwner === "function" ? client.getDefaultOwner() : "";
    const clientRepo = typeof client.getDefaultRepo === "function" ? client.getDefaultRepo() : "";
    targetOwner = clientOwner || targetOwner;
    targetRepo = clientRepo || targetRepo;

    if (!targetOwner || !targetRepo) {
      try {
        const resolved = await resolveProjectGitHubClient(defect.projectId);
        targetOwner = targetOwner || resolved.owner;
        targetRepo = targetRepo || resolved.repo;
      } catch {
        // Fallback
      }
      targetOwner = targetOwner || defect.githubOwner || process.env.GITHUB_OWNER || "mock-owner";
      targetRepo = targetRepo || defect.githubRepo || process.env.GITHUB_REPO || "mock-repo";
    }
  } else {
    const resolved = await resolveProjectGitHubClient(defect.projectId);
    client = resolved.client;
    targetOwner = targetOwner || resolved.owner || defect.githubOwner || "";
    targetRepo = targetRepo || resolved.repo || defect.githubRepo || "";
  }

  if (!targetOwner || !targetRepo) {
    throw new DefectSyncError("Target GitHub repository is not configured for retry", 400);
  }

  // Deduplication check via search in case an issue was created during an earlier attempt
  const existingRemoteIssue = await client.searchIssueByHash(
    defect.failureSignature.signatureHash,
    { owner: targetOwner, repo: targetRepo }
  );

  if (existingRemoteIssue) {
    const updatedDefect = await prisma.defect.update({
      where: { id: defect.id },
      data: {
        githubOwner: targetOwner,
        githubRepo: targetRepo,
        githubIssueNumber: existingRemoteIssue.number,
        githubIssueUrl: existingRemoteIssue.url,
        issueTitle: existingRemoteIssue.title,
        syncStatus: SyncStatus.SYNCED,
        lastSyncError: null,
      },
    });

    await prisma.gitHubSyncEvent.create({
      data: {
        defectId: defect.id,
        action: SyncAction.RETRY,
        status: SyncEventStatus.SUCCESS,
      },
    });

    return {
      defect: updatedDefect,
      isNew: false,
      alreadySynced: true,
      deduplicated: true,
    };
  }

  // Format issue
  const formatted = formatGitHubIssue({
    failureSignature: defect.failureSignature,
    sampleDetail: defect.failureSignature.failureDetails[0],
    cmsBaseUrl: options?.cmsBaseUrl,
  });

  // Mark PENDING
  await prisma.defect.update({
    where: { id: defect.id },
    data: {
      syncStatus: SyncStatus.PENDING,
      lastSyncError: null,
    },
  });

  try {
    const created = await client.createIssue({
      owner: targetOwner,
      repo: targetRepo,
      title: formatted.title,
      body: formatted.body,
      labels: formatted.labels,
    });

    const updatedDefect = await prisma.defect.update({
      where: { id: defect.id },
      data: {
        syncStatus: SyncStatus.SYNCED,
        githubOwner: targetOwner,
        githubRepo: targetRepo,
        githubIssueNumber: created.number,
        githubIssueUrl: created.url,
        issueTitle: created.title,
        lastSyncError: null,
      },
    });

    await prisma.gitHubSyncEvent.create({
      data: {
        defectId: defect.id,
        action: SyncAction.RETRY,
        status: SyncEventStatus.SUCCESS,
      },
    });

    return {
      defect: updatedDefect,
      isNew: false,
      alreadySynced: false,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Failed to retry synchronization";
    const status = err instanceof GitHubApiError ? err.status : 500;
    const isRetryable = status >= 500 || (err instanceof GitHubApiError && err.isRateLimit);

    await prisma.defect.update({
      where: { id: defect.id },
      data: {
        syncStatus: SyncStatus.FAILED,
        lastSyncError: errorMsg,
        githubOwner: targetOwner,
        githubRepo: targetRepo,
      },
    });

    await prisma.gitHubSyncEvent.create({
      data: {
        defectId: defect.id,
        action: SyncAction.RETRY,
        status: SyncEventStatus.ERROR,
        errorMessage: errorMsg,
      },
    });

    throw new DefectSyncError(errorMsg, status, isRetryable);
  }
}
