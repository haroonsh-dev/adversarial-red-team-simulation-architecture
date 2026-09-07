"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { GitBranch, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageStack } from "@/components/shared/PageStack";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { StatCard } from "@/components/shared/StatCard";
import { AgentPipelineDAG } from "@/components/pipeline/AgentPipelineDAG";
import { AgentDetailPanel } from "@/components/pipeline/AgentDetailPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePipelineOverview } from "@/lib/hooks/usePipelineOverview";
import { useConnection } from "@/lib/context/ConnectionProvider";
import type { PipelineAgentId } from "@/lib/agentRoles";
import { PIPELINE_AGENT_BY_ID } from "@/lib/agentRoles";
import { CHAIN_HOPS, summarizeChain } from "@/lib/pipelineChain";

export default function PipelinePage() {
  const { pipeline, loading, refreshPolicies } = usePipelineOverview();
  const { apiOnline, wsConnected } = useConnection();
  const [selectedId, setSelectedId] = useState<PipelineAgentId | null>("defender");

  const selectedAgent =
    pipeline.agents.find((a) => a.id === selectedId) ?? pipeline.agents[0] ?? null;

  const chain = useMemo(() => summarizeChain(pipeline), [pipeline]);

  return (
    <PageStack>
      <PageHeader
        title="AI Assets"
        description="The agents ARTSA watches, and how they pass work to each other."
        icon={<GitBranch className="h-5 w-5" />}
        badge={<LiveIndicator connected={apiOnline && wsConnected} className="meta-badge" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refreshPolicies()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button asChild size="sm">
              <Link href="/red-team/lab">Attack Lab</Link>
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-[8px]" />
          <Skeleton className="h-24 rounded-[8px]" />
          <Skeleton className="h-24 rounded-[8px]" />
          <Skeleton className="h-24 rounded-[8px]" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Active hop"
            value={
              chain.activeHop
                ? `${chain.activeHop.index}. ${PIPELINE_AGENT_BY_ID[chain.activeHop.from].label}`
                : "—"
            }
            icon={GitBranch}
            subtitle={chain.activeHop?.edgeTag ?? "No live handoff"}
          />
          <StatCard
            label="Online / active"
            value={`${chain.onlineCount + chain.activeCount}/6`}
            subtitle={`${chain.activeCount} executing`}
          />
          <StatCard
            label="Degraded"
            value={chain.degradedCount}
            severity={chain.degradedCount > 0 ? "HIGH" : "LOW"}
          />
          <StatCard
            label="Loop"
            value={pipeline.loopClosed ? "Closed" : "Open"}
            subtitle={chain.loopHealthy ? "Chain healthy" : "Needs attention"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <DashboardCard
            title="Chain graph"
            description="Numbered handoffs with feedback loop — select a hop to inspect chaining"
            badge={
              pipeline.loopClosed ? (
                <Badge variant="outline" className="meta-badge">
                  Loop closed
                </Badge>
              ) : (
                <Badge variant="outline" className="meta-badge">
                  Awaiting traffic
                </Badge>
              )
            }
            contentClassName="!p-0"
          >
            {loading ? (
              <Skeleton className="m-4 h-[300px] rounded-[8px]" />
            ) : !apiOnline ? (
              <EmptyState
                icon={GitBranch}
                title="Pipeline offline"
                description="Connect the ARTSA API to visualize live agent handoffs and chain integrity."
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href="/get-started">Setup guide</Link>
                  </Button>
                }
                className="py-16"
              />
            ) : (
              <AgentPipelineDAG
                snapshot={pipeline}
                selectedId={selectedId}
                onSelect={setSelectedId}
                animatePacket={wsConnected && Boolean(pipeline.activeAgentId)}
                className="border-0 rounded-none"
              />
            )}
          </DashboardCard>

          <DashboardCard
            title="Handoff table"
            description="Explicit chain contracts between agents"
            contentClassName="!p-0"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead className="border-b border-border bg-muted font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Hop</th>
                    <th className="px-3 py-2.5 font-medium">From</th>
                    <th className="px-3 py-2.5 font-medium">To</th>
                    <th className="px-3 py-2.5 font-medium">Contract</th>
                    <th className="px-3 py-2.5 font-medium">Tag</th>
                  </tr>
                </thead>
                <tbody>
                  {CHAIN_HOPS.map((hop) => {
                    const hot = pipeline.activeAgentId === hop.from;
                    return (
                      <tr
                        key={hop.index}
                        className={cnRow(
                          hot,
                          selectedId === hop.from
                        )}
                        onClick={() => setSelectedId(hop.from)}
                      >
                        <td className="px-3 py-2 font-mono text-muted-foreground">{hop.index}</td>
                        <td className="px-3 py-2 font-medium text-foreground">
                          {PIPELINE_AGENT_BY_ID[hop.from].label}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {PIPELINE_AGENT_BY_ID[hop.to].label}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{hop.label}</td>
                        <td className="px-3 py-2 font-mono uppercase text-[#67b3ef]">
                          {hop.edgeTag}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </div>

        {loading ? (
          <Skeleton className="h-[520px] rounded-[8px]" />
        ) : (
          <AgentDetailPanel agent={selectedAgent} className="min-h-[520px]" />
        )}
      </div>

      <div className="callout-bar flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          Promote validated findings into playbook rules to close the Defender → Research feedback hop.
        </span>
        <Button asChild variant="outline" size="sm">
          <Link href="/sandbox">Test in sandbox → Promote</Link>
        </Button>
      </div>
    </PageStack>
  );
}

function cnRow(hot: boolean, selected: boolean): string {
  return [
    "cursor-pointer border-b border-border/70 transition-colors",
    selected ? "bg-card" : "hover:bg-muted",
    hot && !selected ? "bg-primary/10" : "",
  ]
    .filter(Boolean)
    .join(" ");
}
