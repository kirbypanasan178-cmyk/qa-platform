import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import {
  performTriageAction,
  InvestigationError,
  TriageAction,
} from "@/lib/services/investigation-service";
import { z } from "zod";

const TriageActionBodySchema = z.object({
  action: z.enum([
    "CONFIRM_BUG",
    "REQUEST_RERUN",
    "MARK_TEST_DEFECT",
    "REJECT_ASSESSMENT",
  ] as [TriageAction, ...TriageAction[]]),
  notes: z.string().max(2000).optional().nullable(),
  reviewedBy: z.string().max(100).optional().nullable(),
  classificationOverride: z
    .enum(["APPLICATION_BUG", "FLAKY_TEST", "TEST_DEFECT", "INCONCLUSIVE"])
    .optional()
    .nullable(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = authenticateActionRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", message: auth.error || "Authentication required" },
      { status: auth.status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const { id } = await params;
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { error: "Bad Request", message: "Investigation ID is required" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON body" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const parsed = TriageActionBodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation Error",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
      },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const updated = await performTriageAction({
      investigationId: id.trim(),
      action: parsed.data.action,
      notes: parsed.data.notes || undefined,
      reviewedBy: parsed.data.reviewedBy || undefined,
      classificationOverride: parsed.data.classificationOverride || undefined,
    });

    return NextResponse.json(
      {
        success: true,
        data: updated,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to execute triage action";
    const status = err instanceof InvestigationError ? err.status : 500;

    return NextResponse.json(
      { error: "Triage Error", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
