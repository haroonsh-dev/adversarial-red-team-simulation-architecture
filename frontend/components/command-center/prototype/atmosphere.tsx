"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FloorShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("cc-floor relative flex min-h-full w-full flex-1 flex-col bg-background text-foreground", className)}>
      <div className="cc-floor__glow pointer-events-none fixed inset-0 z-0" />
      <div className="cc-floor__grid pointer-events-none fixed inset-0 z-0" />
      <div className="cc-floor__sweep pointer-events-none fixed inset-0 z-0" />
      <div className="relative z-[1] flex min-h-full w-full flex-1 flex-col">{children}</div>
    </div>
  );
}

export function FloorCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/50", className)}>
      {children}
    </div>
  );
}

export function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span className="font-mono text-[11px] tabular-nums tracking-wide text-muted-foreground">
      {now.toLocaleTimeString(undefined, { hour12: false })}
    </span>
  );
}

export function LiftHero({
  last,
  liftPp,
  baseline,
}: {
  last: number;
  liftPp: number;
  baseline: number;
}) {
  const up = liftPp >= 0;
  return (
    <div className="flex min-w-0 items-baseline gap-3">
      <p className={cn("cc-lift font-mono text-[28px] font-semibold leading-none tabular-nums", up ? "text-primary" : "text-[hsl(var(--status-error))]")}>
        {up ? "+" : ""}
        {liftPp}
        <span className="ml-0.5 text-[13px] font-medium text-primary/70">pp</span>
      </p>
      <p className="min-w-0 font-mono text-[11px] leading-snug text-muted-foreground">
        ARTSA <span className="text-primary">{last}%</span>
        <span className="text-muted-foreground/70"> vs </span>
        static {baseline}%
      </p>
    </div>
  );
}
