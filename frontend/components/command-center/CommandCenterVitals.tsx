"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { CommandVitals, MissionPosture } from "@/lib/commandCenterOps";

const CELLS: Array<{
  key: keyof CommandVitals;
  label: string;
  fmt: (v: number) => string;
  tone?: (v: number) => "ok" | "warn" | "crit" | "neutral";
}> = [
  {
    key: "activeSimulations",
    label: "Active Sims",
    fmt: (v) => String(v),
    tone: (v) => (v >= 3 ? "warn" : "neutral"),
  },
  {
    key: "detectionRate",
    label: "Detection",
    fmt: (v) => `${v}%`,
    tone: (v) => (v < 70 ? "crit" : v < 85 ? "warn" : "ok"),
  },
  {
    key: "findingsToday",
    label: "Findings",
    fmt: (v) => String(v),
    tone: (v) => (v >= 12 ? "warn" : "neutral"),
  },
  {
    key: "agentUptime",
    label: "Agent Health",
    fmt: (v) => `${v}%`,
    tone: (v) => (v < 70 ? "crit" : v < 90 ? "warn" : "ok"),
  },
  {
    key: "activeAttackPaths",
    label: "Attack Paths",
    fmt: (v) => String(v),
    tone: (v) => (v >= 2 ? "crit" : v === 1 ? "warn" : "ok"),
  },
  {
    key: "avgResponseMs",
    label: "Hop Latency",
    fmt: (v) => `${v}ms`,
    tone: (v) => (v > 50 ? "warn" : "ok"),
  },
];

function toneClass(t: "ok" | "warn" | "crit" | "neutral") {
  if (t === "ok") return "text-emerald-400";
  if (t === "warn") return "text-amber-400";
  if (t === "crit") return "text-red-400";
  return "text-foreground";
}

export function CommandCenterVitals({
  vitals,
  connected,
  posture,
  headline,
  onPostureClick,
}: {
  vitals: CommandVitals;
  connected: boolean;
  posture: MissionPosture;
  headline: string;
  onPostureClick?: (posture: MissionPosture) => void;
}) {
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex h-full flex-col border-b border-border/90">
      <div className="flex min-h-0 flex-1 items-stretch">
        <div className="flex w-[9.5rem] shrink-0 flex-col justify-center border-r border-border px-3">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            ARTSA · SOC
          </p>
          <p className="mt-0.5 font-mono text-[12px] font-semibold tracking-wide text-foreground">
            MISSION GRAPH
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={cn(
                "relative flex h-1.5 w-1.5",
                connected ? "text-emerald-400" : "text-amber-400"
              )}
            >
              {connected ? (
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40" />
              ) : null}
              <span
                className={cn(
                  "relative h-1.5 w-1.5 rounded-full",
                  connected ? "bg-emerald-400" : "bg-amber-400"
                )}
              />
            </span>
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-wider",
                connected ? "text-emerald-400" : "text-amber-400"
              )}
            >
              {connected ? "LIVE FEED" : "DEGRADED"}
            </span>
          </div>
          <p className="mt-1.5 font-mono text-[10px] tabular-nums text-zinc-600">
            {clock.toLocaleTimeString(undefined, { hour12: false })}
          </p>
        </div>

        <div className="grid min-w-0 flex-1 grid-cols-3 lg:grid-cols-6">
          {CELLS.map((c, i) => {
            const value = vitals[c.key];
            const tone = c.tone?.(value) ?? "neutral";
            return (
              <div
                key={c.key}
                className={cn(
                  "flex flex-col justify-center px-3 py-2 sm:px-4",
                  i < CELLS.length - 1 && "border-r border-border/70"
                )}
              >
                <p
                  className={cn(
                    "font-mono text-[21px] font-semibold tabular-nums leading-none tracking-tight",
                    toneClass(tone)
                  )}
                >
                  {c.fmt(value)}
                </p>
                <p className="mt-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                  {c.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onPostureClick?.(posture)}
        className={cn(
          "flex w-full items-center gap-3 border-t border-border/80 px-3 py-1.5 text-left transition-colors",
          posture === "critical" && "bg-red-500/10 hover:bg-red-500/15",
          posture === "elevated" && "bg-amber-500/10 hover:bg-amber-500/15",
          posture === "nominal" && "bg-emerald-500/[0.06] hover:bg-emerald-500/10",
          onPostureClick && "cursor-pointer"
        )}
        title="Filter blotter / graph by posture severity"
      >
        <span
          className={cn(
            "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider",
            posture === "critical" && "border-red-500/50 text-red-400",
            posture === "elevated" && "border-amber-500/50 text-amber-400",
            posture === "nominal" && "border-emerald-500/40 text-emerald-400"
          )}
        >
          {posture}
        </span>
        <p className="min-w-0 truncate font-mono text-[11px] text-foreground/80">{headline}</p>
        {onPostureClick ? (
          <span className="ml-auto shrink-0 font-mono text-[9px] uppercase text-zinc-600">
            filter sev
          </span>
        ) : null}
      </button>
    </div>
  );
}
