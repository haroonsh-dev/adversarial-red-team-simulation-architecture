"use client";

import { useEffect, useState } from "react";
import { SIX_AGENTS } from "@/lib/commandCenterOps";
import { cn } from "@/lib/utils";
import { BarGauge } from "./atoms";
import {
  LIVE_ROUNDS,
  LIVE_ROUND_MS,
  highlightPrompt,
  logWindow,
  nextRoundIndex,
  type AgentLiveState,
} from "./liveRounds";

function agentTone(state: AgentLiveState): string {
  if (state === "active") return "text-[hsl(var(--status-error))]";
  if (state === "responding") return "text-[hsl(var(--status-warning))]";
  if (state === "contained") return "text-emerald-500";
  return "text-muted-foreground";
}

function agentDot(state: AgentLiveState): string {
  if (state === "active") return "bg-[hsl(var(--status-error))]";
  if (state === "responding") return "bg-[hsl(var(--status-warning))]";
  if (state === "contained") return "bg-emerald-400";
  return "bg-muted-foreground/50";
}

export function LiveFeed() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => nextRoundIndex(i, LIVE_ROUNDS.length));
    }, LIVE_ROUND_MS);
    return () => window.clearInterval(id);
  }, []);

  const round = LIVE_ROUNDS[index] ?? LIVE_ROUNDS[0];
  if (!round) return null;
  const spans = highlightPrompt(round.prompt, round.highlights);
  const lines = logWindow(LIVE_ROUNDS, index, 4);

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3">
        <p className="min-w-0 truncate font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          Live prompt analysis · {round.from} → {round.to}
        </p>
        <span className="shrink-0 rounded-full bg-[hsl(var(--status-error))]/15 px-2 py-0.5 font-mono text-[10px] uppercase text-[hsl(var(--status-error))]">
          round {round.round} · live
        </span>
      </div>

      <div className="shrink-0 px-3 py-2">
        <p className="font-mono text-[12px] leading-relaxed text-foreground">
          {spans.map((s, i) => (
            <mark
              key={`${i}-${s.text.slice(0, 12)}`}
              className={cn(
                "bg-transparent text-inherit",
                s.tone === "inject" && "bg-[hsl(var(--status-error))]/25 text-[hsl(var(--status-error))]",
                s.tone === "tool" && "bg-[hsl(var(--status-warning))]/25 text-[hsl(var(--status-warning))]"
              )}
            >
              {s.text}
            </mark>
          ))}
        </p>
        <ul className="mt-3 space-y-2">
          {round.bars.map((b) => (
            <li key={b.code} className="grid grid-cols-[88px_1fr_32px] items-center gap-2">
              <span className="font-mono text-[10px] uppercase text-muted-foreground">
                {b.code} {b.label}
              </span>
              <BarGauge pct={b.pct} tone={b.tone} />
              <span className="text-right font-mono text-[11px] tabular-nums">{b.pct}%</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden border-t border-border">
        <section className="min-h-0 overflow-y-auto border-r border-border [scrollbar-width:thin]">
          <p className="px-3 pt-2 font-mono text-[10px] uppercase text-muted-foreground">Agent monitors</p>
          <ul className="px-3 pb-2 pt-1">
            {SIX_AGENTS.map((name) => {
              const state = round.agents[name];
              return (
                <li key={name} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex items-center gap-2 text-[12px]">
                    <span className={cn("h-1.5 w-1.5 rounded-full", agentDot(state))} />
                    {name}
                  </span>
                  <span className={cn("font-mono text-[10px] uppercase", agentTone(state))}>{state}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="min-h-0 overflow-y-auto [scrollbar-width:thin]">
          <p className="px-3 pt-2 font-mono text-[10px] uppercase text-muted-foreground">Mission log</p>
          <ul className="px-3 pb-2 pt-1">
            {lines.map((line, i) => (
              <li
                key={`${line}-${i}`}
                className={cn(
                  "font-mono text-[11px] leading-5",
                  i === 0 ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {line}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  );
}
