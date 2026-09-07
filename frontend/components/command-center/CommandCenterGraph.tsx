"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods, type NodeObject } from "react-force-graph-2d";
import {
  AGENT_RING_ORDER,
  AGENT_SHORT,
  statusColor,
  type CommandGraphLinkDatum,
  type CommandGraphNodeDatum,
} from "@/lib/commandCenterOps";
import { themeHsl } from "@/lib/chartTheme";

type GraphNode = CommandGraphNodeDatum &
  NodeObject & {
    fx?: number;
    fy?: number;
  };

type GraphLink = Omit<CommandGraphLinkDatum, "source" | "target"> & {
  source: string | GraphNode;
  target: string | GraphNode;
  pulse?: boolean;
};

type HoverTip = {
  id: string;
  name: string;
  status: string;
  activity: number;
  lastMessage?: string;
  x: number;
  y: number;
};

function ringPosition(id: string, w: number, h: number): { x: number; y: number } | null {
  const idx = AGENT_RING_ORDER.indexOf(id as (typeof AGENT_RING_ORDER)[number]);
  if (idx < 0) return null;
  // Graph space is centered at origin; camera zoomToFit fills the canvas.
  const R = Math.min(w, h) * 0.36;
  const angle = -Math.PI / 2 + (idx / AGENT_RING_ORDER.length) * Math.PI * 2;
  return { x: Math.cos(angle) * R, y: Math.sin(angle) * R };
}

function nodeRadius(node: GraphNode): number {
  const base = node.kind === "target" ? 14 : 20;
  return base + Math.min(8, Math.sqrt(Math.max(node.activity, 1)) * 1.1);
}

export function CommandCenterGraph({
  nodes,
  links,
  selectedId,
  onSelect,
  lastByAgent,
  activeHops,
}: {
  nodes: CommandGraphNodeDatum[];
  links: CommandGraphLinkDatum[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  lastByAgent?: Record<string, string>;
  activeHops?: Set<string>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const nodeCache = useRef<Map<string, GraphNode>>(new Map());
  const [size, setSize] = useState({ w: 720, h: 480 });
  const [tip, setTip] = useState<HoverTip | null>(null);

  const graphData = useMemo(() => {
    const cache = nodeCache.current;
    const nextIds = new Set(nodes.map((n) => n.id));

    for (const id of [...cache.keys()]) {
      if (!nextIds.has(id)) cache.delete(id);
    }

    let tgtI = 0;

    const merged: GraphNode[] = nodes.map((n, i) => {
      const prev = cache.get(n.id);
      const pinned = ringPosition(n.id, size.w, size.h);
      let fx = pinned?.x;
      let fy = pinned?.y;
      if (!pinned && n.kind === "target") {
        const tgtCount = Math.max(1, nodes.filter((x) => x.kind === "target").length);
        const angle = (tgtI / tgtCount) * Math.PI * 2;
        const r = Math.min(size.w, size.h) * 0.14;
        fx = Math.cos(angle) * r;
        fy = Math.sin(angle) * r;
        tgtI += 1;
      }
      const node: GraphNode = prev
        ? Object.assign(prev, {
            ...n,
            fx,
            fy,
          })
        : {
            ...n,
            x: fx ?? (i % 3) * 40,
            y: fy ?? Math.floor(i / 3) * 40,
            fx,
            fy,
          };
      cache.set(n.id, node);
      return node;
    });

    return {
      nodes: merged,
      links: links.map((l) => {
        const key = `${l.source}→${l.target}`;
        return { ...l, pulse: activeHops?.has(key) ?? false };
      }),
    };
  }, [nodes, links, size.w, size.h, activeHops]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => setSize({ w: el.clientWidth || 720, h: el.clientHeight || 480 });
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    const charge = fg.d3Force("charge") as unknown as { strength?: (v: number) => void } | undefined;
    charge?.strength?.(-480);
    const link = fg.d3Force("link") as unknown as { distance?: (v: number) => void } | undefined;
    link?.distance?.(Math.min(size.w, size.h) * 0.4);
    const t = window.setTimeout(() => {
      fg.centerAt?.(0, 0, 0);
      fg.zoomToFit?.(40, 56);
    }, 80);
    return () => window.clearTimeout(t);
  }, [size.w, size.h, graphData.nodes.length, graphData.links.length]);

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x ?? 0;
      const y = node.y ?? 0;
      const r = nodeRadius(node);
      const color = statusColor(node.status);
      const dim = selectedId != null && selectedId !== node.id;
      const codeSize = Math.max(10, 13 / globalScale);
      const labelSize = Math.max(10, 12 / globalScale);

      ctx.save();
      ctx.globalAlpha = dim ? 0.32 : 1;

      if (node.status !== "nominal") {
        ctx.beginPath();
        ctx.arc(x, y, r + 5 / globalScale, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.globalAlpha = dim ? 0.22 : 0.6;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
        ctx.globalAlpha = dim ? 0.32 : 1;
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = themeHsl("--background");
      ctx.fill();
      ctx.lineWidth = 2.5 / globalScale;
      ctx.strokeStyle = color;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x, y, Math.max(4, r - 5), 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = dim ? 0.15 : node.status === "nominal" ? 0.2 : 0.42;
      ctx.fill();
      ctx.globalAlpha = dim ? 0.32 : 1;

      if (selectedId === node.id) {
        ctx.beginPath();
        ctx.arc(x, y, r + 8 / globalScale, 0, Math.PI * 2);
        ctx.strokeStyle = themeHsl("--foreground", "hsl(0 0% 98%)");
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Short code only inside the circle — full name goes outside radially.
      const code = AGENT_SHORT[node.id] ?? node.name.slice(0, 3).toUpperCase();
      ctx.font = `700 ${codeSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = themeHsl("--foreground", "hsl(0 0% 98%)");
      ctx.fillText(code, x, y);

      // Radial outward label in graph space (origin-centered ring).
      const dx = x;
      const dy = y;
      const len = Math.hypot(dx, dy) || 1;
      const labelDist = r + 18 / globalScale;
      const lx = x + (dx / len) * labelDist;
      const ly = y + (dy / len) * labelDist;
      ctx.font = `500 ${labelSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.textAlign = dx >= -1 ? "left" : "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = dim ? themeHsl("--muted-foreground") : themeHsl("--foreground");
      ctx.fillText(node.name, lx, ly);

      ctx.restore();
    },
    [selectedId]
  );

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.28]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border) / 0.7) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border) / 0.7) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        nodeId="id"
        nodeRelSize={10}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          const r = nodeRadius(node as GraphNode) + 14;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={(l) => {
          const link = l as GraphLink;
          if (link.hmacOk === false) return "#ef4444";
          if (link.pulse) return "#22d3ee";
          if (link.hot) return "#f59e0b";
          return "#3f3f46";
        }}
        linkWidth={(l) => {
          const link = l as GraphLink;
          const base = Math.min(4, 1 + (link.traffic ?? 1) * 0.2);
          if (link.pulse) return base + 2;
          return link.hot ? base + 1.4 : base;
        }}
        linkDirectionalParticles={(l) => {
          const link = l as GraphLink;
          if (link.pulse) return 8;
          if (link.hot) return 5;
          return Math.min(4, 1 + Math.floor((link.traffic ?? 1) / 3));
        }}
        linkDirectionalParticleWidth={(l) => {
          const link = l as GraphLink;
          if (link.hmacOk === false) return 3;
          if (link.pulse) return 2.8;
          return 1.8;
        }}
        linkDirectionalParticleSpeed={(l) => {
          const link = l as GraphLink;
          return link.pulse ? 0.014 : link.hot ? 0.008 : 0.005;
        }}
        linkDirectionalParticleColor={(l) => {
          const link = l as GraphLink;
          if (link.hmacOk === false) return "#f87171";
          if (link.pulse) return "#67e8f9";
          if (link.hot) return "#fbbf24";
          return "#22d3ee";
        }}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={0.92}
        cooldownTicks={50}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.32}
        onNodeHover={(node) => {
          const el = wrapRef.current;
          if (!el) return;
          el.style.cursor = node ? "pointer" : "default";
          if (!node) {
            setTip(null);
            return;
          }
          const g = node as GraphNode;
          const screen = fgRef.current?.graph2ScreenCoords(g.x ?? 0, g.y ?? 0);
          setTip({
            id: g.id,
            name: g.name,
            status: g.status.replace("_", " "),
            activity: g.activity,
            lastMessage: lastByAgent?.[g.id],
            x: screen?.x ?? (g.x ?? 0),
            y: screen?.y ?? (g.y ?? 0),
          });
        }}
        onNodeClick={(node) => {
          onSelect(String((node as GraphNode).id));
        }}
        onBackgroundClick={() => {
          setTip(null);
          onSelect(null);
        }}
      />

      {tip ? (
        <div
          className="pointer-events-none absolute z-[2] max-w-[260px] rounded-sm border border-border bg-background/95 px-2.5 py-2 shadow-lg"
          style={{
            left: Math.min(tip.x + 16, size.w - 270),
            top: Math.max(8, tip.y - 12),
          }}
        >
          <p className="font-mono text-[11px] font-semibold text-foreground">{tip.name}</p>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
            {tip.status} · n={tip.activity}
          </p>
          {tip.lastMessage ? (
            <p className="mt-1 line-clamp-2 font-mono text-[10px] leading-snug text-zinc-400">
              {tip.lastMessage}
            </p>
          ) : null}
          <p className="mt-1.5 font-mono text-[9px] uppercase text-cyan-500/80">Click to open inspector</p>
        </div>
      ) : null}

      {/* Full legend — status + edge activity */}
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-[1] flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-sm border border-border/90 bg-background/90 px-3 py-2 font-mono text-[9px] uppercase tracking-wide text-zinc-400">
        <span className="text-zinc-600">Nodes</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500" /> Nominal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-500" /> Under attack
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-500" /> Compromised / Breach
        </span>
        <span className="mx-1 h-3 w-px bg-muted" />
        <span className="text-zinc-600">Edges</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-cyan-400" /> Active call
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-amber-400" /> Hot path
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-red-400" /> HMAC fail
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-zinc-600" /> Quarantine idle
        </span>
      </div>
    </div>
  );
}
