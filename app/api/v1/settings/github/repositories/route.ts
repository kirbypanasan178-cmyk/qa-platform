import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import { listAccessibleRepositories, GitHubSettingsError } from "@/lib/services/github-settings";
import { GitHubApiError } from "@/lib/github/client";

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
    const projectId = url.searchParams.get("projectId") || undefined;
    const repositories = await listAccessibleRepositories(projectId);

    return NextResponse.json(
      { success: true, data: repositories, count: repositories.length },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load repositories";
    const status =
      err instanceof GitHubSettingsError
        ? err.status
        : err instanceof GitHubApiError
        ? err.status
        : 500;

    return NextResponse.json(
      { error: "GitHub Repositories Error", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
