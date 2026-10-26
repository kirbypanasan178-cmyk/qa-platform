/**
 * Sensitive Data Sanitizer
 * Redacts credentials, tokens, session cookies, embedded credentials,
 * local filesystem user directories, and ANSI escape sequences.
 */

// Regular expressions for detecting sensitive tokens and values
const ANSI_REGEX = /\u001b\[[0-9;]*[a-zA-Z]/g;

// URL embedded credentials: e.g. https://admin:supersecret@domain.com or https://admin:p@ss!@domain.com
const EMBEDDED_URL_CREDS =
  /(https?:\/\/)([^:\s/@]+):([^/\s]+?)@(?=[^/@\s]+(?:\/|\?|#|$))/gi;

// Bearer & Authorization headers
const BEARER_TOKEN = /(Bearer\s+)[A-Za-z0-9_\-\.]{15,}/gi;
const AUTH_HEADER = /(authorization\s*:\s*(?:bearer\s+)?)["']?[A-Za-z0-9_\-\.]{15,}["']?/gi;

// GitHub, AWS, NPM, and Common Service Tokens
const GITHUB_TOKENS = /\b(gh[pousr]_[A-Za-z0-9_]{36,255}|github_pat_[A-Za-z0-9_]{50,255})\b/g;
const AWS_ACCESS_KEY = /\b(AKIA[0-9A-Z]{16})\b/g;
const JWT_PATTERN = /\beyJ[A-Za-z0-9-_]{10,}\.eyJ[A-Za-z0-9-_]{10,}\.[A-Za-z0-9-_]{10,}\b/g;

// Key-Value credential pairs (passwords, api_keys, secrets, auth_tokens)
const KV_CREDENTIALS =
  /(["']?(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)["']?\s*[:=]\s*["']?)([^"'\s,\r\n;]{3,})(["']?)/gi;

// Cookies and session headers
const COOKIE_HEADER =
  /((?:cookie|set-cookie)\s*:\s*)([^;\r\n]+(?:;\s*[^;\r\n]+)*)/gi;

// Local machine username / home directories (Windows, Linux, macOS)
// e.g. C:\Users\john\ -> C:\Users\[REDACTED_USER]\
const WINDOWS_USER_PATH = /([a-zA-Z]:\\(?:Users|Documents and Settings)\\[^\\]+)/gi;
const POSIX_USER_PATH = /(\/(?:home|Users)\/[^/\s]+)/gi;

export interface SanitizerOptions {
  customSecrets?: string[];
}

/**
 * Sanitizes arbitrary text (such as error messages or stack traces).
 * Safe to call with null, undefined, or empty strings.
 */
export function sanitizeText(
  text: string | null | undefined,
  options?: SanitizerOptions
): string {
  if (!text) return "";

  let result = text;

  // 1. Strip terminal ANSI color/formatting escape codes
  result = result.replace(ANSI_REGEX, "");

  // 2. Redact embedded URL credentials
  result = result.replace(EMBEDDED_URL_CREDS, "$1[REDACTED_USER]:[REDACTED_PASSWORD]@");

  // 3. Redact Authorization / Bearer tokens
  result = result.replace(AUTH_HEADER, "$1[REDACTED_TOKEN]");
  result = result.replace(BEARER_TOKEN, "$1[REDACTED_TOKEN]");

  // 4. Redact Specific Provider Tokens
  result = result.replace(GITHUB_TOKENS, "[REDACTED_GITHUB_TOKEN]");
  result = result.replace(AWS_ACCESS_KEY, "[REDACTED_AWS_KEY]");
  result = result.replace(JWT_PATTERN, "[REDACTED_JWT]");

  // 5. Redact Key-Value credentials (passwords, secrets)
  result = result.replace(KV_CREDENTIALS, "$1[REDACTED]$3");

  // 6. Redact Cookies
  result = result.replace(COOKIE_HEADER, "$1[REDACTED_COOKIES]");

  // 7. Redact local filesystem user paths
  result = result.replace(WINDOWS_USER_PATH, "C:\\Users\\[REDACTED_USER]");
  result = result.replace(POSIX_USER_PATH, "/home/[REDACTED_USER]");

  // 8. Redact custom known secrets (e.g. from environment)
  if (options?.customSecrets) {
    for (const secret of options.customSecrets) {
      if (secret && secret.length >= 4) {
        // Escape special regex characters in the secret string
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const customRegex = new RegExp(escaped, "g");
        result = result.replace(customRegex, "[REDACTED_SECRET]");
      }
    }
  }

  return result;
}
