"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AsiCell } from "../prototype/model";

const ASI_TITLES: Record<string, string> = {
  ASI01: "Goal Hijack",
  ASI02: "Tool Misuse",
  ASI03: "Identity Leak",
  ASI04: "Insecure Output",
  ASI05: "Supply Chain",
  ASI06: "Memory Poison",
  ASI07: "Unbounded Loop",
  ASI08: "Breaker Failure",
  ASI09: "Audit Blindspot",
  ASI10: "Evasion Bypass",
};

export function OwaspAsiMatrix({
  asiList,
  onSelectAsi,
}: {
  asiList: AsiCell[];
  onSelectAsi: (code: string) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border-default)] px-3.5 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-text-muted)]">
          OWASP Agentic Security Matrix
        </span>
        <span className="font-mono text-[10px] text-[var(--cc-text-dim)]">
          ASI01–ASI10
        </span>
      </div>

      {/* 10-Item Structured Grid */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 overflow-y-auto p-2.5 [scrollbar-width:thin]">
        {asiList.map((item) => {
          const title = ASI_TITLES[item.code] ?? item.label;
          const isBreached = !item.built || item.coverage < 50;
          const isElevated = item.coverage >= 50 && item.coverage < 80;

          return (
            <button
              key={item.code}
              type="button"
              onClick={() => onSelectAsi(item.code)}
              className={cn(
                "group flex flex-col justify-between rounded-md border p-2 text-left transition-all duration-150",
                isBreached
                  ? "border-red-500/40 bg-red-500/10 hover:border-red-500/70 hover:bg-red-500/15"
                  : isElevated
                    ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10"
                    : "border-[var(--cc-border-subtle)] bg-[var(--cc-bg-surface-3)]/40 hover:border-[var(--cc-border-emphasis)] hover:bg-[var(--cc-bg-surface-hover)]"
              )}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold text-[var(--cc-text-primary)]">
                    {item.code}
                  </span>
                  {isBreached ? (
                    <ShieldAlert className="h-3 w-3 text-red-500" />
                  ) : (
                    <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  )}
                </div>
                <p className="mt-1 truncate font-mono text-[11px] font-medium text-[var(--cc-text-secondary)]">
                  {title}
                </p>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between font-mono text-[9px] text-[var(--cc-text-muted)]">
                  <span>Coverage</span>
                  <span
                    className={cn(
                      "font-semibold tabular-nums",
                      isBreached ? "text-red-500" : "text-emerald-500"
                    )}
                  >
                    {item.coverage}%
                  </span>
                </div>
                {/* Micro Bar Gauge */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--cc-border-default)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-300",
                      isBreached ? "bg-red-500" : isElevated ? "bg-amber-500" : "bg-emerald-500"
                    )}
                    style={{ width: `${Math.max(6, item.coverage)}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
