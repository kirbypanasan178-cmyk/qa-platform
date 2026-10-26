"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PlaySquare,
  AlertOctagon,
  ShieldCheck,
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  const navigation = [
    { name: "Overview", href: "/", icon: LayoutDashboard },
    { name: "Test Runs", href: "/runs", icon: PlaySquare },
    { name: "Failures", href: "/failures", icon: AlertOctagon },
  ];

  return (
    <aside className="w-64 shrink-0 border-r border-zinc-200 bg-white flex flex-col justify-between dark:border-zinc-800 dark:bg-zinc-950">
      <div className="p-4">
        <div className="flex items-center gap-2.5 px-2 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="rounded-lg bg-zinc-900 p-1.5 text-white dark:bg-zinc-100 dark:text-zinc-900">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50 leading-none">
              QA-Platform
            </h1>
            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              CMS Dashboard
            </span>
          </div>
        </div>

        <nav className="mt-6 flex flex-col gap-1">
          {navigation.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-950 font-semibold dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
        <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200/60 dark:bg-zinc-900/50 dark:border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
              System Service
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
          </div>
          <div className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-500">
            Node.js Ingestion API v1
          </div>
        </div>
      </div>
    </aside>
  );
}
