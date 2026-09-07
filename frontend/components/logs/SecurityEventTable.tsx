"use client";

import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { formatDateTime } from "@/lib/dates";
import { actionToneClass, type SecurityLogRow } from "@/lib/securityLog";
import { cn } from "@/lib/utils";

interface SecurityEventTableProps {
  rows: SecurityLogRow[];
  selectedId: string | null;
  onSelect: (row: SecurityLogRow) => void;
  loading?: boolean;
  className?: string;
}

export function SecurityEventTable({
  rows,
  selectedId,
  onSelect,
  loading,
  className,
}: SecurityEventTableProps) {
  if (loading) {
    return (
      <div className={cn("space-y-2 p-3", className)}>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-md bg-card" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className={cn("overflow-auto", className)}>
      <table className="w-full min-w-[860px] text-left text-[12px]">
        <thead className="sticky top-0 z-10 border-b border-border bg-muted font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 font-medium">Time</th>
            <th className="px-3 py-2.5 font-medium">Severity</th>
            <th className="px-3 py-2.5 font-medium">Action</th>
            <th className="px-3 py-2.5 font-medium">Agent</th>
            <th className="px-3 py-2.5 font-medium">Tool</th>
            <th className="px-3 py-2.5 font-medium">Verdict</th>
            <th className="px-3 py-2.5 font-medium text-right">Risk</th>
            <th className="px-3 py-2.5 font-medium">Session</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = selectedId === row.id;
            const hot = row.action === "KILL" || row.action === "QUARANTINE" || row.severity === "CRITICAL";
            return (
              <tr
                key={row.id}
                className={cn(
                  "cursor-pointer border-b border-border/70 transition-colors",
                  selected ? "bg-card" : "hover:bg-muted",
                  hot && !selected && "bg-[hsl(var(--severity-critical)/0.04)]"
                )}
                onClick={() => onSelect(row)}
                aria-selected={selected}
              >
                <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {formatDateTime(row.timestamp, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </td>
                <td className="px-3 py-2">
                  <SeverityBadge severity={row.severity} />
                </td>
                <td
                  className={cn(
                    "px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-wide",
                    actionToneClass(row.action)
                  )}
                >
                  {row.action}
                </td>
                <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {row.agentId || "—"}
                </td>
                <td className="max-w-[160px] truncate px-3 py-2 font-medium text-foreground">
                  {row.tool}
                </td>
                <td className="max-w-[120px] truncate px-3 py-2 font-mono text-[10px] uppercase text-muted-foreground">
                  {row.verdict || "—"}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-foreground">
                  {row.riskScore > 0 ? Math.round(row.riskScore) : "—"}
                </td>
                <td className="max-w-[100px] truncate px-3 py-2 font-mono text-[10px] text-muted-foreground">
                  {row.sessionId ? `${row.sessionId.slice(0, 10)}…` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
