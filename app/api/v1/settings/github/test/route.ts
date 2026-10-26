import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import { testGitHubConnection, GitHubSettingsError } from "@/lib/services/github-settings";
import { GitHubApiError } from "@/lib/github/client";

export async function POST(request: Request) {
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
    const testResult = await testGitHubConnection(projectId);

    return NextResponse.json(
      {
        success: true,
        data: testResult,
        message: `Connection verified successfully for ${testResult.login} (${testResult.latencyMs}ms)`,
      },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "GitHub connection test failed";
    const status =
      err instanceof GitHubSettingsError
        ? err.status
        : err instanceof GitHubApiError
        ? err.status
        : 500;

    return NextResponse.json(
      { error: "Connection Test Failed", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
