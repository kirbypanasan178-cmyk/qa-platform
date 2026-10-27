import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import { getInvestigations, getInvestigationStats } from "@/lib/data/investigations";
import {
  InvestigationClassification,
  InvestigationStatus,
} from "@prisma/client";

export async function GET(request: Request) {
  const auth = authenticateActionRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", message: auth.error || "Authentication required" },
      { status: auth.status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const url = new URL(request.url);
    const page = url.searchParams.get("page")
      ? parseInt(url.searchParams.get("page")!, 10)
      : 1;
    const pageSize = url.searchParams.get("pageSize")
      ? parseInt(url.searchParams.get("pageSize")!, 10)
      : 10;
    const status = url.searchParams.get("status") as InvestigationStatus | null;
    const classification = url.searchParams.get(
      "classification"
    ) as InvestigationClassification | null;
    const query = url.searchParams.get("query") || undefined;
    const projectId = url.searchParams.get("projectId") || undefined;

    const [data, stats] = await Promise.all([
      getInvestigations({
        page,
        pageSize,
        status: status || undefined,
        classification: classification || undefined,
        query,
        projectId,
      }),
      getInvestigationStats(projectId),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: data.investigations,
        pagination: {
          page: data.page,
          pageSize: data.pageSize,
          total: data.total,
          totalPages: data.totalPages,
        },
        stats,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load investigations";
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
