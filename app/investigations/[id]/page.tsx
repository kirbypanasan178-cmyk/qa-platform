import React, { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { StatusBadge } from "@/components/status-badge";
import { InvestigationActions } from "@/components/investigation-actions";
import { getInvestigationById } from "@/lib/data/investigations";
import {
  ArrowLeft,
  Sparkles,
  Terminal,
  Activity,
  Layers,
  Calendar,
  User,
  ShieldCheck,
  ExternalLink,
  History,
  AlertOctagon,
  FileText,
} from "lucide-react";

interface InvestigationDetailPageProps {
  params: Promise<{ id: string }>;
}

async function InvestigationDetailContent({ params }: InvestigationDetailPageProps) {
  const { id } = await params;
  const investigation = await getInvestigationById(id);

  if (!investigation) {
    notFound();
  }

  const { testResult, failureDetail, history } = investigation;
  const signature = failureDetail?.failureSignature;

  return (
    <main className="p-8 space-y-6 flex-1 max-w-7xl mx-auto w-full">
      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/investigations"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Investigations
        </Link>
        {signature && (
          <Link
            href={`/failures/${signature.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            View Recurring Failure Signature
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>

      {/* Test Case Overview Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                {testResult.testTitle}
              </span>
              <StatusBadge status={testResult.status} />
              {testResult.role && (
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {testResult.role}
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-zinc-400">
              {testResult.specFile} • Project: {testResult.testRun.project.key}
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            <div>Duration: {testResult.durationMs}ms</div>
            <div>Retries: {testResult.retryCount}</div>
            <div>Run #{testResult.testRun.runNumber || "1"}</div>
          </div>
        </div>

        {/* AI & Rule Assessment Banner */}
        <div className="rounded-lg bg-indigo-50/70 p-5 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-300">
                Diagnostic Assessment Result
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-xs">
                {investigation.classification.replace("_", " ")}
              </span>
              <span className="text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                {investigation.confidenceScore}% Confidence
              </span>
            </div>
          </div>

          <p className="text-xs text-zinc-800 dark:text-zinc-200 leading-relaxed font-medium">
            {investigation.summary}
          </p>

          <div className="text-xs pt-1 border-t border-indigo-200/60 dark:border-indigo-900/60">
            <span className="font-semibold text-indigo-950 dark:text-indigo-300">
              Recommended Action:{" "}
            </span>
            <span className="text-zinc-700 dark:text-zinc-300">
              {investigation.recommendedAction}
            </span>
          </div>

          {/* Matched Pattern Badges */}
          {investigation.detectedPatterns && investigation.detectedPatterns.length > 0 && (
            <div className="pt-2 flex flex-wrap gap-1.5">
              {investigation.detectedPatterns.map((pat, idx) => (
                <span
                  key={idx}
                  className="rounded bg-white/80 border border-indigo-200 px-2 py-0.5 text-[11px] font-medium text-indigo-800 dark:bg-zinc-900 dark:border-zinc-800 dark:text-indigo-300"
                >
                  {pat}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Admin Triage Interactive Actions */}
      <InvestigationActions
        investigationId={investigation.id}
        currentStatus={investigation.status}
      />

      {/* Failure Diagnostics Evidence */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Error Diagnostics Panel */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-semibold text-xs uppercase tracking-wider">
            <Terminal className="h-4 w-4 text-zinc-500" />
            Sanitized Error & Stack Trace
          </div>
          <div className="rounded-lg bg-zinc-950 p-4 border border-zinc-800 text-xs font-mono text-zinc-200 space-y-3">
            <div className="text-rose-400 font-semibold whitespace-pre-wrap leading-relaxed">
              {failureDetail?.sanitizedErrorMessage || "No error message provided"}
            </div>
            {failureDetail?.sanitizedStackTrace && (
              <pre className="text-zinc-400 overflow-x-auto text-[11px] leading-relaxed pt-2 border-t border-zinc-800">
                {failureDetail.sanitizedStackTrace}
              </pre>
            )}
          </div>
        </div>

        {/* Expected vs Actual & Execution Logs */}
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
          <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-semibold text-xs uppercase tracking-wider">
            <FileText className="h-4 w-4 text-zinc-500" />
            Expected vs Actual & Execution Context
          </div>

          {(investigation.expectedResult || investigation.actualResult) ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-emerald-50/60 p-3 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900">
                <span className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-400">
                  Expected Result
                </span>
                <p className="mt-1 font-mono text-zinc-800 dark:text-zinc-200 break-words">
                  {investigation.expectedResult || "Not explicitly specified"}
                </p>
              </div>
              <div className="rounded-lg bg-rose-50/60 p-3 border border-rose-200 dark:bg-rose-950/30 dark:border-rose-900">
                <span className="text-[10px] uppercase font-bold text-rose-800 dark:text-rose-400">
                  Actual Result
                </span>
                <p className="mt-1 font-mono text-zinc-800 dark:text-zinc-200 break-words">
                  {investigation.actualResult || "Not explicitly specified"}
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200 text-xs text-zinc-500 dark:bg-zinc-950 dark:border-zinc-800">
              No discrete expected/actual assertion values provided by test reporter.
            </div>
          )}

          {/* Execution Logs */}
          <div className="space-y-1.5 pt-2">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-zinc-400">
              Diagnostic Execution Logs ({investigation.executionLogs?.length || 0})
            </span>
            <div className="rounded-lg bg-zinc-900 p-3 text-xs font-mono text-zinc-300 max-h-48 overflow-y-auto space-y-1 border border-zinc-800">
              {investigation.executionLogs && investigation.executionLogs.length > 0 ? (
                investigation.executionLogs.map((log, idx) => (
                  <div key={idx} className="leading-relaxed">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-zinc-500">No external execution logs captured.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Investigation History / Audit Trail */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Investigation History & Audit Trail ({history.length})
          </h3>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
          {history.map((event) => (
            <div
              key={event.id}
              className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-2 text-xs"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                    {event.action.replace("_", " ")}
                  </span>
                  <span className="text-zinc-400">
                    ({event.fromStatus.replace("_", " ")} → {event.toStatus.replace("_", " ")})
                  </span>
                </div>
                {event.notes && (
                  <div className="text-zinc-600 dark:text-zinc-300 italic">
                    "{event.notes}"
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 text-zinc-400 text-[11px]">
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  <span>{event.performedBy || "System"}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default async function InvestigationDetailPage(props: InvestigationDetailPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50/50 dark:bg-zinc-950">
      <Header
        title="Investigation Details"
        description="In-depth rule-based diagnostic assessment, evidence, and triage action history."
      />
      <Suspense
        fallback={
          <div className="p-8 text-center text-xs text-zinc-500">
            Loading investigation details...
          </div>
        }
      >
        <InvestigationDetailContent {...props} />
      </Suspense>
    </div>
  );
}
