"use client";

import { useMemo, useState } from "react";
import {
  COMMAND_GRAPH_VIEW,
  edgeStroke,
  severityStroke,
  type CommandGraphEdge,
  type CommandGraphModel,
  type CommandGraphNode,
} from "@/lib/commandGraph";
import { cn } from "@/lib/utils";

interface CommandMissionGraphProps {
  graph: CommandGraphModel;
  selectedId: string | null;
  onSelect: (node: CommandGraphNode | null) => void;
  highlightSessionId?: string;
  className?: string;
  /** Command center column — no internal HUD chrome */
  embedded?: boolean;
}

function computeFitViewBox(
  nodes: CommandGraphNode[],
  fallbackW: number,
  fallbackH: number
): string {
  if (!nodes.length) return `0 0 ${fallbackW} ${fallbackH}`;
  const pad = 96;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    const r = nodeRadius(n);
    minX = Math.min(minX, n.x - r - pad);
    maxX = Math.max(maxX, n.x + r + pad);
    minY = Math.min(minY, n.y - r - pad);
    maxY = Math.max(maxY, n.y + r + 72);
  }
  const w = Math.max(360, maxX - minX);
  const h = Math.max(280, maxY - minY);
  return `${minX} ${minY} ${w} ${h}`;
}

function nodeRadius(node: CommandGraphNode): number {
  const base =
    node.kind === "tool" ? 24 : node.kind === "session" ? 30 : node.kind === "control" ? 34 : 32;
  const bump = Math.min(14, Math.floor(Math.log2(Math.max(node.eventCount, 1)) * 4));
  return base + bump;
}

function labelText(label: string, max = 16): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function curvedPath(a: CommandGraphNode, b: CommandGraphNode): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ox = (-dy / len) * 36;
  const oy = (dx / len) * 36;
  return `M ${a.x} ${a.y} Q ${mx + ox} ${my + oy} ${b.x} ${b.y}`;
}

function riskArcPath(r: number, score: number): string {
  const t = Math.max(0, Math.min(1, score / 100));
  const start = -Math.PI * 0.75;
  const end = start + t * Math.PI * 1.5;
  const x1 = Math.cos(start) * r;
  const y1 = Math.sin(start) * r;
  const x2 = Math.cos(end) * r;
  const y2 = Math.sin(end) * r;
  const large = t > 0.5 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

export function CommandMissionGraph({
  graph,
  selectedId,
  onSelect,
  highlightSessionId,
  className,
  embedded = false,
}: CommandMissionGraphProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const W = COMMAND_GRAPH_VIEW.width;
  const H = COMMAND_GRAPH_VIEW.height;

  const neighborIds = useMemo(() => {
    if (!selected) return new Set<string>();
    const set = new Set<string>([selected.id]);
    for (const e of graph.edges) {
      if (e.source === selected.id) set.add(e.target);
      if (e.target === selected.id) set.add(e.source);
    }
    return set;
  }, [graph.edges, selected]);

  const severityBars = useMemo(() => {
    const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, SAFE: 0 };
    for (const n of graph.nodes) counts[n.severity] += 1;
    return counts;
  }, [graph.nodes]);

  const showLanes = graph.nodes.some((n) => n.kind === "tool") && graph.nodes.some((n) => n.kind === "agent");
  const hasSessions = graph.nodes.some((n) => n.kind === "session");
  const hotPathIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of graph.edges) {
      if (e.status !== "COMPROMISED" && e.status !== "QUARANTINED") continue;
      set.add(e.source);
      set.add(e.target);
    }
    for (const n of graph.nodes) {
      if (n.severity === "CRITICAL" || n.severity === "HIGH") set.add(n.id);
    }
    return set;
  }, [graph.edges, graph.nodes]);
  const hottest = useMemo(
    () =>
      [...graph.nodes].sort(
        (a, b) => b.riskScore - a.riskScore || b.eventCount - a.eventCount
      )[0] ?? null,
    [graph.nodes]
  );

  const fitViewBox = useMemo(
    () => computeFitViewBox(graph.nodes, W, H),
    [graph.nodes, W, H]
  );

  return (
    <div
      className={cn(
        "command-mission-graph relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border border-border/80 bg-background",
        graph.compromisedCount > 0 && "border-[hsl(var(--severity-critical))]/35",
        !embedded && "min-h-[240px]",
        className
      )}
    >
      {/* Atmosphere */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(#27272a 1px, transparent 1px), linear-gradient(90deg, #27272a 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          opacity: 0.35,
          maskImage: "radial-gradient(ellipse 80% 70% at 50% 45%, black, transparent)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: graph.compromisedCount
            ? "radial-gradient(ellipse 55% 45% at 50% 48%, hsl(var(--severity-critical) / 0.07), transparent 72%)"
            : "radial-gradient(ellipse 50% 40% at 50% 50%, hsl(205 81% 67% / 0.06), transparent 70%)",
        }}
        aria-hidden
      />

      {/* HUD — full page only; embedded uses parent toolbar */}
      {!embedded ? (
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-3 border-b border-border/80 bg-background/90 px-3 py-2 backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className={graph.compromisedCount > 0 ? "text-[hsl(var(--severity-critical))]" : "text-indigo-400"}>
            {graph.compromisedCount > 0 ? "Breach path live" : "Containment map"}
          </span>
          <span className="text-zinc-700">|</span>
          <span>
            nodes <span className="text-foreground">{graph.nodes.length}</span>
          </span>
          <span>
            edges <span className="text-foreground">{graph.edges.length}</span>
          </span>
          <span>
            events <span className="text-foreground">{graph.totalEvents}</span>
          </span>
          <span>
            max risk{" "}
            <span
              className={cn(
                graph.maxRisk >= 80
                  ? "text-[hsl(var(--severity-critical))]"
                  : graph.maxRisk >= 50
                    ? "text-[hsl(var(--severity-high))]"
                    : "text-foreground"
              )}
            >
              {Math.round(graph.maxRisk)}
            </span>
          </span>
          {hottest && hottest.riskScore >= 50 ? (
            <>
              <span className="text-zinc-700">|</span>
              <span className="normal-case tracking-normal text-zinc-400">
                hot{" "}
                <button
                  type="button"
                  className="pointer-events-auto text-[hsl(var(--severity-critical))] underline-offset-2 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(hottest);
                  }}
                >
                  {hottest.label.length > 18 ? `${hottest.label.slice(0, 16)}…` : hottest.label}
                </button>
              </span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5" aria-hidden>
          {(["CRITICAL", "HIGH", "MEDIUM", "SAFE"] as const).map((s) => (
            <div key={s} className="flex items-end gap-0.5" title={`${s}: ${severityBars[s]}`}>
              <div
                className="w-1.5 rounded-sm"
                style={{
                  height: Math.max(4, severityBars[s] * 6),
                  background:
                    s === "CRITICAL"
                      ? "hsl(var(--severity-critical))"
                      : s === "HIGH"
                        ? "hsl(var(--severity-high))"
                        : s === "MEDIUM"
                          ? "hsl(var(--severity-medium))"
                          : "#52525b",
                }}
              />
            </div>
          ))}
        </div>
      </div>
      ) : null}

      {!embedded ? (
      <>
      {/* Kill-chain lane chrome */}
      <div className="pointer-events-none absolute left-2 top-10 z-20 h-3 w-3 border-l border-t border-border" aria-hidden />
      <div className="pointer-events-none absolute right-2 top-10 z-20 h-3 w-3 border-r border-t border-border" aria-hidden />
      <div className="pointer-events-none absolute bottom-10 left-2 z-20 h-3 w-3 border-b border-l border-border" aria-hidden />
      <div className="pointer-events-none absolute bottom-10 right-2 z-20 h-3 w-3 border-b border-r border-border" aria-hidden />
      {showLanes ? (
        <div className="pointer-events-none absolute left-0 right-0 top-11 z-20 flex justify-between px-3 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-600">
          <span>Agents</span>
          {hasSessions ? <span className="text-indigo-400/80">Session → Agent → Tool</span> : <span />}
          <span>Tools</span>
        </div>
      ) : (
        <div className="pointer-events-none absolute left-3 top-11 z-20 font-mono text-[9px] text-zinc-600">
          NODES
        </div>
      )}
      </>
      ) : null}

      <div className={cn("relative min-h-0 flex-1", embedded ? "min-h-[200px]" : "pt-8")}>
      <svg
        viewBox={fitViewBox}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label="Command Center containment map"
        onClick={() => onSelect(null)}
      >
        <defs>
          <marker
            id="cmd-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#52525b" />
          </marker>
          <marker
            id="cmd-arrow-hot"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--severity-critical))" />
          </marker>
          <filter id="cmd-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Zone rings — threat geography */}
        {!embedded ? (
        <g opacity={0.2} fill="none" stroke="#3f3f46" strokeWidth={1}>
          <ellipse cx={W / 2} cy={H / 2 + 10} rx={280} ry={180} />
          <ellipse cx={W / 2} cy={H / 2 + 10} rx={180} ry={110} strokeDasharray="4 6" />
          <ellipse cx={W / 2} cy={H / 2 + 10} rx={90} ry={55} stroke="#67b3ef" strokeOpacity={0.4} />
        </g>
        ) : null}

        {/* Swimlane guides */}
        {!embedded && showLanes ? (
          <g opacity={0.15} stroke="#52525b" strokeWidth={1} strokeDasharray="2 8">
            <line x1={W / 2} y1={70} x2={W / 2} y2={H - 40} />
          </g>
        ) : null}

        {graph.edges.map((edge) => {
          const s = byId.get(edge.source);
          const t = byId.get(edge.target);
          if (!s || !t) return null;
          const onHotPath =
            !selected &&
            hotPathIds.has(edge.source) &&
            hotPathIds.has(edge.target) &&
            (edge.status === "COMPROMISED" || edge.status === "QUARANTINED");
          return (
            <EdgeLayer
              key={edge.id}
              edge={edge}
              source={s}
              target={t}
              dimmed={Boolean(selected && !neighborIds.has(s.id) && !neighborIds.has(t.id))}
              highlighted={Boolean(
                selected
                  ? edge.source === selected.id || edge.target === selected.id
                  : onHotPath
              )}
            />
          );
        })}

        {graph.nodes.map((node) => (
          <NodeLayer
            key={node.id}
            node={node}
            selected={selectedId === node.id}
            sessionHighlighted={
              Boolean(
                highlightSessionId &&
                  (node.id === highlightSessionId || node.sessionId === highlightSessionId)
              )
            }
            hovered={hoveredId === node.id}
            dimmed={Boolean(
              selected
                ? !neighborIds.has(node.id)
                : hotPathIds.size > 0 && !hotPathIds.has(node.id) && graph.compromisedCount > 0
            )}
            onSelect={onSelect}
            onHover={setHoveredId}
          />
        ))}
      </svg>
      </div>

      {graph.source === "idle" || graph.nodes.length === 0 ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-6 pt-8 pb-12">
          <div className="max-w-md text-center">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-indigo-400">
              Live feed idle
            </p>
            <p className="mt-2 text-[15px] font-medium tracking-[-0.19px] text-foreground">
              Waiting for real topology or ingest
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
              This map only renders live agents, sessions, and tools from the containment API — nothing synthetic.
            </p>
          </div>
        </div>
      ) : null}

      {/* Legend — full page only */}
      {!embedded ? (
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex items-end justify-between gap-3 border-t border-border/80 bg-background/90 px-3 py-2">
        <div className="flex flex-wrap gap-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--severity-critical))]" />
            Breach
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--severity-high))]" />
            Quarantine
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
            Active call
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rotate-45 border border-zinc-500" />
            Tool
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-zinc-500" />
            Agent
          </span>
        </div>
        <p className="font-mono text-[10px] text-zinc-600">
          {graph.source === "idle"
            ? "no live nodes"
            : graph.compromisedCount > 0
              ? `${graph.compromisedCount} elevated · investigate`
              : "posture quiet"}
        </p>
      </div>
      ) : embedded && graph.compromisedCount > 0 ? (
        <div className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-md bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 ring-1 ring-red-500/20">
          {graph.compromisedCount} flagged
        </div>
      ) : null}
    </div>
  );
}

function EdgeLayer({
  edge,
  source,
  target,
  dimmed,
  highlighted,
}: {
  edge: CommandGraphEdge;
  source: CommandGraphNode;
  target: CommandGraphNode;
  dimmed: boolean;
  highlighted: boolean;
}) {
  const hot = edge.status === "COMPROMISED" || edge.status === "QUARANTINED";
  const active = edge.status === "ACTIVE" || hot;
  const stroke = edgeStroke(edge.status);
  const d = curvedPath(source, target);
  const width = highlighted ? 2.75 : hot ? 2.25 : active ? 1.5 : 1;

  return (
    <g opacity={dimmed ? 0.12 : 1}>
      {/* Hit / glow underlay */}
      {hot ? (
        <path d={d} fill="none" stroke={stroke} strokeWidth={width + 4} opacity={0.15} />
      ) : null}
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={edge.status === "COMPROMISED" ? "7 4" : undefined}
        markerEnd={hot ? "url(#cmd-arrow-hot)" : "url(#cmd-arrow)"}
        opacity={highlighted ? 1 : 0.7}
      />
      {/* Traffic pulse on active / hot links */}
      {active && !dimmed ? (
        <circle r={hot ? 3.5 : 2.5} fill={stroke} opacity={0.9}>
          <animateMotion dur={hot ? "1.6s" : "2.8s"} repeatCount="indefinite" path={d} />
        </circle>
      ) : null}
      {highlighted || hot ? (
        <text
          x={(source.x + target.x) / 2}
          y={(source.y + target.y) / 2 - 12}
          fill="#71717a"
          fontSize={9}
          textAnchor="middle"
          className="font-mono"
        >
          {edge.label}
          {edge.count > 1 ? ` ×${edge.count}` : ""}
        </text>
      ) : null}
    </g>
  );
}

function NodeLayer({
  node,
  selected,
  sessionHighlighted,
  hovered,
  dimmed,
  onSelect,
  onHover,
}: {
  node: CommandGraphNode;
  selected: boolean;
  sessionHighlighted?: boolean;
  hovered: boolean;
  dimmed: boolean;
  onSelect: (node: CommandGraphNode) => void;
  onHover: (id: string | null) => void;
}) {
  const r = nodeRadius(node);
  const stroke = selected ? "#ffffff" : severityStroke(node.severity);
  const hot = node.severity === "CRITICAL" || node.severity === "HIGH";
  const active = selected || hovered;

  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      opacity={dimmed ? 0.22 : 1}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${node.label}, ${node.kind}, risk ${node.riskScore}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(node);
        }
      }}
      className="cursor-pointer outline-none"
    >
      {/* Large hit target — HCI minimum ~44px */}
      <circle r={r + 18} fill="transparent" stroke="none" pointerEvents="all" />

      {sessionHighlighted && !selected ? (
        <circle
          r={r + 14}
          fill="none"
          stroke="#67b3ef"
          strokeWidth={2}
          strokeDasharray="4 3"
          opacity={0.85}
        />
      ) : null}

      {hot ? (
        <circle r={r + 12} fill="none" stroke={stroke} strokeWidth={1.5} opacity={0.35} filter="url(#cmd-glow)">
          <animate
            attributeName="r"
            values={`${r + 10};${r + 18};${r + 10}`}
            dur="2.6s"
            repeatCount="indefinite"
          />
          <animate attributeName="opacity" values="0.4;0.12;0.4" dur="2.6s" repeatCount="indefinite" />
        </circle>
      ) : null}

      {active ? (
        <circle r={r + 8} fill="none" stroke={selected ? "#fafafa" : "#67b3ef"} strokeWidth={2} opacity={0.85} />
      ) : null}

      {/* Risk gauge track */}
      {node.riskScore > 0 ? (
        <g opacity={0.9}>
          <path
            d={riskArcPath(r + 7, 100)}
            fill="none"
            stroke="#3f3f46"
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <path
            d={riskArcPath(r + 7, node.riskScore)}
            fill="none"
            stroke={stroke}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      ) : null}

      {node.kind === "tool" ? (
        <rect
          x={-r}
          y={-r}
          width={r * 2}
          height={r * 2}
          rx={4}
          transform="rotate(45)"
          fill="hsl(var(--muted))"
          stroke={stroke}
          strokeWidth={selected ? 3 : 2}
        />
      ) : node.kind === "control" ? (
        <rect
          x={-r}
          y={-r * 0.65}
          width={r * 2}
          height={r * 1.3}
          rx={6}
          fill="hsl(var(--muted))"
          stroke={stroke}
          strokeWidth={selected ? 3 : 2}
        />
      ) : node.kind === "session" ? (
        <g>
          <circle r={r} fill="hsl(var(--muted))" stroke={stroke} strokeWidth={selected ? 3 : 2} />
          <circle r={r - 6} fill="none" stroke="#3f3f46" strokeWidth={1.5} />
        </g>
      ) : (
        <circle r={r} fill="hsl(var(--muted))" stroke={stroke} strokeWidth={selected ? 3 : 2} />
      )}

      {/* Kind badge inside node */}
      <text
        y={4}
        fill="#ffffff"
        fontSize={11}
        fontWeight={700}
        textAnchor="middle"
        className="pointer-events-none select-none uppercase"
        style={{ letterSpacing: "0.04em" }}
      >
        {node.kind === "tool" ? "T" : node.kind === "session" ? "S" : "A"}
      </text>

      {/* Label pill — readable at a glance */}
      <g transform={`translate(0, ${r + 22})`}>
        <rect
          x={-Math.min(72, node.label.length * 4.2 + 12) / 2}
          y={-11}
          width={Math.min(72, node.label.length * 4.2 + 12)}
          height={22}
          rx={4}
          fill="hsl(var(--muted))"
          stroke={active ? "#67b3ef" : "#3f3f46"}
          strokeWidth={1}
        />
        <text
          y={4}
          fill="#e4e4e7"
          fontSize={10}
          fontWeight={500}
          textAnchor="middle"
          className="pointer-events-none select-none"
        >
          {labelText(node.label, 14)}
        </text>
      </g>

      <text
        y={r + 40}
        fill="#71717a"
        fontSize={9}
        textAnchor="middle"
        className="pointer-events-none font-mono uppercase"
      >
        {node.riskScore > 0
          ? `R${Math.round(node.riskScore)} · ${node.eventCount} evt`
          : node.kind}
      </text>
    </g>
  );
}
