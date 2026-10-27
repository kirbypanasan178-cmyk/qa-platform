import {
  InvestigationClassification,
  InvestigationStatus,
} from "@prisma/client";

export type { InvestigationClassification, InvestigationStatus };

export interface FailureEvidence {
  testTitle: string;
  testId?: string | null;
  specFile: string;
  role?: string | null;
  status: string;
  durationMs: number;
  retryCount: number;
  errorMessage: string;
  stackTrace?: string | null;
  errorType?: string | null;
  expected?: string | null;
  actual?: string | null;
  executionLogs?: string[] | null;
  apiResponses?: unknown[] | null;
  historicalOccurrences?: number;
}

export interface AnalysisResult {
  classification: InvestigationClassification;
  confidenceScore: number; // 0 to 100
  summary: string;
  recommendedAction: string;
  detectedPatterns: string[];
}

export interface FailureAnalyzer {
  readonly name: string;
  analyze(evidence: FailureEvidence): Promise<AnalysisResult> | AnalysisResult;
}
