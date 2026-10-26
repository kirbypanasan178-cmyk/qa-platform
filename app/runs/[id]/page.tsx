import React, { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/header";
import { StatusBadge } from "@/components/status-badge";
import { StatCard } from "@/components/stat-card";
import { RunResultsTable } from "@/components/run-results-table";
import { getTestRunById } from "@/lib/data/runs";
import {
  ArrowLeft,
  GitBranch,
  Clock,
  Calendar,
  CheckCircle,
  XCircle,
  PlaySquare,
  ShieldAlert,
} from "lucide-react";

interface RunDetailPageProps {
  params: Promise<{ id: string }>;
}

async function RunDetailContent({ params }: RunDetailPageProps) {
  const { id } = await params;
  const run = await getTestRunById(id);

  if (!run) {
    notFound();
  }

  return (
    <main className="p-8 space-y-6 flex-1">
      {/* Run Metadata Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                {run.project.key}
              </span>
              {run.runNumber && (
                <span className="text-sm font-mono text-zinc-400">
                  #{run.runNumber}
                </span>
              )}
              <StatusBadge status={run.status} />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Environment: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{run.environment || "default"}</span> • Triggered by: <span className="font-semibold text-zinc-700 dark:text-zinc-300">{run.triggeredBy || "local"}</span>
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
            {run.branch && (
              <div className="flex items-center gap-1.5">
                <GitBranch className="h-4 w-4 text-zinc-400" />
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {run.branch}
                </span>
                {run.commitSha && (
                  <span className="font-mono text-[11px] text-zinc-400">
                    ({run.commitSha.slice(0, 7)})
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-zinc-400" />
              <span>{new Date(run.startedAt).toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Metric Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-5">
          <StatCard
            title="Total Tests"
            value={run.totalTests}
            icon={PlaySquare}
          />
          <StatCard
            title="Passed"
            value={run.passedCount}
            icon={CheckCircle}
            variant="success"
          />
          <StatCard
            title="Failed"
            value={run.failedCount}
            icon={XCircle}
            variant={run.failedCount > 0 ? "danger" : "default"}
          />
          <StatCard
            title="Duration"
            value={`${(run.durationMs / 1000).toFixed(1)}s`}
            icon={Clock}
          />
        </div>
      </div>

      {/* Individual Test Results */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-zinc-500" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Test Execution Breakdown
          </h3>
        </div>

        <RunResultsTable testResults={run.testResults} />
      </section>
    </main>
  );
}

export default function RunDetailPage(props: RunDetailPageProps) {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Run Diagnostics"
        description="Detailed test breakdown, telemetry, and error stack traces."
        action={
          <Link
            href="/runs"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Runs
          </Link>
        }
      />
      <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading run details...</div>}>
        <RunDetailContent {...props} />
      </Suspense>
    </div>
  );
}
