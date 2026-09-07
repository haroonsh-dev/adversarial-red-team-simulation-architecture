"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  PIPELINE_AGENTS,
  statusLabel,
  type AgentOperationalStatus,
  type PipelineAgentId,
} from "@/lib/agentRoles";
import type { PipelineSnapshot } from "@/lib/pipelineState";
import { CHAIN_HOPS, hopFromAgent } from "@/lib/pipelineChain";

/** Horizontal chain layout — reads left→right like an enterprise orchestration DAG. */
const VIEW_W = 1000;
const VIEW_H = 320;
const NODE_Y = 118;
const NODE_W = 108;
const NODE_H = 78;

const NODE_X: Record<PipelineAgentId, number> = {
  research: 36,
  curator: 196,
  redteam: 356,
  target: 516,
  judge: 676,
  defender: 836,
};

const STATUS_STROKE: Record<AgentOperationalStatus, string> = {
  online: "#4ade80",
  active: "#67b3ef",
  degraded: "hsl(var(--severity-high))",
  offline: "#454545",
};

interface AgentPipelineDAGProps {
  snapshot: PipelineSnapshot;
  selectedId: PipelineAgentId | null;
  onSelect: (id: PipelineAgentId) => void;
  animatePacket?: boolean;
  className?: string;
}

function curvedHandoff(
  fromId: PipelineAgentId,
  toId: PipelineAgentId,
  loop = false
): string {
  const a = NODE_X[fromId] + NODE_W;
  const b = NODE_X[toId];
  const y = NODE_Y + NODE_H / 2;
  if (loop) {
    // Defender → Research feedback arc under the chain
    const x1 = NODE_X.defender + NODE_W / 2;
    const x2 = NODE_X.research + NODE_W / 2;
    return `M ${x1} ${NODE_Y + NODE_H + 4} C ${x1} ${VIEW_H - 36}, ${x2} ${VIEW_H - 36}, ${x2} ${NODE_Y + NODE_H + 4}`;
  }
  const mx = (a + b) / 2;
  const my = y - 28;
  return `M ${a} ${y} Q ${mx} ${my} ${b} ${y}`;
}

export function AgentPipelineDAG({
  snapshot,
  selectedId,
  onSelect,
  animatePacket = true,
  className,
}: AgentPipelineDAGProps) {
  const [packetStep, setPacketStep] = useState(0);

  const agentStatusById = useMemo(
    () =>
      Object.fromEntries(snapshot.agents.map((a) => [a.id, a.status])) as Record<
        PipelineAgentId,
        AgentOperationalStatus
      >,
    [snapshot.agents]
  );

  const activeEdgeIndex = useMemo(() => {
    if (!snapshot.activeAgentId) return -1;
    return PIPELINE_AGENTS.findIndex((a) => a.id === snapshot.activeAgentId);
  }, [snapshot.activeAgentId]);

  useEffect(() => {
    if (!animatePacket || !snapshot.activeAgentId) return;
    setPacketStep(Math.max(0, activeEdgeIndex));
    const id = window.setInterval(() => {
      setPacketStep((s) => (s + 1) % PIPELINE_AGENTS.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [animatePacket, snapshot.activeAgentId, activeEdgeIndex]);

  const livePacket = animatePacket && Boolean(snapshot.activeAgentId);
  const packetHop = CHAIN_HOPS[packetStep] ?? CHAIN_HOPS[0]!;
  const packetPath =
    packetHop.from === "defender"
      ? curvedHandoff("defender", "research", true)
      : curvedHandoff(packetHop.from, packetHop.to);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[8px] border border-border bg-background",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage: "radial-gradient(ellipse 75% 65% at 50% 45%, black, transparent)",
        }}
        aria-hidden
      />

      {/* HUD */}
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-border/80 px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="text-[#67b3ef]">Agent chain</span>
          <span className="text-muted-foreground">|</span>
          <span>
            hops <span className="text-foreground">6</span>
          </span>
          <span>
            active{" "}
            <span className="text-foreground">
              {snapshot.activeAgentId
                ? hopFromAgent(snapshot.activeAgentId).edgeTag
                : "—"}
            </span>
          </span>
          <span>
            loop{" "}
            <span className={snapshot.loopClosed ? "text-[#4ade80]" : "text-muted-foreground"}>
              {snapshot.loopClosed ? "closed" : "open"}
            </span>
          </span>
        </div>
        <p className="font-mono text-[9px] text-muted-foreground">RESEARCH → DEFENDER ↺</p>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="relative z-10 h-auto w-full min-h-[280px]"
        role="img"
        aria-label="Multi-agent closed-loop chain"
        onClick={() => onSelect(selectedId ?? "research")}
      >
        <defs>
          <marker
            id="chain-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#454545" />
          </marker>
          <marker
            id="chain-arrow-hot"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#67b3ef" />
          </marker>
        </defs>

        {/* Stage lane */}
        <line
          x1={20}
          y1={NODE_Y + NODE_H / 2}
          x2={VIEW_W - 20}
          y2={NODE_Y + NODE_H / 2}
          stroke="hsl(var(--muted))"
          strokeWidth={24}
          strokeLinecap="round"
        />

        {CHAIN_HOPS.map((hop, i) => {
          const isLoop = hop.from === "defender";
          const d = isLoop
            ? curvedHandoff("defender", "research", true)
            : curvedHandoff(hop.from, hop.to);
          const hot = livePacket && packetStep === i;
          const midX = isLoop
            ? VIEW_W / 2
            : (NODE_X[hop.from] + NODE_W + NODE_X[hop.to]) / 2;
          const midY = isLoop ? VIEW_H - 48 : NODE_Y + NODE_H / 2 - 36;

          return (
            <g key={hop.index} opacity={hot ? 1 : 0.75}>
              <path
                d={d}
                fill="none"
                stroke={hot ? "#67b3ef" : "#313131"}
                strokeWidth={hot ? 2.25 : 1.5}
                strokeDasharray={isLoop ? "6 4" : undefined}
                markerEnd={hot ? "url(#chain-arrow-hot)" : "url(#chain-arrow)"}
              />
              <text
                x={midX}
                y={midY}
                textAnchor="middle"
                fill={hot ? "#67b3ef" : "#7c7c7c"}
                fontSize={9}
                className="font-mono uppercase"
              >
                {hop.index}. {hop.edgeTag}
              </text>
            </g>
          );
        })}

        {livePacket ? (
          <circle r={4.5} fill="#67b3ef">
            <animateMotion dur="2.4s" repeatCount="indefinite" path={packetPath} key={packetStep} />
          </circle>
        ) : null}

        {PIPELINE_AGENTS.map((agent, idx) => {
          const x = NODE_X[agent.id];
          const y = NODE_Y;
          const selected = selectedId === agent.id;
          const active = snapshot.activeAgentId === agent.id;
          const status = agentStatusById[agent.id] ?? "offline";
          const stroke = selected ? "#ffffff" : active ? "#67b3ef" : STATUS_STROKE[status];

          return (
            <g
              key={agent.id}
              transform={`translate(${x}, ${y})`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(agent.id);
              }}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${agent.label}, hop ${idx + 1}, ${statusLabel(status)}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(agent.id);
                }
              }}
            >
              {active ? (
                <rect
                  x={-6}
                  y={-6}
                  width={NODE_W + 12}
                  height={NODE_H + 12}
                  rx={10}
                  fill="none"
                  stroke="#67b3ef"
                  strokeOpacity={0.35}
                  strokeWidth={1}
                >
                  <animate
                    attributeName="stroke-opacity"
                    values="0.45;0.15;0.45"
                    dur="2.2s"
                    repeatCount="indefinite"
                  />
                </rect>
              ) : null}

              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                fill="hsl(var(--muted))"
                stroke={stroke}
                strokeWidth={selected || active ? 2 : 1.25}
              />

              <text
                x={NODE_W / 2}
                y={18}
                textAnchor="middle"
                fill="#7c7c7c"
                fontSize={8}
                className="font-mono uppercase"
              >
                hop {idx + 1}
              </text>
              <text
                x={NODE_W / 2}
                y={38}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={12}
                fontWeight={600}
              >
                {agent.label}
              </text>
              <text
                x={NODE_W / 2}
                y={54}
                textAnchor="middle"
                fill="#a7a7a7"
                fontSize={9}
              >
                {agent.headline.split(" ").slice(0, 2).join(" ")}
              </text>
              <circle cx={NODE_W / 2} cy={66} r={3.5} fill={STATUS_STROKE[status]} />
            </g>
          );
        })}
      </svg>

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4ade80]" /> Online
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#67b3ef]" /> Active hop
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--severity-high))]" /> Degraded
          </span>
        </span>
        <span className="text-muted-foreground">
          {livePacket
            ? `Packet on ${packetHop.edgeTag} · ${packetHop.label}`
            : "Awaiting campaign or ingest to animate chain"}
        </span>
      </div>
    </div>
  );
}
