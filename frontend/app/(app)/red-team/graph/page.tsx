"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { OutcomeBadge } from "@/components/red-team/OutcomeBadge";
import { LiveOutcomeStrip } from "@/components/red-team/LiveOutcomeStrip";
import { KpiTile } from "@/components/red-team/KpiTile";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { useCampaignTranscript } from "@/lib/hooks/useCampaignTranscript";
import {
  buildAttackGraph,
  type GraphStageId,
  type StageAggregate,
  type StageTone,
} from "@/lib/redTeamAttackGraph";
import { cn } from "@/lib/utils";

const TONE_RING: Record<StageTone, string> = {
  idle: "border-border bg-muted/20 text-muted-foreground",
  contained:
    "border-[hsl(var(--severity-low-border))] bg-[hsl(var(--severity-low-subtle))] text-foreground",
  risk: "border-[hsl(var(--severity-medium-border))] bg-[hsl(var(--severity-medium-subtle))] text-foreground",
  breached:
    "border-[hsl(var(--severity-critical-border))] bg-[hsl(var(--severity-critical-subtle))] text-foreground",
};

const TONE_DOT: Record<StageTone, string> = {
  idle: "bg-muted-foreground/40",
  contained: "bg-[hsl(var(--severity-low))]",
  risk: "bg-[hsl(var(--severity-medium))]",
  breached: "bg-[hsl(var(--severity-critical))]",
};

function StageNode({
  stage,
  selected,
  onSelect,
}: {
  stage: StageAggregate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-md border px-3 py-2.5 text-left transition-colors",
        TONE_RING[stage.tone],
        selected && "ring-1 ring-foreground/35"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[stage.tone])} />
            <p className="truncate text-[13px] font-medium">{stage.def.label}</p>
          </div>
          <p className="mt-1 pl-4 text-[11px] text-muted-foreground">{stage.def.control}</p>
        </div>
        <div className="shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
          {stage.tested === 0 ? (
            <span>Untested</span>
          ) : (
            <>
              <span className="text-foreground">{stage.tested}</span>
              {stage.breached > 0 ? (
                <span className="ml-1 text-[hsl(var(--severity-critical))]">{stage.breached}×</span>
              ) : null}
            </>
          )}
        </div>
      </div>
    </button>
  );
}

function AttackGraphInner() {
  const search = useSearchParams();
  const router = useRouter();
  const campaignQ = search.get("campaign");
  const stageQ = (search.get("stage") as GraphStageId | null) || null;

  const { campaigns, loading: campaignsLoading } = useCampaigns();
  const campaign =
    campaigns.find((c) => c.id === campaignQ) ??
    campaigns.find((c) => {
      const s = String(c.status).toUpperCase();
      return s === "COMPLETED" || s === "RUNNING" || s === "FAILED";
    }) ??
    campaigns[0];

  const summary = (campaign?.summary as Record<string, unknown> | undefined) ?? null;
  const { turns, loading: turnsLoading } = useCampaignTranscript(campaign?.id ?? null, summary);

  const graph = useMemo(() => buildAttackGraph(turns), [turns]);
  const [selected, setSelected] = useState<GraphStageId>(stageQ || "outcome");

  useEffect(() => {
    if (stageQ && GRAPH_IDS.has(stageQ)) setSelected(stageQ);
  }, [stageQ]);

  const active = graph.stages.find((s) => s.id === selected) ?? graph.stages[graph.stages.length - 1];

  const setCampaign = (id: string) => {
    const q = new URLSearchParams(search.toString());
    q.set("campaign", id);
    router.replace(`/red-team/graph?${q.toString()}`, { scroll: false });
  };

  const selectStage = (id: GraphStageId) => {
    setSelected(id);
    const q = new URLSearchParams(search.toString());
    if (campaign?.id) q.set("campaign", campaign.id);
    q.set("stage", id);
    router.replace(`/red-team/graph?${q.toString()}`, { scroll: false });
  };

  const aggregateAxes = useMemo(() => {
    if (!active || active.hits.length === 0) {
      return { detection: "detected", prevention: "prevented", leak: "none" };
    }
    const det = active.hits.some((h) => h.detection === "missed")
      ? "missed"
      : active.hits.some((h) => h.detection === "late")
        ? "late"
        : "detected";
    const prev = active.hits.some((h) => h.prevention === "failed")
      ? "failed"
      : active.hits.some((h) => h.prevention === "partial")
        ? "partial"
        : "prevented";
    const leak = active.hits.some((h) => h.leak === "confirmed")
      ? "confirmed"
      : active.hits.some((h) => h.leak === "attempted")
        ? "attempted"
        : "none";
    return { detection: det, prevention: prev, leak };
  }, [active]);

  if (campaignsLoading && campaigns.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="max-w-xl text-[13px] text-muted-foreground">
            How this campaign moved across stages — retest a hot stage in Attack Lab.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="graph-campaign">
            Campaign
          </label>
          <select
            id="graph-campaign"
            className="h-8 max-w-[220px] rounded-md border border-border bg-background px-2 text-[12px]"
            value={campaign?.id ?? ""}
            onChange={(e) => setCampaign(e.target.value)}
            disabled={campaigns.length === 0}
          >
            {campaigns.length === 0 ? (
              <option value="">No campaigns</option>
            ) : (
              campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))
            )}
          </select>
          {campaign ? (
            <Button asChild size="sm">
              <Link href={`/red-team/monitor/${campaign.id}?follow=1`}>Open theater</Link>
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href="/red-team/lab">Retest in Lab</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/red-team/campaigns/new">Launch</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Rounds mapped" value={turns.length || "—"} hint="From selected campaign" />
        <KpiTile
          label="Contained"
          value={graph.pathContained}
          tone="success"
          hint="Pass at outcome"
        />
        <KpiTile
          label="Risk / fail"
          value={graph.pathBreaches + graph.pathRisks}
          tone={graph.pathBreaches + graph.pathRisks > 0 ? "warning" : "neutral"}
          hint="Boundary pressure"
        />
        <KpiTile
          label="Confirmed leaks"
          value={graph.criticalLeaks}
          tone={graph.criticalLeaks > 0 ? "critical" : "neutral"}
          hint="Data left the boundary"
        />
      </div>

      {campaigns.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-8 text-center text-[13px] text-muted-foreground">
          No campaign data yet.{" "}
          <Link href="/red-team/lab" className="underline-offset-2 hover:underline">
            Run Attack Lab
          </Link>{" "}
          to populate the path.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          {/* Kill chain */}
          <section className="rounded-md border border-border p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Control-plane path
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Contained · Risk · Breached · Untested
              </p>
            </div>

            {turnsLoading && turns.length === 0 ? (
              <Skeleton className="h-72 w-full" />
            ) : (
              <ol className="space-y-1.5">
                {graph.stages.map((stage, i) => (
                  <li key={stage.id}>
                    <StageNode
                      stage={stage}
                      selected={selected === stage.id}
                      onSelect={() => selectStage(stage.id)}
                    />
                    {i < graph.stages.length - 1 ? (
                      <div
                        className="flex items-center gap-2 py-0.5 pl-5 text-[10px] text-muted-foreground"
                        aria-hidden
                      >
                        <span className="h-3 w-px bg-border" />
                        <span>
                          {stage.tested > 0 && graph.stages[i + 1].tested > 0
                            ? `${Math.min(stage.tested, graph.stages[i + 1].tested)} rounds progressed →`
                            : "↓"}
                        </span>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Inspector */}
          <aside className="space-y-4 rounded-md border border-border p-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Stage inspector
              </h3>
              <p className="mt-2 text-[14px] font-medium">{active?.def.label}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{active?.def.question}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Control owner: <span className="text-foreground">{active?.def.control}</span>
              </p>
            </div>

            <LiveOutcomeStrip
              detection={aggregateAxes.detection}
              prevention={aggregateAxes.prevention}
              leak={aggregateAxes.leak}
            />

            <div>
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rounds at this stage
              </h4>
              {!active || active.hits.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-[12px] text-muted-foreground">
                  No rounds reached this control plane in the selected campaign.
                </p>
              ) : (
                <ul className="max-h-[280px] space-y-1 overflow-y-auto">
                  {active.hits
                    .slice()
                    .reverse()
                    .slice(0, 24)
                    .map((hit) => (
                      <li key={`${hit.turn.roundNumber}-${hit.turn.attackName}`}>
                        <Link
                          href={
                            campaign
                              ? `/red-team/monitor/${campaign.id}?round=${hit.turn.roundNumber}&follow=0`
                              : "#"
                          }
                          className="flex items-start justify-between gap-2 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/30"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium">
                              R{hit.turn.roundNumber} · {hit.turn.attackName || hit.turn.category}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                              {hit.turn.asiCode ? `${hit.turn.asiCode} · ` : ""}
                              {hit.turn.category || "—"}
                            </p>
                          </div>
                          <OutcomeBadge value={hit.result} kind="result" />
                        </Link>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {campaign ? (
              <p className="text-[11px] text-muted-foreground">
                Evidence trail →{" "}
                <Link
                  href={`/red-team/evidence?campaign=${campaign.id}`}
                  className="underline-offset-2 hover:underline"
                >
                  Evidence
                </Link>
                {" · "}
                <Link
                  href={`/red-team/findings`}
                  className="underline-offset-2 hover:underline"
                >
                  Findings
                </Link>
              </p>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}

const GRAPH_IDS = new Set<GraphStageId>([
  "input",
  "technique",
  "agent",
  "tool",
  "data",
  "outcome",
]);

export default function AttackGraphPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <AttackGraphInner />
    </Suspense>
  );
}
