import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import { createSandboxTestIssue, GitHubSettingsError } from "@/lib/services/github-settings";
import { GitHubApiError } from "@/lib/github/client";

export async function POST(request: Request) {
  const auth = authenticateActionRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", message: auth.error || "Authentication required" },
      { status: auth.status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  let body: { owner?: string; repo?: string } = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    // optional body
  }

  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") || undefined;
    const origin = request.headers.get("origin") || undefined;

    const result = await createSandboxTestIssue(projectId, {
      cmsBaseUrl: origin,
      owner: body.owner,
      repo: body.repo,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
        message: `Sandbox test issue #${result.number} created successfully in ${result.targetOwner}/${result.targetRepo}`,
      },
      { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create sandbox test issue";
    const status =
      err instanceof GitHubSettingsError
        ? err.status
        : err instanceof GitHubApiError
        ? (err.status === 404 ? 422 : err.status)
        : 500;

    return NextResponse.json(
      { error: "Sandbox Issue Creation Failed", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
