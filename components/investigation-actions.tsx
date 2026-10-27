"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  RotateCcw,
  Wrench,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Send,
} from "lucide-react";

interface InvestigationActionsProps {
  investigationId: string;
  currentStatus: string;
}

export function InvestigationActions({
  investigationId,
  currentStatus: initialStatus,
}: InvestigationActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [notes, setNotes] = useState("");
  const [reviewedBy, setReviewedBy] = useState("Admin Lead");
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleTriageAction = async (action: string) => {
    setLoadingAction(action);
    setFeedback(null);

    try {
      const response = await fetch(
        `/api/v1/investigations/${encodeURIComponent(investigationId)}/action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action,
            notes: notes.trim() || undefined,
            reviewedBy: reviewedBy.trim() || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Failed to execute action ${action}`);
      }

      setStatus(data.data.status);
      setFeedback({
        type: "success",
        message: `Investigation updated: ${action.replace("_", " ")} applied successfully.`,
      });
      setNotes("");
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Action failed";
      setFeedback({
        type: "error",
        message,
      });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
        <div>
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            Administrator Triage Actions
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Review the automated assessment, record decisions, and guide bug tracking or test fixes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Current Status:</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              status === "CONFIRMED_BUG"
                ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                : status === "RERUN_REQUESTED"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                : status === "TEST_DEFECT_MARKED"
                ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                : status === "REJECTED"
                ? "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300"
                : "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
            }`}
          >
            {status.replace("_", " ")}
          </span>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg p-3 text-xs ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
              : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Admin Notes Field */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Triage Notes & Rationale (Optional)
          </label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Verified with manual reproduction on staging, filing bug..."
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-700"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Reviewer
          </label>
          <input
            type="text"
            value={reviewedBy}
            onChange={(e) => setReviewedBy(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 focus:border-zinc-400 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-700"
          />
        </div>
      </div>

      {/* Action Buttons Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
        <button
          onClick={() => handleTriageAction("CONFIRM_BUG")}
          disabled={loadingAction !== null}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {loadingAction === "CONFIRM_BUG" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          Confirm Bug
        </button>

        <button
          onClick={() => handleTriageAction("REQUEST_RERUN")}
          disabled={loadingAction !== null}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {loadingAction === "REQUEST_RERUN" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Request Rerun
        </button>

        <button
          onClick={() => handleTriageAction("MARK_TEST_DEFECT")}
          disabled={loadingAction !== null}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-purple-700 disabled:opacity-50 transition-colors"
        >
          {loadingAction === "MARK_TEST_DEFECT" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Wrench className="h-3.5 w-3.5" />
          )}
          Mark Test Defect
        </button>

        <button
          onClick={() => handleTriageAction("REJECT_ASSESSMENT")}
          disabled={loadingAction !== null}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 transition-colors"
        >
          {loadingAction === "REJECT_ASSESSMENT" ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          Reject Assessment
        </button>
      </div>
    </div>
  );
}
