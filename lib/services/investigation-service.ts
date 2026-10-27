import { prisma } from "@/lib/prisma";
import {
  InvestigationStatus,
  InvestigationClassification,
} from "@prisma/client";

export class InvestigationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "InvestigationError";
    this.status = status;
  }
}

export type TriageAction =
  | "CONFIRM_BUG"
  | "REQUEST_RERUN"
  | "MARK_TEST_DEFECT"
  | "REJECT_ASSESSMENT";

export interface PerformTriageParams {
  investigationId: string;
  action: TriageAction;
  notes?: string;
  reviewedBy?: string;
  classificationOverride?: InvestigationClassification;
}

const ACTION_STATUS_MAP: Record<TriageAction, InvestigationStatus> = {
  CONFIRM_BUG: "CONFIRMED_BUG",
  REQUEST_RERUN: "RERUN_REQUESTED",
  MARK_TEST_DEFECT: "TEST_DEFECT_MARKED",
  REJECT_ASSESSMENT: "REJECTED",
};

/**
 * Performs an authorized admin triage action on an investigation record.
 * Atomically updates status, notes, timestamps, and records an audit trail.
 */
export async function performTriageAction(params: {
  investigationId: string;
  action: TriageAction;
  notes?: string;
  reviewedBy?: string;
  classificationOverride?: InvestigationClassification;
}) {
  const { investigationId, action, notes, reviewedBy, classificationOverride } = params;

  if (!investigationId || typeof investigationId !== "string") {
    throw new InvestigationError("Investigation ID is required", 400);
  }

  const targetStatus = ACTION_STATUS_MAP[action];
  if (!targetStatus) {
    throw new InvestigationError(`Invalid triage action '${action}'`, 400);
  }

  const existing = await prisma.investigation.findUnique({
    where: { id: investigationId },
    select: {
      id: true,
      status: true,
      classification: true,
      testResultId: true,
      failureDetailId: true,
    },
  });

  if (!existing) {
    throw new InvestigationError(`Investigation not found with ID '${investigationId}'`, 404);
  }

  const reviewerName = reviewedBy?.trim() || "Authorized Admin";
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const updated = await tx.investigation.update({
      where: { id: investigationId },
      data: {
        status: targetStatus,
        adminNotes: notes ? notes.trim() : undefined,
        reviewedBy: reviewerName,
        reviewedAt: now,
        ...(classificationOverride ? { classification: classificationOverride } : {}),
      },
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
        history: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    await tx.investigationHistory.create({
      data: {
        investigationId,
        fromStatus: existing.status,
        toStatus: targetStatus,
        action,
        notes: notes ? notes.trim() : null,
        performedBy: reviewerName,
        createdAt: now,
      },
    });

    return updated;
  });
}
