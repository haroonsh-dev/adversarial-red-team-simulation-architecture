"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  buildAttackFlowModel,
  type AttackFlowHop,
  type AttackFlowHopId,
  type AttackFlowStatus,
  HOP_ORDER,
} from "@/lib/redTeamAttackFlow";
import type { AttackPhaseId } from "@/lib/redTeamAttackPhase";
import type { TranscriptTurn } from "@/lib/campaignTranscript";
import { LiveIndicator } from "@/components/shared/LiveIndicator";

const VIEW_W = 1000;
const VIEW_H = 200;
const NODE_Y = 72;
const NODE_W = 118;
const NODE_H = 72;

const NODE_X: Record<AttackFlowHopId, number> = {
  research: 28,
  curator: 188,
  redteam: 348,
  target: 508,
  judge: 668,
  defender: 828,
};

const STROKE: Record<AttackFlowStatus, string> = {
  pending: "#454545",
  active: "#67b3ef",
  done: "#4ade80",
  blocked: "#fbbf24",
  breached: "#f87171",
};

const FILL: Record<AttackFlowStatus, string> = {
  pending: "hsl(var(--background))",
  active: "hsl(var(--brand-subtle))",
  done: "hsl(var(--status-success-subtle))",
  blocked: "hsl(var(--status-warning-subtle))",
  breached: "hsl(var(--status-error-subtle))",
};

interface RedTeamAttackFlowGraphProps {
  phase: AttackPhaseId;
  isRunning: boolean;
  turn: TranscriptTurn | null;
  roundsCompleted: number;
  maxRounds: number;
  targetLabel?: string | null;
  progressPct?: number;
  onSelectHop?: (hopId: AttackFlowHopId) => void;
  selectedHopId?: AttackFlowHopId | null;
  className?: string;
}

function statusLabel(s: AttackFlowStatus): string {
  switch (s) {
    case "active":
      return "ACTIVE";
    case "done":
      return "DONE";
    case "blocked":
      return "BLOCKED";
    case "breached":
      return "BREACHED";
    default:
      return "PENDING";
  }
}

function HopNode({
  hop,
  selected,
  onSelect,
}: {
  hop: AttackFlowHop;
  selected: boolean;
  onSelect?: () => void;
}) {
  const x = NODE_X[hop.id];
  const stroke = STROKE[hop.status];
  const fill = FILL[hop.status];

  return (
    <g
      transform={`translate(${x}, ${NODE_Y})`}
      className={onSelect ? "cursor-pointer" : undefined}
      onClick={onSelect}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={
        onSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect();
              }
            }
          : undefined
      }
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        fill={fill}
        stroke={stroke}
        strokeWidth={selected || hop.status === "active" ? 2 : 1.25}
      />
      {hop.status === "active" ? (
        <circle cx={NODE_W - 12} cy={12} r={4} fill={stroke} className="animate-pulse" />
      ) : null}
      <text
        x={10}
        y={22}
        className="fill-[#7c7c7c]"
        style={{ fontSize: 9, fontFamily: "ui-monospace, monospace", letterSpacing: "0.06em" }}
      >
        {statusLabel(hop.status)}
      </text>
      <text
        x={10}
        y={42}
        className="fill-white"
        style={{ fontSize: 13, fontWeight: 600, fontFamily: "system-ui, sans-serif" }}
      >
        {hop.label}
      </text>
      <text
        x={10}
        y={58}
        className="fill-[#a7a7a7]"
        style={{ fontSize: 9, fontFamily: "system-ui, sans-serif" }}
      >
        {hop.detail.length > 28 ? `${hop.detail.slice(0, 28)}…` : hop.detail}
      </text>
    </g>
  );
}

/**
 * Single engagement attack-flow graph — Research → … → Defender.
 * Lit only from live phase + transcript; provenance badge always visible.
 */
export function RedTeamAttackFlowGraph({
  phase,
  isRunning,
  turn,
  roundsCompleted,
  maxRounds,
  targetLabel,
  progressPct,
  onSelectHop,
  selectedHopId,
  className,
}: RedTeamAttackFlowGraphProps) {
  const model = useMemo(
    () =>
      buildAttackFlowModel({
        phase,
        isRunning,
        turn,
        roundsCompleted,
        maxRounds,
      }),
    [phase, isRunning, turn, roundsCompleted, maxRounds]
  );

  const edgeByKey = useMemo(() => {
    const map = new Map<string, (typeof model.edges)[0]>();
    for (const e of model.edges) map.set(`${e.from}->${e.to}`, e);
    return map;
  }, [model.edges]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#67b3ef]">
            Attack flow
          </p>
          {isRunning ? <LiveIndicator connected label="Live" className="meta-badge" /> : null}
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
            {model.sourceLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
          {targetLabel ? <span className="truncate max-w-[160px]">{targetLabel}</span> : null}
          {typeof progressPct === "number" && isRunning ? (
            <span>{progressPct}%</span>
          ) : null}
          <span>
            {roundsCompleted}/{maxRounds || "—"} rounds
          </span>
        </div>
      </div>

      <div className="overflow-x-auto px-2 py-3">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mx-auto h-[180px] w-full min-w-[720px]"
          role="img"
          aria-label="Red team attack flow graph"
        >
          {HOP_ORDER.slice(0, -1).map((from, i) => {
            const to = HOP_ORDER[i + 1]!;
            const edge = edgeByKey.get(`${from}->${to}`);
            const status = edge?.status ?? "pending";
            const x1 = NODE_X[from] + NODE_W;
            const x2 = NODE_X[to];
            const y = NODE_Y + NODE_H / 2;
            const mid = (x1 + x2) / 2;
            return (
              <g key={`${from}-${to}`}>
                <line
                  x1={x1}
                  y1={y}
                  x2={x2}
                  y2={y}
                  stroke={STROKE[status]}
                  strokeWidth={status === "active" ? 2 : 1.5}
                  strokeDasharray={status === "pending" ? "4 4" : undefined}
                  opacity={status === "pending" ? 0.55 : 1}
                />
                <polygon
                  points={`${x2 - 1},${y} ${x2 - 8},${y - 4} ${x2 - 8},${y + 4}`}
                  fill={STROKE[status]}
                  opacity={status === "pending" ? 0.55 : 1}
                />
                <text
                  x={mid}
                  y={y - 8}
                  textAnchor="middle"
                  className="fill-[#7c7c7c]"
                  style={{ fontSize: 9, fontFamily: "ui-monospace, monospace" }}
                >
                  {edge?.label ?? ""}
                </text>
              </g>
            );
          })}

          {model.hops.map((hop) => (
            <HopNode
              key={hop.id}
              hop={hop}
              selected={selectedHopId === hop.id || model.activeHopId === hop.id}
              onSelect={onSelectHop ? () => onSelectHop(hop.id) : undefined}
            />
          ))}
        </svg>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border px-3 py-2 font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#67b3ef]" /> Active
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" /> Done
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24]" /> Blocked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#f87171]" /> Breached
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" /> Pending
        </span>
      </div>
    </div>
  );
}
