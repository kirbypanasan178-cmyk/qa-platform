import React from "react";
import { CheckCircle2, XCircle, AlertCircle, Clock, MinusCircle } from "lucide-react";

export type StatusType =
  | "PASSED"
  | "FAILED"
  | "SKIPPED"
  | "TIMED_OUT"
  | "RUNNING"
  | "PARTIAL"
  | "SYNCED"
  | "PENDING"
  | string;

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
  showIcon?: boolean;
}

export function StatusBadge({ status, className = "", showIcon = true }: StatusBadgeProps) {
  const normStatus = status.toUpperCase();

  let colorClasses = "bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700";
  let Icon = MinusCircle;

  switch (normStatus) {
    case "PASSED":
    case "SUCCESS":
    case "SYNCED":
      colorClasses = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800";
      Icon = CheckCircle2;
      break;
    case "FAILED":
    case "ERROR":
      colorClasses = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800";
      Icon = XCircle;
      break;
    case "TIMED_OUT":
      colorClasses = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800";
      Icon = AlertCircle;
      break;
    case "RUNNING":
      colorClasses = "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800";
      Icon = Clock;
      break;
    case "SKIPPED":
      colorClasses = "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700";
      Icon = MinusCircle;
      break;
    case "PARTIAL":
    case "PENDING":
      colorClasses = "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800";
      Icon = AlertCircle;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClasses} ${className}`}
    >
      {showIcon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{normStatus}</span>
    </span>
  );
}
