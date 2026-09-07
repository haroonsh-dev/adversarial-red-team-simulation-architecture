"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Lock, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PIPELINE_AGENT_BY_ID,
  statusLabel,
  type PipelineAgentId,
} from "@/lib/agentRoles";
import type { AgentRuntimeState } from "@/lib/pipelineState";
import {
  chainPosition,
  hopFromAgent,
  nextAgent,
  previousAgent,
} from "@/lib/pipelineChain";
import { cn } from "@/lib/utils";

interface AgentDetailPanelProps {
  agent: AgentRuntimeState | null;
  className?: string;
}

export function AgentDetailPanel({ agent, className }: AgentDetailPanelProps) {
  if (!agent) {
    return (
      <aside
        className={cn(
          "flex min-h-[420px] flex-col rounded-[8px] border border-border bg-card",
          className
        )}
      >
        <header className="border-b border-border px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.85px] text-[#67b3ef]">
            Chain inspector
          </p>
          <h3 className="mt-1 text-[15px] font-medium text-foreground">Select a hop</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Inspect handoff, integrity, and downstream chaining.
          </p>
        </header>
      </aside>
    );
  }

  const def = PIPELINE_AGENT_BY_ID[agent.id];
  const hop = hopFromAgent(agent.id);
  const prev = previousAgent(agent.id);
  const next = nextAgent(agent.id);
  const pos = chainPosition(agent.id);

  return (
    <aside
      className={cn(
        "flex min-h-[420px] flex-col rounded-[8px] border border-border bg-card",
        className
      )}
    >
      <header className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.85px] text-[#67b3ef]">
          Chain inspector · hop {pos}/6
        </p>
        <h3 className="mt-1 text-[15px] font-medium tracking-[-0.19px] text-foreground">
          {def.label}
        </h3>
        <p className="mt-1 text-[12px] text-muted-foreground">{def.headline}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {statusLabel(agent.status)}
          </Badge>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase">
            {hop.edgeTag}
          </Badge>
        </div>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Current task
          </p>
          <p className="text-[13px] text-foreground">{agent.currentTask}</p>
        </div>

        <div className="rounded-[6px] border border-border bg-background px-3 py-2.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Handoff chain
          </p>
          <div className="mt-2 flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">{PIPELINE_AGENT_BY_ID[prev].label}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            <span className="font-medium text-foreground">{def.label}</span>
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">{PIPELINE_AGENT_BY_ID[next].label}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{hop.label}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="Last run" value={agent.lastRun ?? "—"} />
          <div className="rounded-[6px] border border-border bg-background px-2.5 py-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              Integrity
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-foreground">
              {agent.hmacVerified === true ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#4ade80]" aria-hidden />
                  HMAC ok
                </>
              ) : agent.hmacVerified === false ? (
                <>
                  <ShieldAlert className="h-3.5 w-3.5 text-[hsl(var(--severity-high))]" aria-hidden />
                  Mismatch
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  N/A
                </>
              )}
            </div>
          </div>
        </div>

        <p className="text-[12px] leading-relaxed text-muted-foreground">{def.description}</p>

        <div className="space-y-2 border-t border-border pt-3">
          {agent.id === "redteam" && (
            <Button asChild size="sm" className="w-full justify-start">
              <Link href="/campaigns">Open Red Team</Link>
            </Button>
          )}
          {agent.id === "defender" && (
            <Button asChild size="sm" variant="outline" className="w-full justify-start">
              <Link href="/admin/policies">View playbook</Link>
            </Button>
          )}
          {agent.id === "curator" && (
            <Button asChild size="sm" variant="outline" className="w-full justify-start">
              <Link href="/library">Attack library</Link>
            </Button>
          )}
          {agent.id === "target" && (
            <Button asChild size="sm" variant="outline" className="w-full justify-start">
              <Link href="/sandbox">Scan payload</Link>
            </Button>
          )}
          {agent.id === "judge" && (
            <Button asChild size="sm" variant="outline" className="w-full justify-start">
              <Link href="/findings">Findings custody</Link>
            </Button>
          )}
          {agent.id === "research" && (
            <Button asChild size="sm" variant="outline" className="w-full justify-start">
              <Link href="/analytics">Security analytics</Link>
            </Button>
          )}
        </div>
      </div>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[6px] border border-border bg-background px-2.5 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-[12px] text-foreground">{value}</p>
    </div>
  );
}

export function AgentDetailPanelHeader({ agentId }: { agentId: PipelineAgentId }) {
  return <span className="text-sm font-medium">{PIPELINE_AGENT_BY_ID[agentId].label}</span>;
}
