import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface GetFailuresParams {
  page?: number;
  pageSize?: number;
  query?: string;
}

export async function getFailures(params: GetFailuresParams) {
  if (!process.env.DATABASE_URL) {
    return {
      failures: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(50, Math.max(1, params.pageSize || 10));
  const skip = (page - 1) * pageSize;

  const where: Prisma.FailureSignatureWhereInput = {};

  if (params.query && params.query.trim().length > 0) {
    const q = params.query.trim();
    where.OR = [
      { normalizedError: { contains: q, mode: "insensitive" } },
      { errorType: { contains: q, mode: "insensitive" } },
      { signatureHash: { contains: q, mode: "insensitive" } },
    ];
  }

  try {
    const [total, signatures] = await Promise.all([
      prisma.failureSignature.count({ where }),
      prisma.failureSignature.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { occurrenceCount: "desc" },
        include: {
          defect: true,
          _count: {
            select: { failureDetails: true },
          },
        },
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      failures: signatures,
      total,
      page,
      pageSize,
      totalPages,
    };
  } catch {
    return {
      failures: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0,
    };
  }
}

export async function getFailureById(id: string) {
  if (!process.env.DATABASE_URL) {
    return null;
  }

  try {
    const failure = await prisma.failureSignature.findUnique({
      where: { id },
      include: {
        defect: {
          include: {
            syncEvents: {
              orderBy: { attemptedAt: "desc" },
              take: 5,
            },
          },
        },
        failureDetails: {
          take: 10,
          orderBy: { createdAt: "desc" },
          include: {
            testResult: {
              include: {
                testRun: {
                  include: {
                    project: true,
                  },
                },
                investigation: true,
              },
            },
          },
        },
      },
    });

    return failure;
  } catch {
    return null;
  }
}
