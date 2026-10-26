"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  RefreshCw,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  History,
} from "lucide-react";

export interface SyncEventItem {
  id: string;
  action: "CREATE" | "RETRY" | "COMMENT";
  status: "SUCCESS" | "ERROR";
  errorMessage?: string | null;
  attemptedAt: Date | string;
}

export interface DefectItem {
  id: string;
  githubIssueNumber?: number | null;
  githubIssueUrl?: string | null;
  issueTitle?: string;
  syncStatus: "PENDING" | "SYNCED" | "FAILED";
  lastSyncError?: string | null;
  syncEvents?: SyncEventItem[];
}

export interface GitHubIssueActionProps {
  failureSignatureId: string;
  initialDefect?: DefectItem | null;
}

export function GitHubIssueAction({
  failureSignatureId,
  initialDefect,
}: GitHubIssueActionProps) {
  const router = useRouter();
  const [defect, setDefect] = useState<DefectItem | null>(initialDefect || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateIssue = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/failures/${encodeURIComponent(failureSignatureId)}/github-issue`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || "Failed to create GitHub Issue");
      }

      if (json.data?.defect) {
        setDefect(json.data.defect);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleRetrySync = async () => {
    if (!defect?.id) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/defects/${encodeURIComponent(defect.id)}/retry-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.message || "Failed to retry GitHub synchronization");
      }

      if (json.data?.defect) {
        setDefect(json.data.defect);
      }
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const syncStatus = defect?.syncStatus;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              GitHub Issue Tracking
            </h3>
            {syncStatus === "SYNCED" && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Synced
              </span>
            )}
            {syncStatus === "FAILED" && (
              <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                <AlertTriangle className="h-3 w-3" />
                Sync Failed
              </span>
            )}
            {syncStatus === "PENDING" && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Pending Sync
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {syncStatus === "SYNCED"
              ? "This recurring failure is actively linked to an automated GitHub Issue."
              : syncStatus === "FAILED"
              ? "Synchronization encountered an error. You can safely retry without creating duplicates."
              : "Generate an automated GitHub defect issue deduplicated against this signature hash."}
          </p>
        </div>

        <div>
          {/* State 1: No Defect Linked */}
          {!syncStatus && (
            <button
              onClick={handleCreateIssue}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 transition-colors"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Creating Issue...
                </>
              ) : (
                <>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Create GitHub Issue
                </>
              )}
            </button>
          )}

          {/* State 2: Synced */}
          {syncStatus === "SYNCED" && defect?.githubIssueUrl && (
            <a
              href={defect.githubIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Issue #{defect.githubIssueNumber}
            </a>
          )}

          {/* State 3: Failed */}
          {syncStatus === "FAILED" && (
            <button
              onClick={handleRetrySync}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-medium text-white shadow-xs hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Retrying...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Sync
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Error Callout if any */}
      {(error || (syncStatus === "FAILED" && defect?.lastSyncError)) && (
        <div className="rounded-lg bg-rose-50 p-3 border border-rose-200 text-xs text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-300">
          <div className="font-semibold flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            Synchronization Error
          </div>
          <div>{error || defect?.lastSyncError}</div>
        </div>
      )}

      {/* Sync Events Audit History */}
      {defect?.syncEvents && defect.syncEvents.length > 0 && (
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <History className="h-3.5 w-3.5" />
            <span>Synchronization Audit Log</span>
          </div>

          <div className="space-y-1.5">
            {defect.syncEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between text-[11px] text-zinc-500 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-1.5 rounded-md border border-zinc-200/60 dark:border-zinc-800/60"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-semibold ${
                      event.status === "SUCCESS"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-rose-600 dark:text-rose-400"
                    }`}
                  >
                    [{event.action}] {event.status}
                  </span>
                  {event.errorMessage && (
                    <span className="text-zinc-600 dark:text-zinc-400 truncate max-w-[280px] sm:max-w-md">
                      {event.errorMessage}
                    </span>
                  )}
                </div>
                <span className="font-mono text-zinc-400">
                  {new Date(event.attemptedAt).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
