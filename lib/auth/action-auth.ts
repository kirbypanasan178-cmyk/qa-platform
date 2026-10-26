import { verifyApiKey } from "./api-key";

/**
 * Validates authorization for user or API action triggers (such as GitHub sync).
 * Accepts:
 *  1. Valid CMS_API_KEY passed via 'x-api-key' or 'Authorization: Bearer <key>'
 *  2. Internal same-origin dashboard browser requests
 */
export function authenticateActionRequest(request: Request): {
  authorized: boolean;
  error?: string;
  status: number;
} {
  const expectedApiKey = process.env.CMS_API_KEY;

  // 1. Check API Key if provided
  let providedKey = request.headers.get("x-api-key");
  if (!providedKey) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      providedKey = authHeader.substring(7).trim();
    }
  }

  if (providedKey) {
    if (expectedApiKey && verifyApiKey(providedKey, expectedApiKey)) {
      return { authorized: true, status: 200 };
    }
    return {
      authorized: false,
      error: "Invalid API key provided",
      status: 401,
    };
  }

  // 2. Check Same-Origin browser requests from the CMS UI
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  const secFetchSite = request.headers.get("sec-fetch-site");

  if (secFetchSite === "same-origin") {
    return { authorized: true, status: 200 };
  }

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      if (originUrl.host === host) {
        return { authorized: true, status: 200 };
      }
    } catch {
      // Invalid origin URL
    }
  }

  // If CMS_API_KEY is configured and request is not verified, require auth
  if (expectedApiKey) {
    return {
      authorized: false,
      error: "Authentication required to perform this action",
      status: 401,
    };
  }

  // Default fallback for development without configured CMS_API_KEY
  return { authorized: true, status: 200 };
}
