"use client";

import { SIX_AGENTS, type SixAgentName } from "@/lib/commandCenterOps";
import { cn } from "@/lib/utils";
import {
  DEFAULT_LATENCIES,
  type AgentLiveState,
  type LiveRound,
} from "./prototype/liveRounds";

function agentTone(state: AgentLiveState): string {
  if (state === "active") return "text-rose-600 dark:text-rose-400 font-medium";
  if (state === "responding") return "text-amber-600 dark:text-amber-400 font-medium";
  if (state === "contained") return "text-emerald-600 dark:text-emerald-400 font-medium";
  return "text-muted-foreground";
}

function agentDot(state: AgentLiveState): string {
  if (state === "active") return "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]";
  if (state === "responding") return "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]";
  if (state === "contained") return "bg-emerald-400";
  return "bg-slate-400 dark:bg-slate-500";
}

export function CommandCenterOpsSplit({
  round,
  logLines,
  className,
  onSelectAgent,
  onSelectLogLine,
}: {
  round: LiveRound;
  logLines: string[];
  className?: string;
  onSelectAgent?: (agent: SixAgentName) => void;
  onSelectLogLine?: (line: string) => void;
}) {
  const latencies = round.latencies ?? DEFAULT_LATENCIES;

  return (
    <div
      aria-label="Agent Monitors and Mission Log"
      className={cn(
        "rounded-xl border border-border bg-card/40 p-4 transition-colors",
        className
      )}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: Agent Monitors */}
        <div>
        <h3 className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3.5">
          AGENT MONITORS
        </h3>
        <ul className="space-y-2.5">
          {SIX_AGENTS.map((agent) => {
            const state = round.agents[agent] ?? "idle";
            const latency = latencies[agent];
            const displayName = agent === "Red Team" ? "Red team" : agent;

            return (
              <li
                key={agent}
                onClick={() => onSelectAgent?.(agent)}
                className="flex items-center justify-between text-[13px] py-0.5 rounded px-1 -mx-1 hover:bg-muted/30 transition-colors cursor-pointer"
                title={`Click to inspect ${displayName} telemetry`}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn("h-2 w-2 rounded-full shrink-0 transition-colors duration-300", agentDot(state))}
                  />
                  <span className="font-sans font-medium text-foreground">
                    {displayName}
                  </span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums">
                  <span className={cn("lowercase", agentTone(state))}>
                    {state}
                  </span>
                  {latency != null ? (
                    <span className="text-foreground/80 dark:text-slate-300 font-medium min-w-[36px] text-right">
                      {latency}ms
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Right: Mission Log */}
      <div>
        <h3 className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3.5">
          MISSION LOG
        </h3>
        <ul className="space-y-1.5">
          {logLines.map((line, idx) => (
            <li
              key={`${line}-${idx}`}
              onClick={() => onSelectLogLine?.(line)}
              className={cn(
                "font-mono text-[12px] leading-relaxed break-words rounded px-1 -mx-1 hover:bg-muted/30 transition-colors cursor-pointer",
                idx === 0
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              )}
              title="Click to inspect log event"
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
  );
}
