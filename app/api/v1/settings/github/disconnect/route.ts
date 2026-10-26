import { NextResponse } from "next/server";
import { authenticateActionRequest } from "@/lib/auth/action-auth";
import { disconnectGitHub, GitHubSettingsError } from "@/lib/services/github-settings";
import { z } from "zod";

const disconnectSchema = z.object({
  projectId: z.string().optional(),
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
    // optional payload
  }

  const parsed = disconnectSchema.safeParse(body);
  const projectId = parsed.success ? parsed.data.projectId : undefined;

  try {
    const updated = await disconnectGitHub(projectId);
    return NextResponse.json(
      { success: true, data: updated, message: "GitHub integration disconnected" },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to disconnect GitHub integration";
    const status = err instanceof GitHubSettingsError ? err.status : 500;

    return NextResponse.json(
      { error: "GitHub Disconnect Error", message },
      { status, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
