"use client";

import { useState } from "react";
import { Activity, Network, Shield, ShieldAlert, TrendingUp } from "lucide-react";
import { CockpitCard } from "../cockpit/CockpitCard";
import { ResearchChart } from "../prototype/ResearchChart";
import { cn } from "@/lib/utils";
import type { DetectionPoint, ChartAnnotation } from "../prototype/model";

type ViewMode = "lattice" | "research";

export function AdversarialSurface({
  series,
  annotations,
  highlightPlaybook,
  lastLift,
  liftPp,
  baseline,
  activeTargetName = "CustomerSupportAgent-v2",
  onSelectNode,
}: {
  series: DetectionPoint[];
  annotations: ChartAnnotation[];
  highlightPlaybook: string | null;
  lastLift: number;
  liftPp: number;
  baseline: number;
  activeTargetName?: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const [mode, setMode] = useState<ViewMode>("lattice");

  return (
    <CockpitCard className="h-full">
      {/* Surface Header & View Switcher */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border-default)] px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-text-muted)]">
            Adversarial Surface
          </span>
          <div className="h-3 w-px bg-[var(--cc-border-emphasis)]" />
          <span className="font-mono text-[11px] text-[var(--cc-primary)]">
            {activeTargetName}
          </span>
        </div>

        {/* Segmented View Mode Switcher */}
        <div className="flex items-center gap-1 rounded-md border border-[var(--cc-border-default)] bg-[var(--cc-bg-surface-3)] p-0.5">
          <button
            type="button"
            onClick={() => setMode("lattice")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-0.5 font-mono text-[10px] font-medium transition-colors",
              mode === "lattice"
                ? "bg-[var(--cc-bg-surface-1)] text-[var(--cc-text-primary)] shadow-sm"
                : "text-[var(--cc-text-muted)] hover:text-[var(--cc-text-primary)]"
            )}
          >
            <Network className="h-3 w-3" />
            Attack Lattice
          </button>
          <button
            type="button"
            onClick={() => setMode("research")}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-0.5 font-mono text-[10px] font-medium transition-colors",
              mode === "research"
                ? "bg-[var(--cc-bg-surface-1)] text-[var(--cc-text-primary)] shadow-sm"
                : "text-[var(--cc-text-muted)] hover:text-[var(--cc-text-primary)]"
            )}
          >
            <TrendingUp className="h-3 w-3" />
            Adaptive Lift Curve
          </button>
        </div>
      </div>

      {/* Main Canvas Body */}
      <div className="relative flex min-h-0 flex-1 flex-col p-3 overflow-hidden">
        {mode === "lattice" ? (
          /* Mode A: Target Attack Lattice (Interactive DAG) */
          <div className="relative flex flex-1 flex-col justify-between items-center w-full min-h-[360px] rounded border border-[var(--cc-border-subtle)] bg-[var(--cc-bg-surface-2)] p-4">
            {/* Layer 1: Ingress Layer */}
            <div className="w-full flex justify-between items-center max-w-[500px]">
              <div
                onClick={() => onSelectNode("recon_ingress")}
                className="cursor-pointer rounded border border-[var(--cc-border-default)] bg-[var(--cc-bg-surface-1)] p-2.5 hover:border-[var(--cc-primary)]/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span className="font-mono text-[11px] font-medium text-[var(--cc-text-primary)]">
                    External Ingress (REST / WS)
                  </span>
                </div>
                <p className="mt-0.5 font-mono text-[9px] text-[var(--cc-text-dim)]">
                  Rate: 24 req/s · HMAC Verified
                </p>
              </div>

              <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-mono text-amber-500 font-semibold">
                PROBE ACTIVE
              </div>
            </div>

            {/* SVG Connecting Flow Lines */}
            <div className="w-full flex justify-center py-2">
              <svg width="240" height="40" className="overflow-visible">
                <line
                  x1="120"
                  y1="0"
                  x2="120"
                  y2="40"
                  stroke="var(--cc-border-emphasis)"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <circle cx="120" cy="20" r="3" fill="var(--cc-primary)" />
              </svg>
            </div>

            {/* Layer 2: Inspection Boundary & Guardrail */}
            <div
              onClick={() => onSelectNode("guardrail_perimeter")}
              className="cursor-pointer w-full max-w-[500px] rounded-lg border border-purple-500/30 bg-purple-500/10 p-3 hover:border-purple-500/60 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-400" />
                  <span className="font-mono text-[11px] font-bold text-purple-400">
                    PERIMETER GUARDRAILS & CONTENT FILTERS
                  </span>
                </div>
                <span className="rounded bg-purple-500/20 px-2 py-0.5 font-mono text-[9px] text-purple-400 font-semibold">
                  BLOCK RATIO: 96.2%
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[10px] text-[var(--cc-text-muted)] border-t border-purple-500/20 pt-1.5">
                <span>Prompt Injection: <span className="text-emerald-500 font-semibold">BLOCKED</span></span>
                <span>Canary Leaks: <span className="text-emerald-500 font-semibold">TRAPPED</span></span>
                <span>SSRF Evasion: <span className="text-amber-500 font-semibold">MONITORED</span></span>
              </div>
            </div>

            {/* SVG Connecting Flow Lines */}
            <div className="w-full flex justify-center py-2">
              <svg width="240" height="40" className="overflow-visible">
                <line
                  x1="120"
                  y1="0"
                  x2="60"
                  y2="40"
                  stroke="var(--cc-border-emphasis)"
                  strokeWidth="1.5"
                />
                <line
                  x1="120"
                  y1="0"
                  x2="180"
                  y2="40"
                  stroke="#EF4444"
                  strokeWidth="2"
                />
                <circle cx="180" cy="20" r="3" fill="#EF4444" />
              </svg>
            </div>

            {/* Layer 3: Core Target Agent & Downstream Tools */}
            <div className="w-full flex justify-between items-center gap-4 max-w-[560px]">
              {/* Tool Execution Sandbox */}
              <div
                onClick={() => onSelectNode("tool_sandbox")}
                className="cursor-pointer flex-1 rounded border border-[var(--cc-border-default)] bg-[var(--cc-bg-surface-1)] p-2.5 hover:border-[var(--cc-border-emphasis)] transition-colors"
              >
                <div className="font-mono text-[11px] font-medium text-[var(--cc-text-primary)]">
                  Tool Sandbox (Python/Bash)
                </div>
                <p className="mt-1 font-mono text-[9px] text-[var(--cc-text-muted)]">
                  Isolation: Isolated Pod · Egress: Denied
                </p>
              </div>

              {/* Core LLM Target Node */}
              <div
                onClick={() => onSelectNode("core_llm")}
                className="cursor-pointer flex-1 rounded-lg border border-red-500/60 bg-red-500/10 p-3 shadow-[0_0_15px_rgba(239,68,68,0.15)] hover:border-red-500 transition-colors"
              >
                <div className="flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4 text-red-400" />
                  <span className="font-mono text-[11px] font-bold text-red-400">
                    CORE LLM TARGET
                  </span>
                </div>
                <p className="mt-1 font-mono text-[10px] text-red-400/90">
                  Active Adversarial Pressure: Round 4
                </p>
                <span className="mt-1 inline-block rounded bg-red-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-red-400">
                  BREACH DETECTED (ASI-01)
                </span>
              </div>

              {/* RAG Memory DB */}
              <div
                onClick={() => onSelectNode("memory_db")}
                className="cursor-pointer flex-1 rounded border border-[var(--cc-border-default)] bg-[var(--cc-bg-surface-1)] p-2.5 hover:border-[var(--cc-border-emphasis)] transition-colors"
              >
                <div className="font-mono text-[11px] font-medium text-[var(--cc-text-primary)]">
                  Memory Store (Vector / Chroma)
                </div>
                <p className="mt-1 font-mono text-[9px] text-[var(--cc-text-muted)]">
                  Integrity: Read-Only · Poisoning: None
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Mode B: Research Lift Curve */
          <div className="flex h-full min-h-[360px] flex-1 flex-col">
            <div className="mb-2 flex shrink-0 items-center justify-between border-b border-[var(--cc-border-subtle)] pb-2">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--cc-text-muted)]">
                  Detection Efficacy · ARTSA vs Static Control (62%)
                </p>
                <p className="font-mono text-[11px] text-[var(--cc-text-dim)]">
                  Rounds progression across 10 simulation iterations
                </p>
              </div>
              <div className="flex items-baseline gap-2 font-mono">
                <span className="text-[20px] font-bold text-[var(--cc-primary)]">
                  {liftPp >= 0 ? "+" : ""}{liftPp}pp
                </span>
                <span className="text-[11px] text-[var(--cc-text-muted)]">
                  (ARTSA {lastLift}% vs {baseline}%)
                </span>
              </div>
            </div>
            <div className="relative flex-1 w-full h-full min-h-[320px]">
              <ResearchChart
                series={series}
                annotations={annotations}
                highlightPlaybook={highlightPlaybook}
              />
            </div>
          </div>
        )}
      </div>
    </CockpitCard>
  );
}
