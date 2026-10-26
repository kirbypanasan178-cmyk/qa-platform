import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import {
  retryDefectSync,
  DefectSyncError,
  SyncInProgressError,
} from "@/lib/services/defect-sync";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  // 1. Authorize Request
  const auth = authenticateActionRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: auth.error || "Authentication required",
      },
      {
        status: auth.status,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }

  // 2. Extract and Validate ID
  const { id } = await params;
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Defect ID is required",
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }

  // 3. Execute Retry Synchronization
  try {
    const origin = request.headers.get("origin") || undefined;
    const result = await retryDefectSync(id.trim(), { cmsBaseUrl: origin });

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch (err: unknown) {
    if (err instanceof SyncInProgressError) {
      return NextResponse.json(
        {
          error: "Conflict",
          message: err.message,
        },
        {
          status: 409,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    if (err instanceof DefectSyncError) {
      return NextResponse.json(
        {
          error: "GitHub Retry Error",
          message: err.message,
          retryable: err.isRetryable,
        },
        {
          status: err.status,
          headers: { "Cache-Control": "no-store, max-age=0" },
        }
      );
    }

    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: err instanceof Error ? err.message : "An unexpected error occurred",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  }
}
