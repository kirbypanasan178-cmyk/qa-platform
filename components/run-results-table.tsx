"use client";

import React, { useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Copy, Check, ChevronDown, ChevronUp, Terminal, User } from "lucide-react";

interface TestResultItem {
  id: string;
  suiteTitle: string | null;
  testTitle: string;
  specFile: string;
  role: string | null;
  status: string;
  durationMs: number;
  retryCount: number;
  failureDetail: {
    id: string;
    sanitizedErrorMessage: string;
    sanitizedStackTrace: string | null;
    failureSignature: {
      id: string;
      signatureHash: string;
      occurrenceCount: number;
    };
  } | null;
}

interface RunResultsTableProps {
  testResults: TestResultItem[];
}

export function RunResultsTable({ testResults }: RunResultsTableProps) {
  const [filter, setFilter] = useState<"ALL" | "FAILED" | "PASSED">("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredResults = testResults.filter((item) => {
    if (filter === "FAILED") {
      return item.status === "FAILED" || item.status === "TIMED_OUT";
    }
    if (filter === "PASSED") {
      return item.status === "PASSED";
    }
    return true;
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const failedCount = testResults.filter(
    (t) => t.status === "FAILED" || t.status === "TIMED_OUT"
  ).length;
  const passedCount = testResults.filter((t) => t.status === "PASSED").length;

  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
              filter === "ALL"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            All Tests ({testResults.length})
          </button>
          <button
            onClick={() => setFilter("FAILED")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
              filter === "FAILED"
                ? "bg-rose-600 text-white"
                : "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            }`}
          >
            Failed ({failedCount})
          </button>
          <button
            onClick={() => setFilter("PASSED")}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
              filter === "PASSED"
                ? "bg-emerald-600 text-white"
                : "text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
            }`}
          >
            Passed ({passedCount})
          </button>
        </div>
        <span className="text-xs text-zinc-400">
          Showing {filteredResults.length} tests
        </span>
      </div>

      {/* Results List */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
        {filteredResults.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No tests match the selected filter.
          </div>
        ) : (
          filteredResults.map((result) => {
            const isExpanded = expandedId === result.id;
            const hasDiagnostics = Boolean(result.failureDetail);

            return (
              <div key={result.id} className="transition-colors">
                <div
                  onClick={() => hasDiagnostics && toggleExpand(result.id)}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 ${
                    hasDiagnostics ? "cursor-pointer hover:bg-zinc-50/75 dark:hover:bg-zinc-800/40" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      <StatusBadge status={result.status} />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {result.testTitle}
                        </span>
                        {result.role && (
                          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            <User className="h-2.5 w-2.5" />
                            {result.role}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
                        <span>{result.specFile}</span>
                        {result.suiteTitle && (
                          <>
                            <span>•</span>
                            <span>{result.suiteTitle}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 text-xs">
                    <div className="text-zinc-500 dark:text-zinc-400">
                      <span>{(result.durationMs / 1000).toFixed(2)}s</span>
                      {result.retryCount > 0 && (
                        <span className="ml-2 text-amber-600 font-medium">
                          ({result.retryCount} {result.retryCount === 1 ? "retry" : "retries"})
                        </span>
                      )}
                    </div>
                    {hasDiagnostics && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Diagnostic Panel */}
                {isExpanded && result.failureDetail && (
                  <div className="bg-zinc-950 p-4 border-t border-zinc-800 text-xs font-mono text-zinc-100 space-y-3">
                    <div className="flex items-center justify-between text-zinc-400 pb-2 border-b border-zinc-800">
                      <div className="flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-rose-400" />
                        <span className="font-semibold text-rose-300">
                          Sanitized Failure Diagnostic
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const fullTrace = `${result.failureDetail?.sanitizedErrorMessage}\n\n${result.failureDetail?.sanitizedStackTrace || ""}`;
                          handleCopy(result.id, fullTrace);
                        }}
                        className="inline-flex items-center gap-1 rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        {copiedId === result.id ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-400" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy Trace</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="text-rose-400 whitespace-pre-wrap leading-relaxed">
                      {result.failureDetail.sanitizedErrorMessage}
                    </div>

                    {result.failureDetail.sanitizedStackTrace && (
                      <pre className="text-zinc-400 overflow-x-auto text-[11px] leading-relaxed pt-2 border-t border-zinc-800/80">
                        {result.failureDetail.sanitizedStackTrace}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
