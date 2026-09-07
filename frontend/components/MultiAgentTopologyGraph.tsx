"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Crosshair, Radio, ScrollText } from "lucide-react";
import { CommandMissionGraph } from "@/components/command/CommandMissionGraph";
import { CommandGraphInspector } from "@/components/command/CommandGraphInspector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCommandGraph } from "@/lib/hooks/useCommandGraph";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { useDashboardMetrics } from "@/lib/hooks/useDashboardMetrics";
import type { CommandGraphNode } from "@/lib/commandGraph";

/**
 * Live Attack Topology — topology API + ingest telemetry only.
 */
export default function MultiAgentTopologyGraph() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { apiOnline } = useConnection();
  const { liveEvents } = useDashboardMetrics();
  const { graph, loading, hasLiveData } = useCommandGraph(liveEvents, apiOnline);

  const selected = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph.nodes, selectedId]
  );

  const sourceLabel =
    graph.source === "topology"
      ? "Live topology"
      : graph.source === "telemetry"
        ? "Live telemetry"
        : apiOnline
          ? "Awaiting traffic"
          : "API offline";

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[640px] rounded-[8px]" />
        <Skeleton className="h-[640px] rounded-[8px]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={hasLiveData ? "success" : "outline"}
            className="font-mono text-[10px] uppercase gap-1.5"
          >
            <Radio className="h-3 w-3" aria-hidden />
            {sourceLabel}
          </Badge>
          {hasLiveData && graph.compromisedCount > 0 ? (
            <Badge variant="critical" className="font-mono text-[10px]">
              {graph.compromisedCount} elevated
            </Badge>
          ) : null}
          {hasLiveData && graph.maxRisk > 0 ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              max R{Math.round(graph.maxRisk)}
            </Badge>
          ) : null}
          {hasLiveData ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {graph.nodes.length} nodes · {graph.totalEvents} evt
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/logs">
              <ScrollText className="h-3.5 w-3.5" aria-hidden />
              Activity
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/red-team/lab">
              <Crosshair className="h-3.5 w-3.5" aria-hidden />
              Attack Lab
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <CommandMissionGraph
          graph={graph}
          selectedId={selectedId}
          onSelect={(n: CommandGraphNode | null) => setSelectedId(n?.id ?? null)}
          className="h-[640px] min-h-[640px]"
        />
        <CommandGraphInspector graph={graph} selected={selected} className="min-h-[640px]" />
      </div>
    </div>
  );
}
