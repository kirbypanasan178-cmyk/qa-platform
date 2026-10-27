import { prisma } from "@/lib/prisma";
import {
  InvestigationClassification,
  InvestigationStatus,
  Prisma,
} from "@prisma/client";

export interface GetInvestigationsParams {
  page?: number;
  pageSize?: number;
  status?: InvestigationStatus;
  classification?: InvestigationClassification;
  query?: string;
  projectId?: string;
}

export async function getInvestigations(params: GetInvestigationsParams) {
  if (!process.env.DATABASE_URL) {
    return {
      investigations: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize || 10));
  const skip = (page - 1) * pageSize;

  const where: Prisma.InvestigationWhereInput = {};

  if (params.status) {
    where.status = params.status;
  }

  if (params.classification) {
    where.classification = params.classification;
  }

  if (params.projectId) {
    where.testResult = {
      testRun: {
        projectId: params.projectId,
      },
    };
  }

  if (params.query && params.query.trim().length > 0) {
    const q = params.query.trim();
    where.OR = [
      { summary: { contains: q, mode: "insensitive" } },
      { recommendedAction: { contains: q, mode: "insensitive" } },
      { testResult: { testTitle: { contains: q, mode: "insensitive" } } },
      { testResult: { specFile: { contains: q, mode: "insensitive" } } },
    ];
  }

  try {
    const [total, investigations] = await Promise.all([
      prisma.investigation.count({ where }),
      prisma.investigation.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          testResult: {
            include: {
              testRun: {
                include: { project: true },
              },
            },
          },
          failureDetail: {
            include: {
              failureSignature: {
                include: { defect: true },
              },
            },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      investigations,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch (err) {
    console.error("Failed to query investigations:", err);
    return {
      investigations: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }
}

export async function getInvestigationById(id: string) {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    return await prisma.investigation.findUnique({
      where: { id },
      include: {
        testResult: {
          include: {
            testRun: {
              include: { project: true },
            },
          },
        },
        failureDetail: {
          include: {
            failureSignature: {
              include: {
                defect: {
                  include: {
                    syncEvents: {
                      orderBy: { attemptedAt: "desc" },
                      take: 5,
                    },
                  },
                },
              },
            },
          },
        },
        history: {
          orderBy: { createdAt: "desc" },
        },
      },
    });
  } catch (err) {
    console.error(`Failed to fetch investigation ${id}:`, err);
    return null;
  }
}

export async function getInvestigationStats(projectId?: string) {
  if (!process.env.DATABASE_URL) {
    return {
      total: 0,
      pendingReview: 0,
      confirmedBugs: 0,
      rerunRequested: 0,
      testDefects: 0,
      rejected: 0,
    };
  }

  const baseWhere: Prisma.InvestigationWhereInput = projectId
    ? { testResult: { testRun: { projectId } } }
    : {};

  try {
    const [
      total,
      pendingReview,
      confirmedBugs,
      rerunRequested,
      testDefects,
      rejected,
    ] = await Promise.all([
      prisma.investigation.count({ where: baseWhere }),
      prisma.investigation.count({
        where: { ...baseWhere, status: "PENDING_REVIEW" },
      }),
      prisma.investigation.count({
        where: { ...baseWhere, status: "CONFIRMED_BUG" },
      }),
      prisma.investigation.count({
        where: { ...baseWhere, status: "RERUN_REQUESTED" },
      }),
      prisma.investigation.count({
        where: { ...baseWhere, status: "TEST_DEFECT_MARKED" },
      }),
      prisma.investigation.count({
        where: { ...baseWhere, status: "REJECTED" },
      }),
    ]);

    return {
      total,
      pendingReview,
      confirmedBugs,
      rerunRequested,
      testDefects,
      rejected,
    };
  } catch {
    return {
      total: 0,
      pendingReview: 0,
      confirmedBugs: 0,
      rerunRequested: 0,
      testDefects: 0,
      rejected: 0,
    };
  }
}
