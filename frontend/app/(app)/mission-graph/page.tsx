"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { CommandCenterAgentPanel } from "@/components/command-center/CommandCenterAgentPanel";
import { CommandCenterDetectionChart } from "@/components/command-center/CommandCenterDetectionChart";
import { CommandCenterFeed } from "@/components/command-center/CommandCenterFeed";
import { CommandCenterVitals } from "@/components/command-center/CommandCenterVitals";
import { useDashboardMetrics } from "@/lib/context/DashboardMetricsProvider";
import {
  AGENT_RING_ORDER,
  AGENT_SHORT,
  SIX_AGENTS,
  deriveAgentStatuses,
  deriveDetectionSeries,
  deriveGraphModel,
  deriveMissionPosture,
  deriveVitals,
  filterEventsByWindow,
  recentActiveHops,
  statusColor,
  telemetryToAgentEvents,
  type AgentSeverity,
  type CommandTimeWindow,
} from "@/lib/commandCenterOps";
import { cn } from "@/lib/utils";

const CommandCenterGraph = dynamic(
  () =>
    import("@/components/command-center/CommandCenterGraph").then((m) => m.CommandCenterGraph),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-background font-mono text-[11px] text-muted-foreground">
        Initializing mission ring…
      </div>
    ),
  }
);

/** Mission graph — live ingest telemetry only, hot paths, blotter. */
export default function CommandCenterOpsPage() {
  const { liveEvents, connected: wsLive } = useDashboardMetrics();

  const [timeWindow, setTimeWindow] = useState<CommandTimeWindow>("15m");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [severityFloor, setSeverityFloor] = useState<AgentSeverity | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const liveMapped = useMemo(() => telemetryToAgentEvents(liveEvents), [liveEvents]);
  const windowed = useMemo(
    () => filterEventsByWindow(liveMapped, timeWindow),
    [liveMapped, timeWindow]
  );
  const vitals = useMemo(() => deriveVitals(windowed), [windowed]);
  const series = useMemo(() => deriveDetectionSeries(windowed), [windowed]);
  const graph = useMemo(
    () => deriveGraphModel(windowed, agentFilter, severityFloor),
    [windowed, agentFilter, severityFloor]
  );
  const statuses = useMemo(() => deriveAgentStatuses(windowed), [windowed]);
  const mission = useMemo(() => deriveMissionPosture(windowed), [windowed]);
  const activeHops = useMemo(() => recentActiveHops(windowed), [windowed]);

  // Vital Detection Rate and chart tip share the same live series tip.
  const detectionSynced = series[series.length - 1]?.artsa ?? vitals.detectionRate;
  const vitalsLive = useMemo(
    () => ({ ...vitals, detectionRate: detectionSynced }),
    [vitals, detectionSynced]
  );
  const blotterEvents = useMemo(() => {
    const sevRank = { info: 0, warning: 1, critical: 2 } as const;
    const floor = severityFloor === "all" ? -1 : sevRank[severityFloor];
    return windowed.filter((e) => {
      if (severityFloor !== "all" && sevRank[e.severity ?? "info"] < floor) return false;
      if (
        agentFilter !== "all" &&
        e.sourceAgent !== agentFilter &&
        e.targetAgent !== agentFilter
      ) {
        return false;
      }
      return true;
    });
  }, [windowed, agentFilter, severityFloor]);

  const lastByAgent = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of windowed) {
      if (!map[e.sourceAgent]) map[e.sourceAgent] = e.message;
      if (e.targetAgent && !map[e.targetAgent]) map[e.targetAgent] = e.message;
    }
    return map;
  }, [windowed]);

  const hasTraffic = liveMapped.length > 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedId(null);
    };
    globalThis.window.addEventListener("keydown", onKey);
    return () => globalThis.window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="-mx-4 -mb-6 flex h-[calc(100vh-4.5rem)] min-h-[740px] flex-col overflow-hidden bg-background text-foreground">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="page-title">Agents</h1>
        <p className="page-lead mt-1">Each agent ARTSA is watching, and how they connect.</p>
      </div>
      <div className="h-[12%] min-h-[100px] shrink-0">
        <CommandCenterVitals
          vitals={vitalsLive}
          connected={wsLive}
          posture={mission.posture}
          headline={mission.headline}
          onPostureClick={(p) => {
            if (p === "critical") setSeverityFloor("critical");
            else if (p === "elevated") setSeverityFloor("warning");
            else setSeverityFloor("all");
          }}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.9fr)]">
        <section className="relative flex min-h-0 flex-col border-r border-zinc-900">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5">
            <p className="mr-1 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Agents
            </p>
            <span
              className={cn(
                "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide",
                hasTraffic
                  ? "border-emerald-500/40 text-emerald-400"
                  : "border-border text-muted-foreground"
              )}
            >
              {hasTraffic ? `LIVE INGEST · ${liveMapped.length}` : "NO TRAFFIC"}
            </span>
            <FilterGroup
              label="Window"
              value={timeWindow}
              options={[
                ["5m", "5m"],
                ["15m", "15m"],
                ["1h", "1h"],
              ]}
              onChange={(v) => setTimeWindow(v as CommandTimeWindow)}
            />
            <FilterGroup
              label="Agent"
              value={agentFilter}
              options={[["all", "ALL"], ...SIX_AGENTS.map((a) => [a, a] as const)]}
              onChange={setAgentFilter}
            />
            <FilterGroup
              label="Sev"
              value={severityFloor}
              options={[
                ["all", "ALL"],
                ["info", "INFO+"],
                ["warning", "WARN+"],
                ["critical", "CRIT"],
              ]}
              onChange={(v) => setSeverityFloor(v as AgentSeverity | "all")}
            />
            <div className="ml-auto flex flex-wrap gap-1">
              {AGENT_RING_ORDER.map((id) => {
                const st = statuses[id] ?? "nominal";
                return (
                  <button
                    key={id}
                    type="button"
                    title={`${id} · ${st}`}
                    onClick={() => setSelectedId(id)}
                    className={cn(
                      "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide",
                      selectedId === id
                        ? "border-zinc-400 text-foreground"
                        : "border-border text-muted-foreground hover:border-zinc-600 hover:text-foreground/80"
                    )}
                    style={{
                      boxShadow: `inset 0 -1px 0 ${statusColor(st)}`,
                    }}
                  >
                    {AGENT_SHORT[id]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <CommandCenterGraph
              nodes={graph.nodes}
              links={graph.links}
              selectedId={selectedId}
              onSelect={setSelectedId}
              lastByAgent={lastByAgent}
              activeHops={activeHops}
            />
            {selectedId ? (
              <CommandCenterAgentPanel
                agentId={selectedId}
                status={statuses[selectedId] ?? "nominal"}
                events={windowed}
                onClose={() => setSelectedId(null)}
              />
            ) : null}
          </div>
        </section>

        <aside className="min-h-0">
          <CommandCenterFeed events={blotterEvents} onSelectAgent={setSelectedId} />
        </aside>
      </div>

      <div className="h-[18%] min-h-[150px] shrink-0">
        <CommandCenterDetectionChart series={series} liveRate={detectionSynced} />
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<readonly [string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-[9px] uppercase text-zinc-600">{label}</span>
      <div className="flex gap-0.5 rounded-sm border border-border bg-background/60 p-0.5">
        {options.map(([id, text]) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "rounded-sm px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide",
              value === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground/80"
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
