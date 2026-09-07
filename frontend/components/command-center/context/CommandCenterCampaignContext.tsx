"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type TelemetryHealth = "LIVE" | "DEGRADED" | "STALE" | "DISCONNECTED" | "SIMULATION";

export function CommandCenterCampaignContext({
  campaignName = "ARTSA-REDTEAM-042",
  sessionId = "RUN-00182",
  targetName = "Enterprise Agent Stack",
  roundNumber = 1,
  apiOnline = true,
  wsConnected = true,
  isPaused = false,
  telemetryState: telemetryOverride,
  className,
}: {
  campaignName?: string;
  sessionId?: string;
  targetName?: string;
  roundNumber?: number;
  apiOnline?: boolean;
  wsConnected?: boolean;
  isPaused?: boolean;
  telemetryState?: TelemetryHealth;
  className?: string;
}) {
  const [elapsedMs, setElapsedMs] = useState(420);

  // Derive telemetry health state
  const currentHealth: TelemetryHealth =
    telemetryOverride ??
    (apiOnline && wsConnected
      ? "LIVE"
      : apiOnline && !wsConnected
        ? "DEGRADED"
        : !apiOnline && wsConnected
          ? "DISCONNECTED"
          : "SIMULATION");

  // Update dynamic elapsed timer relative to the current round
  useEffect(() => {
    setElapsedMs(Math.floor(Math.random() * 300) + 120);
    const interval = window.setInterval(() => {
      setElapsedMs((prev) => (isPaused ? prev : prev + 250));
    }, 250);
    return () => window.clearInterval(interval);
  }, [roundNumber, isPaused]);

  const lastEventLabel =
    elapsedMs < 1000 ? `${elapsedMs}ms ago` : `${(elapsedMs / 1000).toFixed(1)}s ago`;

  const healthStyle =
    currentHealth === "LIVE"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : currentHealth === "DEGRADED"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : currentHealth === "DISCONNECTED"
          ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
          : "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400";

  const dotColor =
    currentHealth === "LIVE"
      ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
      : currentHealth === "DEGRADED"
        ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]"
        : currentHealth === "DISCONNECTED"
          ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"
          : "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.8)]";

  return (
    <header
      aria-label="Campaign and Operational Identity"
      className={cn(
        "flex flex-wrap items-center justify-between gap-y-2.5 gap-x-6 border-b border-border/70 pb-4 text-[11px]",
        className
      )}
    >
      {/* Identity key-values */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 font-mono">
        {/* Campaign */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            CAMPAIGN
          </span>
          <span className="font-semibold text-foreground tracking-wide">
            {campaignName}
          </span>
        </div>

        <span className="hidden sm:inline text-border">/</span>

        {/* Session */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            SESSION
          </span>
          <span className="text-foreground/90 font-medium">
            {sessionId}
          </span>
        </div>

        <span className="hidden md:inline text-border">/</span>

        {/* Target */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            TARGET
          </span>
          <span className="text-foreground/90 font-medium">
            {targetName}
          </span>
        </div>

        <span className="hidden lg:inline text-border">/</span>

        {/* Round */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            ROUND
          </span>
          <span className="font-semibold text-foreground">
            R{roundNumber}
          </span>
        </div>
      </div>

      {/* Telemetry status and mode badge */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4 font-mono text-[10px]">
        {/* Backend API Connection Status */}
        <div
          className="flex items-center gap-1.5"
          title={apiOnline ? "Backend API connected" : "Backend API offline — operating in standalone simulation"}
        >
          <span className="uppercase text-muted-foreground">API</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase border",
              apiOnline
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-slate-500/30 bg-slate-500/10 text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1 w-1 rounded-full",
                apiOnline ? "bg-emerald-400" : "bg-slate-400"
              )}
            />
            {apiOnline ? "ONLINE" : "OFFLINE"}
          </span>
        </div>

        {/* Mode */}
        <div className="flex items-center gap-1.5">
          <span className="uppercase text-muted-foreground">MODE</span>
          <span className="rounded px-1.5 py-0.5 font-semibold uppercase bg-muted/60 text-foreground border border-border">
            {currentHealth === "LIVE" ? "LIVE" : "SIMULATION"}
          </span>
        </div>

        {/* Telemetry Status Indicator */}
        <div className="flex items-center gap-2">
          <span className="uppercase text-muted-foreground">TELEMETRY</span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              healthStyle
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
            {currentHealth}
          </span>
        </div>

        {/* Last Event */}
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span>LAST EVENT</span>
          <span className="text-foreground font-medium tabular-nums lowercase">
            {lastEventLabel}
          </span>
        </div>
      </div>
    </header>
  );
}
