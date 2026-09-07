"use client";

import { useMemo } from "react";
import { ArrowRight, ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SixAgentName } from "@/lib/commandCenterOps";
import type { AgentLiveState, LiveRound } from "../prototype/liveRounds";

export type EdgeState = "normal" | "suspicious" | "blocked" | "contained";

function normalizeAgentName(raw: string): SixAgentName {
  const s = raw.toLowerCase().replace(/[\s_-]+/g, "");
  if (s.includes("research")) return "Research";
  if (s.includes("curator")) return "Curator";
  if (s.includes("red")) return "Red Team";
  if (s.includes("judge")) return "Judge";
  if (s.includes("defend")) return "Defender";
  return "Target";
}

export function CommandCenterInteractionMap({
  round,
  onSelectAgent,
  onSelectEdge,
  className,
}: {
  round: LiveRound;
  onSelectAgent?: (agent: SixAgentName) => void;
  onSelectEdge?: (from: string, to: string) => void;
  className?: string;
}) {
  const activeFrom = useMemo(() => normalizeAgentName(round.from), [round.from]);
  const activeTo = useMemo(() => normalizeAgentName(round.to), [round.to]);

  const isFailed =
    round.badgeTone === "error" ||
    round.bars.some((b) => b.code === "HMAC" || b.label.includes("fail"));

  const isSuspicious = round.bars.some((b) => b.pct >= 60);
  const isContained = round.verdicts.some((v) => v.tone === "ok" && v.detail.toLowerCase().includes("contain"));

  const activeEdgeState: EdgeState = isFailed
    ? "blocked"
    : isContained
      ? "contained"
      : isSuspicious
        ? "suspicious"
        : "normal";

  function getAgentNode(name: SixAgentName) {
    const state: AgentLiveState = round.agents[name] ?? "idle";
    const isActive = activeFrom === name || activeTo === name;
    const latency = round.latencies?.[name];

    const stateTone =
      state === "active"
        ? "text-rose-500 border-rose-500/40 bg-rose-500/10"
        : state === "responding"
          ? "text-amber-500 border-amber-500/40 bg-amber-500/10"
          : state === "contained"
            ? "text-emerald-500 border-emerald-500/40 bg-emerald-500/10"
            : "text-muted-foreground border-border bg-card";

    const dotTone =
      state === "active"
        ? "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]"
        : state === "responding"
          ? "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)]"
          : state === "contained"
            ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]"
            : "bg-slate-400 dark:bg-slate-600";

    return (
      <button
        key={name}
        type="button"
        onClick={() => onSelectAgent?.(name)}
        className={cn(
          "group relative flex flex-col items-center justify-between rounded-lg border px-2.5 py-1.5 text-center transition-all duration-200 cursor-pointer min-w-[110px]",
          isActive
            ? "border-sky-500/80 shadow-[0_0_12px_rgba(56,189,248,0.2)] bg-sky-500/5 ring-1 ring-sky-400/50"
            : stateTone
        )}
        title={`Inspect ${name} (${state})`}
        aria-label={`Inspect ${name} (${state})`}
      >
        <div className="flex items-center gap-1.5 w-full justify-between">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotTone)} />
          <span className="font-sans text-[11px] font-semibold text-foreground tracking-tight truncate">
            {name} Agent
          </span>
          {latency ? (
            <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
              {latency}ms
            </span>
          ) : (
            <span className="w-1.5" />
          )}
        </div>

        <div className="mt-1 flex items-center justify-between w-full font-mono text-[10px]">
          <span className="capitalize text-muted-foreground">{state}</span>
          {isActive ? (
            <span className="text-[9px] font-semibold uppercase text-sky-400">
              {activeFrom === name ? "TX" : "RX"}
            </span>
          ) : null}
        </div>
      </button>
    );
  }

  function getEdgeConnector(
    from: SixAgentName,
    to: SixAgentName,
    direction: "horizontal" | "vertical-down" | "vertical-up" = "horizontal"
  ) {
    const isThisActive = activeFrom === from && activeTo === to;
    const edgeColor = !isThisActive
      ? "text-muted-foreground/30 border-muted-foreground/20"
      : activeEdgeState === "blocked"
        ? "text-rose-500 border-rose-500/80 animate-pulse"
        : activeEdgeState === "contained"
          ? "text-emerald-500 border-emerald-500/80"
          : activeEdgeState === "suspicious"
            ? "text-amber-500 border-amber-500/80"
            : "text-sky-400 border-sky-400/80";

    return (
      <button
        type="button"
        onClick={() => onSelectEdge?.(from, to)}
        className={cn(
          "flex items-center justify-center p-1 rounded transition-colors group cursor-pointer",
          isThisActive ? "bg-muted/40" : "hover:bg-muted/20"
        )}
        title={`Inspect interaction: ${from} → ${to} (${isThisActive ? activeEdgeState : "idle"})`}
      >
        {direction === "horizontal" ? (
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "h-px w-5 border-t border-dashed transition-colors",
                edgeColor
              )}
            />
            <ArrowRight className={cn("h-3 w-3", edgeColor)} />
          </div>
        ) : direction === "vertical-down" ? (
          <div className="flex flex-col items-center gap-0.5">
            <span
              className={cn(
                "w-px h-4 border-l border-dashed transition-colors",
                edgeColor
              )}
            />
            <ArrowDown className={cn("h-3 w-3", edgeColor)} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <ArrowUp className={cn("h-3 w-3", edgeColor)} />
            <span
              className={cn(
                "w-px h-4 border-l border-dashed transition-colors",
                edgeColor
              )}
            />
          </div>
        )}
      </button>
    );
  }

  return (
    <div
      aria-label="Agent Interaction Map"
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card/50 p-3 sm:p-3.5 transition-colors",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          TACTICAL AGENT INTERACTION MAP
        </span>
        <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Active Hop:
            <span className="text-foreground font-semibold">
              {round.from} → {round.to}
            </span>
          </span>
          <span className="text-border">·</span>
          <span
            className={cn(
              "uppercase font-semibold px-1.5 py-0.2 rounded border",
              activeEdgeState === "blocked"
                ? "border-rose-500/40 text-rose-500 bg-rose-500/10"
                : activeEdgeState === "contained"
                  ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10"
                  : activeEdgeState === "suspicious"
                    ? "border-amber-500/40 text-amber-500 bg-amber-500/10"
                    : "border-sky-500/40 text-sky-400 bg-sky-500/10"
            )}
          >
            {activeEdgeState}
          </span>
        </div>
      </div>

      {/* Security Zones Container */}
      <div className="flex flex-col gap-1.5 py-0.5 w-full">
        {/* Zone 1: ADVERSARY ZONE */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.02] p-2 relative">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-rose-600 dark:text-rose-400 flex items-center gap-1.5 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.7)]" />
              ADVERSARY ZONE · OFFENSIVE
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">3 AGENTS</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            {getAgentNode("Research")}
            {getEdgeConnector("Research", "Curator", "horizontal")}
            {getAgentNode("Curator")}
            {getEdgeConnector("Curator", "Red Team", "horizontal")}
            {getAgentNode("Red Team")}
          </div>
        </div>

        {/* Transition: Red Team to Target */}
        <div className="flex justify-end pr-12 items-center gap-2 -my-0.5">
          {activeFrom === "Red Team" && activeTo === "Target" && activeEdgeState === "blocked" && (
            <span className="font-mono text-[9px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded animate-pulse">
              HMAC INVALID // PACKET DROPPED
            </span>
          )}
          {getEdgeConnector("Red Team", "Target", "vertical-down")}
        </div>

        {/* Zone 2: TARGET SANDBOX */}
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/[0.02] p-2 relative flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-sky-600 dark:text-sky-400 flex items-center gap-1.5 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.7)]" />
              TARGET SANDBOX · ISOLATED RUNTIME
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">EVALUATED STACK</span>
          </div>
          <div className="w-full max-w-[200px]">
            {getAgentNode("Target")}
          </div>
        </div>

        {/* Transition: Target to Governance */}
        <div className="flex justify-around px-16 items-center -my-0.5">
          {getEdgeConnector("Target", "Judge", "vertical-down")}
          {getEdgeConnector("Defender", "Target", "vertical-up")}
        </div>

        {/* Zone 3: EVALUATION & GOVERNANCE */}
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.02] p-2 relative">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]" />
              EVALUATION & GOVERNANCE · POLICY ENGINE
            </span>
            <span className="text-[9px] font-mono text-muted-foreground">DUAL ARBITRATION</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 w-full">
            {getAgentNode("Judge")}
            {getEdgeConnector("Judge", "Defender", "horizontal")}
            {getAgentNode("Defender")}
          </div>
        </div>
      </div>

      {/* Edge State Legend */}
      <div className="mt-2 flex flex-wrap items-center justify-between border-t border-border/70 pt-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
        <span>INTERACTION EDGE STATES:</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Normal
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Suspicious
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Blocked
          </span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Contained
          </span>
        </div>
      </div>
    </div>
  );
}
