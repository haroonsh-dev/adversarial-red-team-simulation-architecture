"use client";

import { cn } from "@/lib/utils";
import type { AssessmentCategoryRow } from "@/lib/assessmentResults";

interface CompareDeltaGraphProps {
  categoriesA: AssessmentCategoryRow[];
  categoriesB: AssessmentCategoryRow[];
  riskDelta: number;
  labelA?: string;
  labelB?: string;
  className?: string;
}

/** Dual risk bars by lens — Scan A vs B from real assessment rows. */
export function CompareDeltaGraph({
  categoriesA,
  categoriesB,
  riskDelta,
  labelA = "A",
  labelB = "B",
  className,
}: CompareDeltaGraphProps) {
  const lenses = Array.from(
    new Set([...categoriesA.map((r) => r.lens), ...categoriesB.map((r) => r.lens)])
  );

  if (lenses.length === 0) {
    return (
      <div
        className={cn(
          "flex min-h-[120px] items-center justify-center rounded-xl border border-dashed border-border text-[13px] text-muted-foreground",
          className
        )}
      >
        No category data to graph yet — both scans need transcript results.
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-border bg-background", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#67b3ef]">
          Compare graph
        </p>
        <p
          className={cn(
            "font-mono text-[12px] font-semibold tabular-nums",
            riskDelta < 0 ? "text-[#4ade80]" : riskDelta > 0 ? "text-[#f87171]" : "text-foreground"
          )}
        >
          Δ risk {riskDelta > 0 ? "+" : ""}
          {riskDelta}%
        </p>
      </div>
      <div className="space-y-4 p-4">
        {lenses.map((lens) => {
          const a = categoriesA.find((r) => r.lens === lens);
          const b = categoriesB.find((r) => r.lens === lens);
          const aScore = a?.riskScore ?? 0;
          const bScore = b?.riskScore ?? 0;
          return (
            <div key={lens}>
              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-medium text-foreground">{lens}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {labelA} {aScore}% · {labelB} {bScore}%
                </span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-4 shrink-0 font-mono text-[9px] text-[#67b3ef]">{labelA}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#67b3ef]"
                      style={{ width: `${Math.min(100, aScore)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 shrink-0 font-mono text-[9px] text-[#fbbf24]">{labelB}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#fbbf24]"
                      style={{ width: `${Math.min(100, bScore)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
        Negative overall Δ means {labelB} is safer than {labelA}.
      </p>
    </div>
  );
}
