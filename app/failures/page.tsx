import React, { Suspense } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import { getFailures } from "@/lib/data/failures";
import {
  AlertOctagon,
  Calendar,
  Layers,
  ChevronRight,
  Search,
  Hash,
} from "lucide-react";

interface FailuresPageProps {
  searchParams: Promise<{
    page?: string;
    query?: string;
  }>;
}

async function FailuresContent({ searchParams }: FailuresPageProps) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const query = params.query || "";

  const { failures, total, totalPages } = await getFailures({
    page,
    pageSize: 10,
    query,
  });

  return (
    <main className="p-8 space-y-6 flex-1">
      {/* Search Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800">
        <form method="GET" className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              name="query"
              defaultValue={query}
              placeholder="Search by error message, type, or signature hash..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
          >
            Search
          </button>
        </form>

        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Total Signatures: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{total}</span>
        </div>
      </div>

      {failures.length === 0 ? (
        <EmptyState
          title="No failure signatures found"
          description="When automated test runs produce failures, their sanitized diagnostics are grouped here for defect tracking."
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 divide-y divide-zinc-200 dark:divide-zinc-800">
          {failures.map((failure) => (
            <Link
              key={failure.id}
              href={`/failures/${failure.id}`}
              className="block p-5 hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                    <AlertOctagon className="h-3.5 w-3.5" />
                    {failure.errorType || "Error"}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400">
                    <Hash className="h-3 w-3" />
                    {failure.signatureHash.slice(0, 12)}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1 font-semibold text-zinc-900 dark:text-zinc-100">
                    <Layers className="h-3.5 w-3.5 text-zinc-400" />
                    {failure.occurrenceCount} {failure.occurrenceCount === 1 ? "time" : "times"}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                    Last seen: {new Date(failure.lastSeenAt).toLocaleDateString()}
                  </span>
                  <ChevronRight className="h-4 w-4 text-zinc-400" />
                </div>
              </div>

              <p className="mt-3 text-xs font-mono text-zinc-700 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                {failure.normalizedError}
              </p>
            </Link>
          ))}

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            baseUrl="/failures"
            queryParams={query ? { query } : {}}
          />
        </div>
      )}
    </main>
  );
}

export default function FailuresPage(props: FailuresPageProps) {
  return (
    <div className="flex flex-col flex-1">
      <Header
        title="Failure Explorer"
        description="Investigate recurring Playwright test failures grouped by deterministic SHA-256 signatures."
      />
      <Suspense fallback={<div className="p-8 text-xs text-zinc-400">Loading failure signatures...</div>}>
        <FailuresContent {...props} />
      </Suspense>
    </div>
  );
}
