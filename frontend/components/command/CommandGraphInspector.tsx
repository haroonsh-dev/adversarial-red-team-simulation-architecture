"use client";

import Link from "next/link";
import {
  Activity,
  Crosshair,
  GitBranch,
  Network,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CommandGraphModel, CommandGraphNode } from "@/lib/commandGraph";
import { cn } from "@/lib/utils";

interface CommandGraphInspectorProps {
  graph: CommandGraphModel;
  selected: CommandGraphNode | null;
  className?: string;
}

function severityBadgeVariant(
  severity: CommandGraphNode["severity"]
): "critical" | "warning" | "success" | "outline" {
  if (severity === "CRITICAL") return "critical";
  if (severity === "HIGH" || severity === "MEDIUM") return "warning";
  if (severity === "SAFE") return "success";
  return "outline";
}

export function CommandGraphInspector({
  graph,
  selected,
  className,
}: CommandGraphInspectorProps) {
  const relatedEdges = selected
    ? graph.edges.filter((e) => e.source === selected.id || e.target === selected.id)
    : [];

  return (
    <aside
      className={cn(
        "flex h-full min-h-[420px] flex-col border border-border bg-card",
        "rounded-[8px]",
        className
      )}
    >
      <header className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.85px] text-[#67b3ef]">
          Inspector
        </p>
        <h3 className="mt-1 text-[15px] font-medium tracking-[-0.19px] text-foreground">
          {selected ? selected.label : "Select a node"}
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {selected
            ? `${selected.kind} · ${selected.status}`
            : "Click an agent, session, or tool to investigate blast radius."}
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {!selected ? (
          <div className="space-y-3 text-[13px] text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Nodes" value={String(graph.nodes.length)} />
              <Metric label="Edges" value={String(graph.edges.length)} />
              <Metric label="Elevated" value={String(graph.compromisedCount)} hot={graph.compromisedCount > 0} />
              <Metric label="Max risk" value={String(Math.round(graph.maxRisk))} hot={graph.maxRisk >= 60} />
              <Metric label="Events" value={String(graph.totalEvents)} />
              <Metric
                label="Source"
                value={
                  graph.source === "topology"
                    ? "Live topo"
                    : graph.source === "telemetry"
                      ? "Telemetry"
                      : "Idle"
                }
              />
            </div>
            <p className="leading-relaxed">
              {graph.source === "idle"
                ? "No live topology or ingest events yet. Point customers at /api/v1/ingest or run sandbox traffic to populate this map."
                : graph.compromisedCount > 0
                  ? "Breach path is highlighted. Select a red node to open replay, logs, or sandbox probe."
                  : "Graph is live from containment topology + telemetry. Select a node to inspect blast radius."}
            </p>
            {graph.compromisedCount > 0 ? (
              <div className="rounded-[6px] border border-[hsl(var(--severity-critical))]/40 bg-[hsl(var(--severity-critical))]/10 px-2.5 py-2 font-mono text-[11px] text-[hsl(var(--severity-critical))]">
                {graph.compromisedCount} elevated · max R{Math.round(graph.maxRisk)}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={severityBadgeVariant(selected.severity)}>
                {selected.severity}
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {selected.kind}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Metric label="Risk" value={String(Math.round(selected.riskScore))} hot={selected.riskScore >= 60} />
              <Metric label="Events" value={String(selected.eventCount)} />
            </div>

            <div>
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Linked channels
              </p>
              {relatedEdges.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No edges on this node.</p>
              ) : (
                <ul className="space-y-1.5">
                  {relatedEdges.slice(0, 8).map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between rounded-[6px] border border-border bg-background px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground"
                    >
                      <span className="truncate">{e.label}</span>
                      <span
                        className={cn(
                          "shrink-0 uppercase",
                          e.status === "COMPROMISED" && "text-[hsl(var(--severity-critical))]",
                          e.status === "QUARANTINED" && "text-[hsl(var(--severity-high))]",
                          e.status === "SAFE" && "text-muted-foreground",
                          e.status === "ACTIVE" && "text-[#67b3ef]"
                        )}
                      >
                        {e.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2 pt-1">
              {selected.sessionId ? (
                <Button asChild size="sm" className="w-full justify-start gap-2">
                  <Link href={`/replay?session=${encodeURIComponent(selected.sessionId)}`}>
                    <Activity className="h-3.5 w-3.5" aria-hidden />
                    Open session replay
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                <Link href="/logs">
                  <ScrollText className="h-3.5 w-3.5" aria-hidden />
                  Activity log
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                <Link href="/command-center/topology">
                  <Network className="h-3.5 w-3.5" aria-hidden />
                  Full topology
                </Link>
              </Button>
              {selected.severity === "CRITICAL" || selected.severity === "HIGH" ? (
                <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                  <Link href="/sandbox">
                    <Crosshair className="h-3.5 w-3.5" aria-hidden />
                    Probe in sandbox
                  </Link>
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <footer className="border-t border-border px-4 py-3">
        <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
          {graph.compromisedCount > 0 ? (
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--severity-critical))]" aria-hidden />
          ) : (
            <GitBranch className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#67b3ef]" aria-hidden />
          )}
          <span>
            {graph.compromisedCount > 0
              ? `${graph.compromisedCount} elevated node${graph.compromisedCount === 1 ? "" : "s"} in view`
              : "No elevated nodes — containment quiet"}
          </span>
        </div>
      </footer>
    </aside>
  );
}

function Metric({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div className="rounded-[6px] border border-border bg-background px-2.5 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[14px] font-medium",
          hot ? "text-[hsl(var(--severity-critical))]" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
