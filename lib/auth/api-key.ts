import crypto from "node:crypto";

/**
 * Validates whether an incoming API key matches the expected server secret.
 * Uses SHA-256 hashing prior to timingSafeEqual to eliminate length-leak timing side channels.
 */
export function verifyApiKey(
  providedKey: string | null | undefined,
  expectedKey: string | undefined
): boolean {
  if (!providedKey || !expectedKey || expectedKey.trim().length === 0) {
    return false;
  }

  const provHash = crypto.createHash("sha256").update(providedKey).digest();
  const expHash = crypto.createHash("sha256").update(expectedKey).digest();

  return crypto.timingSafeEqual(provHash, expHash);
}

/**
 * Extracts and verifies the ingestion API key from request headers.
 * Looks for 'X-API-Key' or 'Authorization: Bearer <key>'.
 */
export function authenticateIngestionRequest(request: Request): {
  authenticated: boolean;
  error?: string;
} {
  const expectedKey = process.env.CMS_API_KEY;

  if (!expectedKey) {
    return {
      authenticated: false,
      error: "Server ingestion authentication is unconfigured",
    };
  }

  // Check X-API-Key header
  let providedKey = request.headers.get("x-api-key");

  // Fallback to Authorization: Bearer <key>
  if (!providedKey) {
    const authHeader = request.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      providedKey = authHeader.substring(7).trim();
    }
  }

  if (!providedKey) {
    return {
      authenticated: false,
      error: "Missing API key in 'X-API-Key' or 'Authorization' header",
    };
  }

  const isValid = verifyApiKey(providedKey, expectedKey);

  if (!isValid) {
    return {
      authenticated: false,
      error: "Invalid API key provided",
    };
  }

  return { authenticated: true };
}
