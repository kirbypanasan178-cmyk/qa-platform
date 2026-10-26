import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import {
  getGitHubSettings,
  saveGitHubRepositorySelection,
  GitHubSettingsError,
} from "@/lib/services/github-settings";
import { GitHubApiError } from "@/lib/github/client";
import { z } from "zod";

const saveRepoSchema = z.object({
  projectId: z.string().optional(),
  owner: z.string().min(1, "Owner is required").max(100),
  repo: z.string().min(1, "Repository name is required").max(100),
});

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
    const settings = await getGitHubSettings(projectId);

    return NextResponse.json(
      { success: true, data: settings },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load GitHub settings";
    const status = err instanceof GitHubSettingsError ? err.status : 500;

    return NextResponse.json(
      { error: "GitHub Settings Error", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}

export async function POST(request: Request) {
  const auth = authenticateActionRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", message: auth.error || "Authentication required" },
      { status: auth.status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON payload" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const parsed = saveRepoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation Error", message: parsed.error.issues[0]?.message || "Invalid repository selection" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const updated = await saveGitHubRepositorySelection(parsed.data);
    return NextResponse.json(
      { success: true, data: updated, message: "Repository selection saved successfully" },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to save repository selection";
    const status =
      err instanceof GitHubSettingsError
        ? err.status
        : err instanceof GitHubApiError
        ? err.status
        : 500;

    return NextResponse.json(
      { error: "GitHub Selection Error", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
