"use client";

import { cn } from "@/lib/utils";
import type { AssessmentTestRow } from "@/lib/assessmentResults";

interface AssessmentTestTableProps {
  rows: AssessmentTestRow[];
  selectedId?: string | null;
  onSelect?: (row: AssessmentTestRow) => void;
  className?: string;
}

export function AssessmentTestTable({
  rows,
  selectedId,
  onSelect,
  className,
}: AssessmentTestTableProps) {
  if (!rows.length) {
    return (
      <p className="py-10 text-center text-[13px] text-muted-foreground">No tests run yet.</p>
    );
  }

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-left text-[12px]">
        <thead className="border-b border-border bg-muted font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">Round</th>
            <th className="px-3 py-2.5 font-medium">Test</th>
            <th className="px-3 py-2.5 font-medium">Lens</th>
            <th className="px-3 py-2.5 font-medium">Score</th>
            <th className="px-3 py-2.5 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedId === row.id;
            return (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border/60 transition-colors",
                  onSelect && "cursor-pointer hover:bg-muted",
                  selected && "bg-primary/10"
                )}
                onClick={() => onSelect?.(row)}
              >
                <td className="px-3 py-2.5 font-mono tabular-nums text-muted-foreground">
                  R{row.roundNumber}
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-medium text-foreground">{row.name}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {row.asiCode ?? (row.category || "—")}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{row.lens}</td>
                <td className="px-3 py-2.5 font-mono tabular-nums text-foreground">
                  {row.score05}/5
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase",
                      row.harmful
                        ? "text-[hsl(var(--severity-critical))]"
                        : "text-[#4ade80]"
                    )}
                  >
                    {row.harmful ? "Harmful" : "Safe"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
