"use client";

import { useEffect, useState } from "react";
import {
  Maximize2,
  Minimize2,
  OctagonAlert,
  Radio,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MissionPostureResult, PrototypeFilters, PrototypeWindow } from "../prototype/model";
import { WINDOW_CHIPS } from "../prototype/model";

export function MissionHud({
  mission,
  filters,
  onFilterChange,
  containmentCount,
  onOpenContainment,
  wsConnected,
  apiOnline,
}: {
  mission: MissionPostureResult;
  filters: PrototypeFilters;
  onFilterChange: (f: (prev: PrototypeFilters) => PrototypeFilters) => void;
  containmentCount: { total: number; quarantined: number; terminated: number };
  onOpenContainment: () => void;
  wsConnected: boolean;
  apiOnline: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const posture = mission.posture;
  const isCritical = posture === "critical";
  const isElevated = posture === "elevated";

  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[var(--cc-border-default)] bg-[var(--cc-bg-surface-1)]/95 px-4 backdrop-blur-md">
      {/* Left Wing: System Branding, Title & Mission Posture */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-[14px] font-semibold tracking-tight text-[var(--cc-text-primary)]">
            Command Center
          </h1>
          <span className="hidden font-mono text-[10px] text-[var(--cc-primary)] tracking-[0.14em] sm:inline">
            // COCKPIT
          </span>
        </div>

        <div className="hidden h-4 w-px bg-[var(--cc-border-emphasis)] sm:block" />

        {/* Global Defense Posture (Dual-Channel Visual + Text) */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
            isCritical
              ? "border-red-500/50 bg-red-500/15 text-red-500"
              : isElevated
                ? "border-amber-500/50 bg-amber-500/15 text-amber-500"
                : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
          )}
        >
          {isCritical ? (
            <OctagonAlert className="h-3 w-3" />
          ) : isElevated ? (
            <ShieldAlert className="h-3 w-3" />
          ) : (
            <ShieldCheck className="h-3 w-3" />
          )}
          <span>{posture}</span>
        </div>

        {/* Mission Directive Headline */}
        <div
          className="hidden max-w-[340px] truncate rounded border border-[var(--cc-border-subtle)] bg-[var(--cc-bg-surface-2)] px-2 py-0.5 font-mono text-[10px] text-[var(--cc-text-secondary)] xl:block"
          title={mission.headline}
        >
          <span className="font-semibold text-[var(--cc-text-dim)]">Directive: </span>
          <span className="text-[var(--cc-text-secondary)]">{mission.headline}</span>
        </div>
      </div>

      {/* Center Wing: Active Clock */}
      <div className="hidden items-center gap-3 md:flex">
        <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-[var(--cc-text-muted)]">
          <span className="text-[9px] uppercase tracking-wider text-[var(--cc-text-dim)]">UTC</span>
          <span>{now.toISOString().slice(11, 19)}</span>
        </div>
      </div>

      {/* Right Wing: Containment Trigger, Window Filter, Transport, Fullscreen */}
      <div className="flex items-center gap-2.5">
        {/* Active Containment Pill */}
        <button
          type="button"
          onClick={onOpenContainment}
          className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/40 bg-purple-500/10 px-2.5 py-0.5 font-mono text-[10px] text-purple-400 transition-colors hover:border-purple-500/70 hover:bg-purple-500/20 active:scale-[0.98]"
          title="Active containment status — click to inspect"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
          <span className="font-semibold">Containment:</span>
          <span className="font-bold">{containmentCount.total}</span>
          <span className="text-[9px] opacity-80">
            ({containmentCount.quarantined}Q · {containmentCount.terminated}T)
          </span>
        </button>

        {/* Temporal Window Filter Segmented Pill */}
        <div className="flex items-center rounded-md border border-[var(--cc-border-default)] bg-[var(--cc-bg-surface-3)] p-0.5">
          {WINDOW_CHIPS.map((w: PrototypeWindow) => (
            <button
              key={w}
              type="button"
              onClick={() => onFilterChange((f) => ({ ...f, window: w }))}
              className={cn(
                "rounded px-2 py-0.5 font-mono text-[10px] font-medium transition-colors",
                filters.window === w
                  ? "bg-[var(--cc-bg-surface-1)] text-[var(--cc-text-primary)] shadow-sm font-semibold"
                  : "text-[var(--cc-text-muted)] hover:text-[var(--cc-text-primary)]"
              )}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Live Transport Status */}
        <div className="flex items-center gap-1.5 rounded border border-[var(--cc-border-subtle)] bg-[var(--cc-bg-surface-2)] px-2 py-0.5 font-mono text-[10px]">
          <Radio
            className={cn(
              "h-3 w-3",
              wsConnected && apiOnline
                ? "text-emerald-500"
                : apiOnline
                  ? "text-amber-500"
                  : "text-red-500"
            )}
          />
          <span className="text-[var(--cc-text-muted)]">
            {wsConnected && apiOnline ? "LIVE" : apiOnline ? "POLLING" : "OFFLINE"}
          </span>
        </div>

        {/* Fullscreen SOC Toggle */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded border border-[var(--cc-border-default)] p-1 text-[var(--cc-text-muted)] transition-colors hover:border-[var(--cc-border-emphasis)] hover:text-[var(--cc-text-primary)]"
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Command Mode (F)"}
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
      </div>
    </header>
  );
}
