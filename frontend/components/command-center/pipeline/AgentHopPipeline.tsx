"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { CockpitCard } from "../cockpit/CockpitCard";
import { cn } from "@/lib/utils";
import type { AgentHop } from "../prototype/model";
import { SIX_AGENTS, type SixAgentName } from "@/lib/commandCenterOps";

const STAGE_LABELS: Record<string, string> = {
  Reconnaissance: "STAGE 01 · PROBE",
  Infiltrator: "STAGE 02 · BYPASS",
  Exploitation: "STAGE 03 · INJECT",
  "Lateral Pivot": "STAGE 04 · HOP",
  Exfiltration: "STAGE 05 · EXFIL",
  Cleanup: "STAGE 06 · SCRUB",
};

export function AgentHopPipeline({
  hops,
  activeAgent,
  onSelectAgent,
  onOpenInspect,
}: {
  hops: AgentHop[];
  activeAgent: string;
  onSelectAgent: (agent: string) => void;
  onOpenInspect: (kind: "hop" | "asi", id: string) => void;
}) {
  return (
    <CockpitCard className="h-full">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border-default)] px-3 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-text-muted)]">
          Adversarial Hop Pipeline
        </span>
        <span className="font-mono text-[10px] text-[var(--cc-text-dim)]">6 Stages</span>
      </div>

      {/* 6-Hop Progression List */}
      <ol className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2 space-y-1.5 [scrollbar-width:thin]">
        {hops.map((hop, idx) => {
          const next = SIX_AGENTS[idx + 1];
          const isSelected = activeAgent === hop.agent;
          const stageLabel = STAGE_LABELS[hop.agent] ?? `STAGE 0${idx + 1}`;
          const isBreach = hop.hmacState === "fail";
          const isSlow = hop.latencyMs > 50;

          return (
            <li key={hop.agent} className="relative">
              <button
                type="button"
                onClick={() => {
                  onSelectAgent(isSelected ? "all" : hop.agent);
                  onOpenInspect("hop", hop.agent);
                }}
                className={cn(
                  "group flex w-full flex-col rounded-md border p-2 text-left transition-all duration-150",
                  isSelected
                    ? "border-[var(--cc-primary)] bg-[var(--cc-primary-subtle)] shadow-[inset_0_0_12px_rgba(0,210,255,0.08)]"
                    : isBreach
                      ? "border-red-500/50 bg-red-500/10 hover:bg-red-500/15"
                      : "border-[var(--cc-border-subtle)] bg-[var(--cc-bg-surface-3)]/40 hover:border-[var(--cc-border-emphasis)] hover:bg-[var(--cc-bg-surface-hover)]"
                )}
              >
                {/* Node Title & Stage */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {isBreach ? (
                      <ShieldAlert className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    ) : isSlow ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    )}
                    <span className="font-mono text-[12px] font-medium text-[var(--cc-text-primary)] group-hover:text-[var(--cc-text-primary)]">
                      {hop.agent}
                    </span>
                  </div>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-[var(--cc-text-dim)]">
                    {stageLabel}
                  </span>
                </div>

                {/* Metrics & HMAC Verification */}
                <div className="mt-1.5 flex items-center justify-between border-t border-[var(--cc-border-subtle)] pt-1 font-mono text-[10px]">
                  <span
                    className={cn(
                      "tabular-nums",
                      isSlow ? "text-amber-500 font-semibold" : "text-[var(--cc-text-muted)]"
                    )}
                  >
                    {hop.latencyMs}ms{" "}
                    <span className="text-[var(--cc-text-dim)] text-[9px]">/ 50ms</span>
                  </span>
                  <span
                    className={cn(
                      "uppercase text-[9px] font-semibold",
                      hop.hmacState === "ok"
                        ? "text-emerald-500"
                        : hop.hmacState === "fail"
                          ? "text-red-500"
                          : "text-[var(--cc-text-dim)]"
                    )}
                  >
                    HMAC: {hop.hmacState === "ok" ? "VALID" : hop.hmacState.toUpperCase()}
                  </span>
                </div>
              </button>

              {/* Hop connector to next agent */}
              {next ? (
                <div className="flex justify-center my-0.5">
                  <span className="h-2 w-px bg-[var(--cc-border-emphasis)] cc-hop-flow" />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Pinned ASI-08 Circuit Breaker Status Tile */}
      <div className="shrink-0 border-t border-[var(--cc-border-default)] p-2 bg-[var(--cc-bg-surface-2)]">
        <button
          type="button"
          onClick={() => onOpenInspect("asi", "ASI08")}
          className="flex w-full items-center justify-between rounded border border-red-500/40 bg-red-500/10 px-2.5 py-2 text-left transition-colors hover:bg-red-500/15"
          title="Inspect ASI-08 Automated Safeguard & Circuit Breaker"
        >
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-red-500">
              ASI-08 CIRCUIT BREAKER
            </span>
          </div>
          <span className="font-mono text-[9px] font-bold text-red-500 rounded border border-red-500/50 bg-red-500/20 px-1.5 py-0.5">
            ARMED
          </span>
        </button>
      </div>
    </CockpitCard>
  );
}
