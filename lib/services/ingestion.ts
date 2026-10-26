import { prisma } from "@/lib/prisma";
import { TestRunIngestionInput } from "@/lib/schemas/test-run";
import { sanitizeText } from "@/lib/sanitizer";
import { generateFailureSignature } from "@/lib/signature";
import { Prisma } from "@prisma/client";

export interface IngestionResult {
  status: 200 | 201;
  runId: string;
  isDuplicate: boolean;
  message?: string;
  summary?: {
    projectKey: string;
    totalTests: number;
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    status: string;
  };
}

/**
 * Ingests a validated test run payload atomically using Prisma transactions.
 * Handles idempotency and race conditions safely.
 */
export async function processTestRunIngestion(
  input: TestRunIngestionInput
): Promise<IngestionResult> {
  // 1. Idempotency Check: if key provided, check for existing run
  if (input.idempotencyKey) {
    const existing = await prisma.testRun.findFirst({
      where: {
        idempotencyKey: input.idempotencyKey,
      } as unknown as Prisma.TestRunWhereInput,
      select: {
        id: true,
        totalTests: true,
        passedCount: true,
        failedCount: true,
        skippedCount: true,
        status: true,
      },
    });

    if (existing) {
      return {
        status: 200,
        runId: existing.id,
        isDuplicate: true,
        message: "Test run was previously ingested with this idempotency key",
        summary: {
          projectKey: input.projectKey,
          totalTests: existing.totalTests,
          passedCount: existing.passedCount,
          failedCount: existing.failedCount,
          skippedCount: existing.skippedCount,
          status: existing.status,
        },
      };
    }
  }

  // 2. Determine overall run status
  const runStatus =
    input.status ??
    (input.failedCount > 0
      ? "FAILED"
      : input.passedCount > 0
      ? "PASSED"
      : "RUNNING");

  try {
    // 3. Atomic Database Transaction
    const createdRun = await prisma.$transaction(async (tx) => {
      // Find or create Project
      const project = await tx.project.upsert({
        where: { key: input.projectKey },
        create: {
          key: input.projectKey,
          name: input.projectName || input.projectKey,
          repositoryUrl: input.repositoryUrl || "",
        },
        update: {
          ...(input.projectName ? { name: input.projectName } : {}),
          ...(input.repositoryUrl ? { repositoryUrl: input.repositoryUrl } : {}),
        },
      });

      // Create TestRun
      const testRun = await tx.testRun.create({
        data: {
          projectId: project.id,
          idempotencyKey: input.idempotencyKey || null,
          runNumber: input.runNumber,
          branch: input.branch,
          commitSha: input.commitSha,
          environment: input.environment,
          triggeredBy: input.triggeredBy,
          status: runStatus,
          totalTests: input.totalTests,
          passedCount: input.passedCount,
          failedCount: input.failedCount,
          skippedCount: input.skippedCount,
          durationMs: input.durationMs,
          startedAt: input.startedAt ? new Date(input.startedAt) : new Date(),
          completedAt: input.completedAt ? new Date(input.completedAt) : null,
        },
      });

      // Insert all test results and handle failure signatures
      for (const res of input.testResults) {
        const createdTestResult = await tx.testResult.create({
          data: {
            testRunId: testRun.id,
            suiteTitle: res.suiteTitle,
            testTitle: res.testTitle,
            specFile: res.specFile,
            role: res.role,
            status: res.status,
            durationMs: res.durationMs,
            retryCount: res.retryCount,
          },
        });

        // If the test failed and has diagnostic error information
        if (
          (res.status === "FAILED" || res.status === "TIMED_OUT") &&
          res.error
        ) {
          const sanitizedErrorMsg = sanitizeText(res.error.message);
          const sanitizedStack = res.error.stackTrace
            ? sanitizeText(res.error.stackTrace)
            : null;

          const { signatureHash, normalizedError, errorType } =
            generateFailureSignature({
              specFile: res.specFile,
              testTitle: res.testTitle,
              errorType: res.error.errorType,
              errorMessage: sanitizedErrorMsg,
            });

          // Upsert failure signature (groups recurring occurrences)
          const signature = await tx.failureSignature.upsert({
            where: { signatureHash },
            create: {
              signatureHash,
              errorType,
              normalizedError,
              occurrenceCount: 1,
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
            },
            update: {
              occurrenceCount: { increment: 1 },
              lastSeenAt: new Date(),
            },
          });

          // Create FailureDetail linked 1:1 to TestResult
          await tx.failureDetail.create({
            data: {
              testResultId: createdTestResult.id,
              failureSignatureId: signature.id,
              rawErrorMessage: res.error.message.slice(0, 10000),
              sanitizedErrorMessage: sanitizedErrorMsg,
              sanitizedStackTrace: sanitizedStack,
            },
          });
        }
      }

      return {
        id: testRun.id,
        projectKey: project.key,
        totalTests: testRun.totalTests,
        passedCount: testRun.passedCount,
        failedCount: testRun.failedCount,
        skippedCount: testRun.skippedCount,
        status: testRun.status,
      };
    });

    return {
      status: 201,
      runId: createdRun.id,
      isDuplicate: false,
      summary: {
        projectKey: createdRun.projectKey,
        totalTests: createdRun.totalTests,
        passedCount: createdRun.passedCount,
        failedCount: createdRun.failedCount,
        skippedCount: createdRun.skippedCount,
        status: createdRun.status,
      },
    };
  } catch (error) {
    // Handle concurrent duplicate insertion race condition (P2002 on idempotencyKey)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      input.idempotencyKey
    ) {
      const existing = await prisma.testRun.findFirst({
        where: {
          idempotencyKey: input.idempotencyKey,
        } as unknown as Prisma.TestRunWhereInput,
        select: {
          id: true,
          totalTests: true,
          passedCount: true,
          failedCount: true,
          skippedCount: true,
          status: true,
        },
      });

      if (existing) {
        return {
          status: 200,
          runId: existing.id,
          isDuplicate: true,
          message: "Test run was previously ingested with this idempotency key",
          summary: {
            projectKey: input.projectKey,
            totalTests: existing.totalTests,
            passedCount: existing.passedCount,
            failedCount: existing.failedCount,
            skippedCount: existing.skippedCount,
            status: existing.status,
          },
        };
      }
    }

    throw error;
  }
}
