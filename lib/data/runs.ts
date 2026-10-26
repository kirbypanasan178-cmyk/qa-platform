import { prisma } from "@/lib/prisma";
import { Prisma, RunStatus } from "@prisma/client";

export interface GetRunsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  query?: string;
}

export async function getTestRuns(params: GetRunsParams) {
  if (!process.env.DATABASE_URL) {
    return {
      runs: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize || 10));
  const skip = (page - 1) * pageSize;

  const where: Prisma.TestRunWhereInput = {};

  if (params.status && params.status !== "ALL") {
    const validStatuses: RunStatus[] = ["PASSED", "FAILED", "PARTIAL", "RUNNING"];
    if (validStatuses.includes(params.status as RunStatus)) {
      where.status = params.status as RunStatus;
    }
  }

  if (params.query && params.query.trim().length > 0) {
    const q = params.query.trim();
    where.OR = [
      { branch: { contains: q, mode: "insensitive" } },
      { commitSha: { contains: q, mode: "insensitive" } },
      { project: { key: { contains: q, mode: "insensitive" } } },
      { environment: { contains: q, mode: "insensitive" } },
    ];
  }

  try {
    const [total, runs] = await Promise.all([
      prisma.testRun.count({ where }),
      prisma.testRun.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          runNumber: true,
          status: true,
          branch: true,
          commitSha: true,
          environment: true,
          triggeredBy: true,
          totalTests: true,
          passedCount: true,
          failedCount: true,
          skippedCount: true,
          durationMs: true,
          startedAt: true,
          project: {
            select: {
              key: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      runs,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch {
    return {
      runs: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }
}

export async function getTestRunById(id: string) {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const run = await prisma.testRun.findUnique({
      where: { id },
      include: {
        project: true,
        testResults: {
          orderBy: [{ status: "asc" }, { durationMs: "desc" }],
          include: {
            failureDetail: {
              include: {
                failureSignature: true,
              },
            },
          },
        },
      },
    });

    return run;
  } catch {
    return null;
  }
}
