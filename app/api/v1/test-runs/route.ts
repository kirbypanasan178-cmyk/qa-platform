import { NextResponse } from "next/server";
import { authenticateIngestionRequest } from "@/lib/auth/api-key";
import { TestRunIngestionSchema } from "@/lib/schemas/test-run";
import { processTestRunIngestion } from "@/lib/services/ingestion";

// Maximum allowable JSON payload: 5MB
const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  // 1. API Key Authentication Check
  const auth = authenticateIngestionRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        message: auth.error || "Missing or invalid API key",
      },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // 2. Payload Size Limit Pre-check via Content-Length header
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = parseInt(contentLengthHeader, 10);
    if (!Number.isNaN(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          error: "Payload Too Large",
          message: `Request body exceeds maximum allowed size of ${MAX_PAYLOAD_BYTES / (1024 * 1024)}MB`,
        },
        {
          status: 413,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }
  }

  // 3. Read Body & Verify Actual Byte Length
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Failed to read request body stream",
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    return NextResponse.json(
      {
        error: "Payload Too Large",
        message: `Request body exceeds maximum allowed size of ${MAX_PAYLOAD_BYTES / (1024 * 1024)}MB`,
      },
      {
        status: 413,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // 4. JSON Deserialization
  let jsonBody: unknown;
  try {
    jsonBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Malformed JSON payload",
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // 5. Zod Schema Validation
  const validation = TestRunIngestionSchema.safeParse(jsonBody);
  if (!validation.success) {
    const errorDetails = validation.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));

    return NextResponse.json(
      {
        error: "Bad Request",
        message: "Invalid test run payload",
        details: errorDetails,
      },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // 6. Database Transactional Ingestion
  try {
    const result = await processTestRunIngestion(validation.data);

    if (result.status === 200) {
      return NextResponse.json(
        {
          status: "duplicate",
          runId: result.runId,
          message: result.message,
          summary: result.summary,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        status: "success",
        runId: result.runId,
        message: "Test run successfully recorded",
        summary: result.summary,
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    // Return sanitized internal server error without exposing stack traces or DB details
    return NextResponse.json(
      {
        error: "Internal Server Error",
        message: "Failed to persist test run",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
