import React, { Suspense } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { StatCard } from "@/components/stat-card";
import { Pagination } from "@/components/pagination";
import { EmptyState } from "@/components/empty-state";
import {
  getInvestigations,
  getInvestigationStats,
} from "@/lib/data/investigations";
import {
  InvestigationClassification,
  InvestigationStatus,
} from "@prisma/client";
import {
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
  Wrench,
  Search,
  ExternalLink,
  ChevronRight,
} from "lucide-react";

interface InvestigationsPageProps {
  searchParams: Promise<{
    page?: string;
    status?: string;
    classification?: string;
    query?: string;
  }>;
}

function getClassificationBadge(classification: InvestigationClassification) {
  switch (classification) {
    case "APPLICATION_BUG":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 border-rose-200 dark:border-rose-900";
    case "FLAKY_TEST":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-200 dark:border-amber-900";
    case "TEST_DEFECT":
      return "bg-purple-100 text-purple-800 dark:bg-purple-950/70 dark:text-purple-300 border-purple-200 dark:border-purple-900";
    default:
      return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700";
  }
}

function getStatusBadge(status: InvestigationStatus) {
  switch (status) {
    case "CONFIRMED_BUG":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";
    case "RERUN_REQUESTED":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
    case "TEST_DEFECT_MARKED":
      return "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300";
    case "REJECTED":
      return "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300";
    default:
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300";
  }
}

async function InvestigationsContent({ searchParams }: InvestigationsPageProps) {
  const resolvedParams = await searchParams;
  const page = resolvedParams.page ? parseInt(resolvedParams.page, 10) : 1;
  const status = resolvedParams.status as InvestigationStatus | undefined;
  const classification = resolvedParams.classification as InvestigationClassification | undefined;
  const query = resolvedParams.query || "";

  const [data, stats] = await Promise.all([
    getInvestigations({
      page,
      pageSize: 10,
      status: status || undefined,
      classification: classification || undefined,
      query: query || undefined,
    }),
    getInvestigationStats(),
  ]);

  const queryParams: Record<string, string> = {};
  if (status) queryParams.status = status;
  if (classification) queryParams.classification = classification;
  if (query) queryParams.query = query;

  return (
    <main className="p-8 space-y-6 flex-1">
      {/* Stat Cards Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Ingested"
          value={stats.total}
          subValue="Analyzed failures"
          icon={Sparkles}
        />
        <StatCard
          title="Pending Review"
          value={stats.pendingReview}
          subValue="Awaiting admin triage"
          icon={AlertCircle}
          variant="warning"
        />
        <StatCard
          title="Confirmed Bugs"
          value={stats.confirmedBugs}
          subValue="Verified defects"
          icon={CheckCircle2}
          variant="danger"
        />
        <StatCard
          title="Reruns Requested"
          value={stats.rerunRequested}
          subValue="Flaky retry checks"
          icon={RotateCcw}
          variant="warning"
        />
        <StatCard
          title="Test Defects"
          value={stats.testDefects}
          subValue="Locator or fixture errors"
          icon={Wrench}
        />
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <Link
            href="/investigations"
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              !status && !classification
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            All
          </Link>
          <Link
            href="/investigations?status=PENDING_REVIEW"
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              status === "PENDING_REVIEW"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            Pending Review ({stats.pendingReview})
          </Link>
          <Link
            href="/investigations?classification=APPLICATION_BUG"
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              classification === "APPLICATION_BUG"
                ? "bg-rose-700 text-white dark:bg-rose-600"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            App Bugs
          </Link>
          <Link
            href="/investigations?classification=FLAKY_TEST"
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              classification === "FLAKY_TEST"
                ? "bg-amber-600 text-white dark:bg-amber-500"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            Flaky Tests
          </Link>
          <Link
            href="/investigations?classification=TEST_DEFECT"
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              classification === "TEST_DEFECT"
                ? "bg-purple-700 text-white dark:bg-purple-600"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            Test Defects
          </Link>
        </div>

        {/* Search Input */}
        <form action="/investigations" method="GET" className="relative">
          {status && <input type="hidden" name="status" value={status} />}
          {classification && (
            <input type="hidden" name="classification" value={classification} />
          )}
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            name="query"
            defaultValue={query}
            placeholder="Search test or summary..."
            className="w-full sm:w-64 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-1.5 text-xs text-zinc-900 focus:border-zinc-400 focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </form>
      </div>

      {/* Investigations Table */}
      {data.investigations.length === 0 ? (
        <EmptyState
          title="No failure investigations found"
          description="No failed tests match the selected criteria. When tests fail during Playwright execution, automated assessments will appear here."
          action={
            <Link
              href="/investigations"
              className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              Clear Filters
            </Link>
          }
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-zinc-50 border-b border-zinc-200 text-zinc-500 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-6 py-3.5">Test Case & Spec</th>
                  <th className="px-6 py-3.5">Classification</th>
                  <th className="px-6 py-3.5">Confidence</th>
                  <th className="px-6 py-3.5">Triage Status</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {data.investigations.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="space-y-0.5 max-w-md">
                        <Link
                          href={`/investigations/${item.id}`}
                          className="font-semibold text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400 transition-colors line-clamp-1"
                        >
                          {item.testResult.testTitle}
                        </Link>
                        <div className="text-[11px] text-zinc-400 font-mono truncate">
                          {item.testResult.specFile}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${getClassificationBadge(
                          item.classification
                        )}`}
                      >
                        {item.classification.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                          <div
                            className={`h-full ${
                              item.confidenceScore >= 80
                                ? "bg-emerald-500"
                                : item.confidenceScore >= 60
                                ? "bg-amber-500"
                                : "bg-zinc-400"
                            }`}
                            style={{ width: `${item.confidenceScore}%` }}
                          />
                        </div>
                        <span className="font-mono text-zinc-600 dark:text-zinc-300">
                          {item.confidenceScore}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${getStatusBadge(
                          item.status
                        )}`}
                      >
                        {item.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-500 font-mono whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <Link
                        href={`/investigations/${item.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                      >
                        Review
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={data.page}
            totalPages={data.totalPages}
            baseUrl="/investigations"
            queryParams={queryParams}
          />
        </div>
      )}
    </main>
  );
}

export default async function InvestigationsPage(props: InvestigationsPageProps) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50/50 dark:bg-zinc-950">
      <Header
        title="Failure Investigations"
        description="AI-assisted triage and rule-based diagnostic assessment for Playwright test failures."
      />
      <Suspense
        fallback={
          <div className="p-8 text-center text-xs text-zinc-500">
            Loading failure investigations...
          </div>
        }
      >
        <InvestigationsContent {...props} />
      </Suspense>
    </div>
  );
}
