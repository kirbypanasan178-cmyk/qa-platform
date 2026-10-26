import React, { Suspense } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { StatusBadge } from "@/components/status-badge";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import { getTestRuns } from "@/lib/data/runs";
import { GitBranch, Clock, ChevronRight, Search, Filter } from "lucide-react";

interface RunsPageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    query?: string;
  }>;
}

async function RunsContent({ searchParams }: RunsPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const status = params.status || "ALL";
  const query = params.query || "";

  const { runs, totalPages } = await getTestRuns({
    page,
    pageSize: 10,
    status,
    query,
  });

  return (
    <main className="p-8 space-y-6 flex-1">
      {/* Search & Filter Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
        <form method="GET" className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              name="query"
              defaultValue={query}
              placeholder="Search by branch, commit, or project..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          {status !== "ALL" && (
            <input type="hidden" name="status" value={status} />
          )}
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
          >
            Search
          </button>
        </form>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs text-zinc-400 flex items-center gap-1 mr-1">
            <Filter className="h-3 w-3" /> Status:
          </span>
          {["ALL", "FAILED", "PASSED", "RUNNING"].map((s) => {
            const isSelected = status === s;
            const linkParams = new URLSearchParams();
            if (query) linkParams.set("query", query);
            if (s !== "ALL") linkParams.set("status", s);

            return (
              <Link
                key={s}
                href={`/runs?${linkParams.toString()}`}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                  isSelected
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {s}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Test Runs Table */}
      {runs.length === 0 ? (
        <EmptyState
          title="No test runs matched your filter"
          description="Try adjusting your status or keyword search query to find previous runs."
          action={
            <Link
              href="/runs"
              className="text-xs font-medium text-zinc-900 underline dark:text-zinc-100"
            >
              Clear all filters
            </Link>
          }
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50/75 dark:border-zinc-800 dark:bg-zinc-800/50">
                <tr>
                  <th className="py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300">
                    Run
                  </th>
                  <th className="py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300">
                    Status
                  </th>
                  <th className="py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300">
                    Branch / Commit
                  </th>
                  <th className="py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300">
                    Tests (P / F / Total)
                  </th>
                  <th className="py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300">
                    Duration
                  </th>
                  <th className="py-3 px-4 font-semibold text-zinc-600 dark:text-zinc-300">
                    Execution Time
                  </th>
                  <th className="py-3 px-4 text-right font-semibold text-zinc-600 dark:text-zinc-300">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">{run.project.key}</span>
                        {run.runNumber && (
                          <span className="font-mono text-zinc-400">
                            #{run.runNumber}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {run.id.slice(0, 10)}...
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                        <GitBranch className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                        <span className="font-medium">{run.branch || "default"}</span>
                      </div>
                      {run.commitSha && (
                        <span className="text-[11px] font-mono text-zinc-400">
                          {run.commitSha.slice(0, 7)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {run.passedCount}
                      </span>
                      <span className="text-zinc-400"> / </span>
                      <span className="font-semibold text-rose-600 dark:text-rose-400">
                        {run.failedCount}
                      </span>
                      <span className="text-zinc-400"> / </span>
                      <span className="text-zinc-500">{run.totalTests}</span>
                    </td>
                    <td className="py-3 px-4 text-zinc-600 dark:text-zinc-400">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3 text-zinc-400" />
                        {(run.durationMs / 1000).toFixed(1)}s
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-500 dark:text-zinc-400">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        href={`/runs/${run.id}`}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Details
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl="/runs"
            queryParams={{
              ...(status !== "ALL" ? { status } : {}),
              ...(query ? { query } : {}),
            }}
          />
        </div>
      )}
    </main>
  );
}

export default function RunsPage(props: RunsPageProps) {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Test Runs"
        description="Filter and investigate Playwright execution sessions and suite metrics."
      />
      <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading test runs...</div>}>
        <RunsContent {...props} />
      </Suspense>
    </div>
  );
}
