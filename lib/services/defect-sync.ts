import { prisma } from "@/lib/prisma";
import { GitHubClient, GitHubApiError } from "@/lib/github/client";
import { formatGitHubIssue } from "@/lib/github/formatter";
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
}

/**
 * Creates or synchronizes a GitHub issue for a given failure signature.
 * Enforces deduplication across existing database records and remote GitHub search.
 */
export async function createOrSyncDefect(
  failureSignatureId: string,
  options?: DefectSyncOptions
): Promise<SyncDefectResult> {
  const client = options?.githubClient || new GitHubClient();

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
            },
          },
        },
      },
    },
  });

  if (!signature) {
    throw new DefectSyncError("Failure signature not found", 404);
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

  // 2. Check Existing Defect Record
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

  // 3. Search Remote GitHub Issues to avoid creating duplicates (Deduplication via Hash)
  const existingRemoteIssue = await client.searchIssueByHash(signature.signatureHash);
  if (existingRemoteIssue) {
    const defect = await prisma.defect.upsert({
      where: { failureSignatureId },
      create: {
        projectId,
        failureSignatureId,
        githubIssueNumber: existingRemoteIssue.number,
        githubIssueUrl: existingRemoteIssue.url,
        issueTitle: existingRemoteIssue.title,
        syncStatus: SyncStatus.SYNCED,
        lastSyncError: null,
      },
      update: {
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

  // 4. Format Issue Payload
  const formatted = formatGitHubIssue({
    failureSignature: signature,
    sampleDetail: signature.failureDetails[0],
    cmsBaseUrl: options?.cmsBaseUrl,
  });

  // 5. Mark Defect as PENDING before initiating network call
  let defect = await prisma.defect.upsert({
    where: { failureSignatureId },
    create: {
      projectId,
      failureSignatureId,
      issueTitle: formatted.title,
      syncStatus: SyncStatus.PENDING,
      lastSyncError: null,
    },
    update: {
      issueTitle: formatted.title,
      syncStatus: SyncStatus.PENDING,
      lastSyncError: null,
    },
  });

  // 6. Execute Issue Creation with 1 transient retry on 5xx/network errors
  try {
    let created;
    try {
      created = await client.createIssue({
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
          title: formatted.title,
          body: formatted.body,
          labels: formatted.labels,
        });
      } else {
        throw firstErr;
      }
    }

    // 7. On Success: Update Defect & record Sync Event
    defect = await prisma.defect.update({
      where: { id: defect.id },
      data: {
        syncStatus: SyncStatus.SYNCED,
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

    // Update Defect with FAILED status
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
 */
export async function retryDefectSync(
  defectId: string,
  options?: DefectSyncOptions
): Promise<SyncDefectResult> {
  const client = options?.githubClient || new GitHubClient();

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

  // Deduplication check via search in case an issue was created during an earlier attempt
  const existingRemoteIssue = await client.searchIssueByHash(defect.failureSignature.signatureHash);
  if (existingRemoteIssue) {
    const updatedDefect = await prisma.defect.update({
      where: { id: defect.id },
      data: {
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
      title: formatted.title,
      body: formatted.body,
      labels: formatted.labels,
    });

    const updatedDefect = await prisma.defect.update({
      where: { id: defect.id },
      data: {
        syncStatus: SyncStatus.SYNCED,
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
