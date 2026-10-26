import React, { Suspense } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { getDashboardMetrics } from "@/lib/data/dashboard";
import {
  PlaySquare,
  CheckCircle,
  AlertTriangle,
  Percent,
  ArrowRight,
  GitBranch,
  Clock,
} from "lucide-react";

async function OverviewContent() {
  const metrics = await getDashboardMetrics();
  const hasData = metrics.totalRuns > 0;

  return (
    <main className="p-8 space-y-8 flex-1">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Runs"
          value={metrics.totalRuns}
          icon={PlaySquare}
        />
        <StatCard
          title="Total Tests"
          value={metrics.totalTests}
          subValue={`${metrics.totalPassed} passed`}
          icon={CheckCircle}
          variant="default"
        />
        <StatCard
          title="Failed Tests"
          value={metrics.totalFailed}
          subValue={`${metrics.totalSkipped} skipped`}
          icon={AlertTriangle}
          variant={metrics.totalFailed > 0 ? "danger" : "default"}
        />
        <StatCard
          title="Pass Rate"
          value={`${metrics.passRate}%`}
          subValue={
            metrics.totalTests > 0
              ? `${metrics.totalPassed}/${metrics.totalTests} tests`
              : undefined
          }
          icon={Percent}
          variant={metrics.passRate >= 90 ? "success" : "warning"}
        />
      </div>

      {!hasData ? (
        <EmptyState
          title="No test runs recorded yet"
          description="Submit your first Playwright automation report to the CMS ingestion endpoint to view execution diagnostics, recurring bugs, and trends."
          action={
            <div className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 p-2.5 rounded-md text-zinc-600 dark:text-zinc-300">
              POST /api/v1/test-runs
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Recent Runs Table */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Recent Test Runs
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Latest Playwright automation executions
                </p>
              </div>
              <Link
                href="/runs"
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {metrics.recentRuns.map((run) => (
                <Link
                  key={run.id}
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {run.project.key}
                      </span>
                      {run.runNumber && (
                        <span className="text-xs font-mono text-zinc-400">
                          #{run.runNumber}
                        </span>
                      )}
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                      {run.branch && (
                        <span className="inline-flex items-center gap-1">
                          <GitBranch className="h-3 w-3" />
                          {run.branch}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {(run.durationMs / 1000).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {run.passedCount}
                    </span>
                    <span className="text-zinc-400"> / </span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                      {run.failedCount}
                    </span>
                    <span className="text-zinc-400"> / </span>
                    <span className="text-zinc-500">{run.totalTests}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recurring Failures Table */}
          <div className="rounded-xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  Recurring Failures
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Common test issues grouped by failure signature
                </p>
              </div>
              <Link
                href="/failures"
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                View all
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {metrics.recentFailures.length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-500">
                  No recurring failures detected 🎉
                </div>
              ) : (
                metrics.recentFailures.map((failure) => (
                  <Link
                    key={failure.id}
                    href={`/failures/${failure.id}`}
                    className="block p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                        {failure.errorType || "Error"}
                      </span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {failure.occurrenceCount}{" "}
                        {failure.occurrenceCount === 1 ? "occurrence" : "occurrences"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-mono text-zinc-600 line-clamp-2 dark:text-zinc-300">
                      {failure.normalizedError}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function OverviewPage() {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Operations Overview"
        description="Continuous quality telemetry for Internship DTR Playwright test suites."
      />
      <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading overview metrics...</div>}>
        <OverviewContent />
      </Suspense>
    </div>
  );
}
