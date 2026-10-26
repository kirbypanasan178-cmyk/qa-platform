import { z } from "zod";

export const TestStatusEnum = z.enum(["PASSED", "FAILED", "SKIPPED", "TIMED_OUT"]);
export const RunStatusEnum = z.enum(["PASSED", "FAILED", "PARTIAL", "RUNNING"]);

export const FailureDetailInputSchema = z.object({
  message: z.string().min(1, "Error message must not be empty").max(10000),
  stackTrace: z.string().max(50000).optional().nullable(),
  errorType: z.string().max(100).optional().nullable(),
});

export const TestResultInputSchema = z.object({
  suiteTitle: z.string().max(300).optional().nullable(),
  testTitle: z.string().min(1, "Test title is required").max(500),
  specFile: z.string().min(1, "Spec file is required").max(500),
  role: z.string().max(100).optional().nullable(),
  status: TestStatusEnum,
  durationMs: z.number().int().min(0).default(0),
  retryCount: z.number().int().min(0).default(0),
  error: FailureDetailInputSchema.optional().nullable(),
});

export const TestRunIngestionSchema = z.object({
  projectKey: z.string().min(1, "Project key is required").max(100),
  projectName: z.string().max(200).optional().nullable(),
  repositoryUrl: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().max(128).optional().nullable(),
  runNumber: z.number().int().positive().optional().nullable(),
  branch: z.string().max(200).optional().nullable(),
  commitSha: z.string().max(64).optional().nullable(),
  environment: z.string().max(50).optional().nullable(),
  triggeredBy: z.string().max(50).optional().nullable(),
  status: RunStatusEnum.optional().nullable(),
  totalTests: z.number().int().min(0),
  passedCount: z.number().int().min(0).default(0),
  failedCount: z.number().int().min(0).default(0),
  skippedCount: z.number().int().min(0).default(0),
  durationMs: z.number().int().min(0).default(0),
  startedAt: z.string().datetime({ message: "startedAt must be a valid ISO 8601 datetime" }).optional().nullable(),
  completedAt: z.string().datetime({ message: "completedAt must be a valid ISO 8601 datetime" }).optional().nullable(),
  testResults: z.array(TestResultInputSchema).default([]),
});

export type TestRunIngestionInput = z.infer<typeof TestRunIngestionSchema>;
export type TestResultInput = z.infer<typeof TestResultInputSchema>;
export type FailureDetailInput = z.infer<typeof FailureDetailInputSchema>;
