"use client";

import { useEffect, useState } from "react";
import { getLatestCommit } from "@/app/actions/github";
import Link from "next/link";
import { GitCommitHorizontal, Loader2 } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { cn } from "@/lib/utils";

interface CommitInfo {
  hash: string;
  message: string;
  url: string;
}

export function GitPulse() {
  const [commit, setCommit] = useState<CommitInfo | null>(null);
  const [loading, setLoading] = useState(true);
  // State to force re-render for time updates
  const [, setTick] = useState(0);

  useEffect(() => {
    getLatestCommit()
      .then((data) => {
        if (data) setCommit(data);
      })
      .finally(() => setLoading(false));
  }, []);

  // Live Heartbeat: Update relative time every 60 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Safely parse the deploy time
  const deployTime = process.env.NEXT_PUBLIC_DEPLOY_TIME
    ? new Date(process.env.NEXT_PUBLIC_DEPLOY_TIME)
    : null;

  // --- SKELETON STATE (Prevents Layout Shift) ---
  if (loading) {
    return (
      <div className="flex items-center gap-3 font-mono text-xs opacity-50 select-none">
        {/* Pulsing Dot Skeleton */}
        <span className="relative flex h-2 w-2">
          <span className="relative inline-flex rounded-full h-2 w-2 bg-muted-foreground/50"></span>
        </span>
        {/* Text Skeleton */}
        <div className="flex items-center gap-1.5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="animate-pulse">INITIALIZING...</span>
        </div>
      </div>
    );
  }

  if (!commit) return null;

  return (
    <div className="relative flex items-center gap-3 font-mono text-xs z-50 animate-in fade-in duration-500">
      {/* Status Indicator (Green = Online) */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-600"></span>
      </span>

      {/* Interactive Hash Container */}
      <div className="group relative">
        <Link
          href={commit.url}
          target="_blank"
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <GitCommitHorizontal className="h-3.5 w-3.5 opacity-70" />
          <span className="font-medium opacity-80 group-hover:opacity-100 transition-opacity">
            {commit.hash}
          </span>
        </Link>

        {/* Theme-Aware Hover Toast (Commit Message) */}
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 w-max max-w-50 opacity-0 translate-y-2 scale-95 transition-all duration-200 group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 z-50">
          <div className="bg-popover text-popover-foreground border border-border rounded px-3 py-2 text-[10px] shadow-lg">
            <span className="text-emerald-500 font-bold mr-1">&gt;</span>
            {commit.message}
            {/* Arrow */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-r border-b border-border rotate-45"></div>
          </div>
        </div>
      </div>

      {/* Live Deploy Time Display */}
      {deployTime && (
        <div className="group/time relative hidden sm:flex items-center">
          {/* Trigger Text */}
          <span
            className={cn(
              "text-muted-foreground/40 text-[10px] ml-1 cursor-help transition-colors group-hover/time:text-foreground",
              // Optional: flash effect when minute updates could go here
            )}
          >
            // {formatDistanceToNow(deployTime, { addSuffix: true })}
          </span>

          {/* Precision Tooltip */}
          <div className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 w-max opacity-0 translate-y-2 scale-95 transition-all duration-200 group-hover/time:opacity-100 group-hover/time:translate-y-0 group-hover/time:scale-100 z-50">
            <div className="bg-popover text-popover-foreground border border-border rounded px-2 py-1.5 text-[10px] shadow-lg font-mono tabular-nums">
              <span className="text-emerald-500 font-bold mr-1">&gt;</span>
              <span className="font-bold mr-1">Last deployed:</span>
              {format(deployTime, "yyyy-MM-dd HH:mm:ss")}
              {/* Tooltip Arrow */}
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-popover border-r border-b border-border rotate-45"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
