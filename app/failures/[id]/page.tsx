import React, { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { StatusBadge } from "@/components/status-badge";
import { GitHubIssueAction } from "@/components/github-issue-action";
import { getFailureById } from "@/lib/data/failures";
import {
  ArrowLeft,
  AlertOctagon,
  Layers,
  Calendar,
  Terminal,
  Hash,
  ExternalLink,
} from "lucide-react";

interface FailureDetailPageProps {
  params: Promise<{ id: string }>;
}

async function FailureDetailContent({ params }: FailureDetailPageProps) {
  const { id } = await params;
  const failure = await getFailureById(id);

  if (!failure) {
    notFound();
  }

  const latestDetail = failure.failureDetails[0];

  return (
    <main className="p-8 space-y-6 flex-1">
      {/* Signature Overview Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertOctagon className="h-4 w-4" />
                {failure.errorType || "Error"}
              </span>
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {failure.occurrenceCount}{" "}
                {failure.occurrenceCount === 1 ? "Total Occurrence" : "Total Occurrences"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs font-mono text-zinc-500 pt-1">
              <Hash className="h-3.5 w-3.5 text-zinc-400" />
              <span className="break-all">{failure.signatureHash}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>First seen: {new Date(failure.firstSeenAt).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>Last seen: {new Date(failure.lastSeenAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Normalized Error Template */}
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            Normalized Deduplication Pattern
          </span>
          <div className="rounded-lg bg-zinc-50 p-4 border border-zinc-200/80 dark:bg-zinc-950 dark:border-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
            {failure.normalizedError}
          </div>
        </div>

        {/* Sanitized Stack Trace Panel */}
        {latestDetail && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-zinc-400">
              <Terminal className="h-4 w-4 text-zinc-500" />
              <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                Sanitized Diagnostic Sample
              </span>
            </div>
            <div className="rounded-lg bg-zinc-950 p-4 border border-zinc-800 text-xs font-mono text-zinc-200 space-y-3">
              <div className="text-rose-400 whitespace-pre-wrap leading-relaxed font-semibold">
                {latestDetail.sanitizedErrorMessage}
              </div>
              {latestDetail.sanitizedStackTrace && (
                <pre className="text-zinc-400 overflow-x-auto text-[11px] leading-relaxed pt-2 border-t border-zinc-800">
                  {latestDetail.sanitizedStackTrace}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>

      {/* GitHub Issue Action Card */}
      <GitHubIssueAction
        failureSignatureId={failure.id}
        initialDefect={failure.defect}
      />

      {/* Recent Run Occurrences */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Recent Run Occurrences ({failure.failureDetails.length})
          </h3>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
          {failure.failureDetails.map((detail) => (
            <div
              key={detail.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {detail.testResult.testTitle}
                  </span>
                  <StatusBadge status={detail.testResult.status} />
                </div>
                <div className="text-zinc-400 font-mono">
                  {detail.testResult.specFile} • {detail.testResult.testRun.project.key}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-zinc-500">
                  {new Date(detail.createdAt).toLocaleString()}
                </span>
                <Link
                  href={`/runs/${detail.testResult.testRun.id}`}
                  className="inline-flex items-center gap-1 font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  Open Run
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default function FailureDetailPage(props: FailureDetailPageProps) {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Failure Signature Diagnostics"
        description="Inspect recurring failure patterns, normalized traces, and occurrences."
        action={
          <Link
            href="/failures"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Failures
          </Link>
        }
      />
      <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading failure details...</div>}>
        <FailureDetailContent {...props} />
      </Suspense>
    </div>
  );
}
