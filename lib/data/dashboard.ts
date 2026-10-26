import { prisma } from "@/lib/prisma";

export interface DashboardMetrics {
  totalRuns: number;
  totalTests: number;
  totalPassed: number;
  totalFailed: number;
  totalSkipped: number;
  passRate: number;
  recentRuns: Array<{
    id: string;
    runNumber: number | null;
    status: string;
    branch: string | null;
    commitSha: string | null;
    environment: string | null;
    totalTests: number;
    passedCount: number;
    failedCount: number;
    skippedCount: number;
    durationMs: number;
    startedAt: Date;
    project: {
      key: string;
      name: string;
    };
  }>;
  recentFailures: Array<{
    id: string;
    signatureHash: string;
    errorType: string | null;
    normalizedError: string;
    occurrenceCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }>;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  if (!process.env.DATABASE_URL) {
    return {
      totalRuns: 0,
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      totalSkipped: 0,
      passRate: 0,
      recentRuns: [],
      recentFailures: [],
    };
  }

  try {
    const totalRuns = await prisma.testRun.count();

    const aggregate = await prisma.testRun.aggregate({
      _sum: {
        totalTests: true,
        passedCount: true,
        failedCount: true,
        skippedCount: true,
      },
    });

    const totalTests = aggregate._sum.totalTests ?? 0;
    const totalPassed = aggregate._sum.passedCount ?? 0;
    const totalFailed = aggregate._sum.failedCount ?? 0;
    const totalSkipped = aggregate._sum.skippedCount ?? 0;

    const passRate =
      totalTests > 0 ? Math.round((totalPassed / totalTests) * 1000) / 10 : 0;

    const recentRuns = await prisma.testRun.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        runNumber: true,
        status: true,
        branch: true,
        commitSha: true,
        environment: true,
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
    });

    const recentFailures = await prisma.failureSignature.findMany({
      take: 5,
      orderBy: { occurrenceCount: "desc" },
      select: {
        id: true,
        signatureHash: true,
        errorType: true,
        normalizedError: true,
        occurrenceCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    });

    return {
      totalRuns,
      totalTests,
      totalPassed,
      totalFailed,
      totalSkipped,
      passRate,
      recentRuns,
      recentFailures,
    };
  } catch {
    // If DB is not populated or offline, return safe zero-state values
    return {
      totalRuns: 0,
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      totalSkipped: 0,
      passRate: 0,
      recentRuns: [],
      recentFailures: [],
    };
  }
}
