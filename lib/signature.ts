import crypto from "node:crypto";
import { sanitizeText } from "./sanitizer";

export interface FailureSignatureInput {
  specFile: string;
  testTitle: string;
  errorType?: string | null;
  errorMessage: string;
}

/**
 * Normalizes dynamic and volatile substrings from error messages to create a stable signature.
 */
export function normalizeErrorMessage(message: string): string {
  // First, sanitize any potential credentials
  let normalized = sanitizeText(message).toLowerCase();

  // 1. Redact ISO 8601 timestamps
  normalized = normalized.replace(/\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}(?:\.\d+)?z?/g, "[timestamp]");

  // 2. Redact standard UUIDs
  normalized = normalized.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "[uuid]");

  // 3. Redact hex memory addresses / hashes
  normalized = normalized.replace(/\b0x[0-9a-f]+\b/g, "[hex]");

  // 4. Redact numbers representing duration/timeout metrics
  // e.g. "timed out after 30000ms" or "exceeded 5000ms"
  normalized = normalized.replace(/\b(\d+)\s*(ms|milliseconds|seconds|s)\b/g, "[duration]");

  // 5. Redact file line and column numbers
  // e.g. ":145:22" or "line 42"
  normalized = normalized.replace(/:(\d+):(\d+)/g, ":[line]:[col]");
  normalized = normalized.replace(/\bline\s+\d+\b/g, "line [line]");

  // 6. Normalize whitespace
  normalized = normalized.replace(/\s+/g, " ").trim();

  return normalized;
}

/**
 * Normalizes the spec file path for deterministic comparison.
 */
export function normalizeSpecFile(filePath: string): string {
  return filePath
    .replace(/\\/g, "/")
    .replace(/^.*(?=\/tests\/|\/e2e\/|\/specs\/)/i, "")
    .replace(/^\//, "")
    .toLowerCase()
    .trim();
}

/**
 * Generates a deterministic SHA-256 hash identifying a recurring test failure.
 */
export function generateFailureSignature(input: FailureSignatureInput): {
  signatureHash: string;
  normalizedError: string;
  errorType: string;
} {
  const normSpec = normalizeSpecFile(input.specFile);
  const normTitle = input.testTitle.replace(/\s+/g, " ").trim().toLowerCase();
  const errorType = (input.errorType || "Error").trim();
  const normalizedError = normalizeErrorMessage(input.errorMessage);

  const composite = `${normSpec}:::${normTitle}:::${errorType.toLowerCase()}:::${normalizedError}`;

  const signatureHash = crypto
    .createHash("sha256")
    .update(composite, "utf8")
    .digest("hex");

  return {
    signatureHash,
    normalizedError,
    errorType,
  };
}
