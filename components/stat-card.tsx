import React from "react";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subValue?: string;
  icon: LucideIcon;
  variant?: "default" | "success" | "danger" | "warning";
}

export function StatCard({
  title,
  value,
  subValue,
  icon: Icon,
  variant = "default",
}: StatCardProps) {
  let iconBg = "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  const borderHighlight = "border-zinc-200 dark:border-zinc-800";

  if (variant === "success") {
    iconBg = "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400";
  } else if (variant === "danger") {
    iconBg = "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400";
  } else if (variant === "warning") {
    iconBg = "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400";
  }

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-xs dark:bg-zinc-900 ${borderHighlight}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
          {title}
        </span>
        <div className={`rounded-lg p-2 ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          {value}
        </span>
        {subValue && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
}
