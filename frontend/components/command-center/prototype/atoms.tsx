"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { MonitorStatus } from "./model";

export function StatusDot({ status, className }: { status: MonitorStatus; className?: string }) {
  const hot = status !== "ok";
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5 shrink-0 items-center justify-center", className)}>
      {hot ? (
        <span
          className={cn(
            "cc-pulse absolute inset-0 rounded-full",
            status === "warn" ? "bg-amber-400" : "bg-red-400"
          )}
        />
      ) : null}
      <span
        className={cn(
          "relative inline-block h-1.5 w-1.5 rounded-full",
          status === "ok" && "bg-emerald-400 shadow-[0_0_8px_#34d399]",
          status === "warn" && "bg-amber-400",
          status === "alert" && "bg-red-400"
        )}
      />
    </span>
  );
}

export function Sparkline({
  values,
  className,
  stroke = "hsl(var(--primary))",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  if (values.length < 2) return <div className={cn("h-6 w-16", className)} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const w = 72;
  const h = 22;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / span) * (h - 4) - 2;
    return { x, y };
  });
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const fill = `${line} ${w},${h} 0,${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={cn("h-6 w-[72px]", className)} aria-hidden>
      <polyline fill={stroke} fillOpacity="0.14" stroke="none" points={fill} />
      <polyline fill="none" stroke={stroke} strokeWidth="1.5" points={line} />
      {last ? <circle cx={last.x} cy={last.y} r="1.6" fill={stroke} /> : null}
    </svg>
  );
}

export function BarGauge({
  pct,
  tone = "ok",
  className,
}: {
  pct: number;
  tone?: MonitorStatus | "primary";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden bg-muted", className)}>
      <div
        className={cn(
          "h-full transition-[width] duration-500",
          tone === "ok" && "bg-gradient-to-r from-emerald-700 to-emerald-400",
          tone === "warn" && "bg-gradient-to-r from-amber-700 to-amber-400",
          tone === "alert" && "bg-gradient-to-r from-red-800 to-red-400",
          tone === "primary" && "bg-gradient-to-r from-primary/70 to-primary"
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function MinMaxLast({
  name,
  min,
  max,
  last,
  accent,
}: {
  name: string;
  min: number;
  max: number;
  last: number;
  accent?: string;
}) {
  return (
    <div className="flex items-baseline gap-3 font-mono text-[10px] tabular-nums text-muted-foreground">
      <span className={cn("uppercase tracking-wide", accent ?? "text-muted-foreground")}>{name}</span>
      <span>min {min}</span>
      <span>max {max}</span>
      <span className={cn("text-foreground", accent)}>{last}</span>
    </div>
  );
}

export function TagChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-6 rounded px-2 font-mono text-[10px] uppercase tracking-wide ring-1 transition-colors",
        active
          ? "bg-primary/15 text-primary ring-primary/40"
          : "text-muted-foreground ring-border hover:text-foreground hover:ring-foreground/30"
      )}
    >
      {children}
    </button>
  );
}
