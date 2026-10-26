import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import { connectGitHub, GitHubSettingsError } from "@/lib/services/github-settings";
import { GitHubApiError } from "@/lib/github/client";
import { z } from "zod";

const connectSchema = z.object({
  projectId: z.string().optional(),
  token: z.string().min(1).optional(),
  installationId: z.string().optional(),
});

export async function POST(request: Request) {
  const auth = authenticateActionRequest(request);
  if (!auth.authorized) {
    return NextResponse.json(
      { error: "Unauthorized", message: auth.error || "Authentication required" },
      { status: auth.status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  let body: unknown = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { error: "Bad Request", message: "Invalid JSON payload" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation Error", message: parsed.error.issues[0]?.message || "Invalid connect payload" },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const updated = await connectGitHub(parsed.data);
    return NextResponse.json(
      { success: true, data: updated, message: "GitHub integration connected successfully" },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to connect GitHub integration";
    const status =
      err instanceof GitHubSettingsError
        ? err.status
        : err instanceof GitHubApiError
        ? err.status
        : 500;

    return NextResponse.json(
      { error: "GitHub Connection Error", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
