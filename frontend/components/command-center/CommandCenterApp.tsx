"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Bot,
  ChevronRight,
  CircleAlert,
  Play,
  Plug,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { eventTimestamp, formatEventAge, computeRecentEventRate } from "@/lib/commandCenterLive";
import { verdictStatus, type VerdictStatus } from "@/lib/commandCenterUi";
import {
  buildAgentInventory,
  buildSessionChain,
  scoreChain,
} from "@/lib/commandCenterAgents";
import { isBuiltInTestEvent } from "@/lib/telemetrySource";
import type { DashboardMetrics } from "@/lib/hooks/useDashboardMetrics";
import { cn } from "@/lib/utils";

type EventRow = Record<string, unknown>;

/* ── Decision styling (Allowed / Flagged / Blocked) ─────────────────── */

const DECISION: Record<
  VerdictStatus,
  { label: string; text: string; bg: string; ring: string; dot: string; Icon: typeof ShieldCheck }
> = {
  ok: {
    label: "Allowed",
    text: "text-[hsl(var(--status-success))]",
    bg: "bg-[hsl(var(--status-success-subtle))]",
    ring: "ring-[hsl(var(--status-success-border))]",
    dot: "bg-[hsl(var(--status-success))]",
    Icon: ShieldCheck,
  },
  warn: {
    label: "Flagged",
    text: "text-[hsl(var(--status-warning))]",
    bg: "bg-[hsl(var(--status-warning-subtle))]",
    ring: "ring-[hsl(var(--status-warning-border))]",
    dot: "bg-[hsl(var(--status-warning))]",
    Icon: ShieldAlert,
  },
  block: {
    label: "Blocked",
    text: "text-[hsl(var(--status-error))]",
    bg: "bg-[hsl(var(--status-error-subtle))]",
    ring: "ring-[hsl(var(--status-error-border))]",
    dot: "bg-[hsl(var(--status-error))]",
    Icon: ShieldAlert,
  },
};

function DecisionBadge({ status, className }: { status: VerdictStatus; className?: string }) {
  const d = DECISION[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1",
        d.bg,
        d.text,
        d.ring,
        className
      )}
    >
      <d.Icon className="h-3 w-3" />
      {d.label}
    </span>
  );
}

function stableId(e: EventRow, i: number): string {
  return String(e.event_id ?? "") || String(e.id ?? "") || `${String(e.session_id ?? "")}-${i}`;
}

function isThreat(e: EventRow): boolean {
  const risk = Number(e.risk_score ?? 0);
  return risk >= 50 || /QUARANTINE|BREACH|BLOCK|KILL|DENY/i.test(String(e.verdict ?? ""));
}

function riskColor(risk: number): string {
  if (risk >= 80) return "text-[hsl(var(--status-error))]";
  if (risk >= 50) return "text-[hsl(var(--status-warning))]";
  if (risk > 0) return "text-[hsl(var(--status-success))]";
  return "text-muted-foreground";
}

/* ── Component ──────────────────────────────────────────────────────── */

export function CommandCenterApp({
  events,
  loading,
  apiOnline,
  wsConnected,
  metrics,
  selectedEvent,
  onSelect,
  onRefresh,
  onProbe,
  probeLoading,
}: {
  events: EventRow[];
  loading: boolean;
  apiOnline: boolean;
  wsConnected: boolean;
  metrics: DashboardMetrics | null;
  selectedEvent: EventRow | null;
  onSelect: (e: EventRow) => void;
  onRefresh: () => void;
  onProbe: () => void;
  probeLoading: boolean;
}) {
  const live = apiOnline && wsConnected;
  const selectedRef = useRef<HTMLButtonElement>(null);

  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [threatsOnly, setThreatsOnly] = useState(false);
  const [hideDemo, setHideDemo] = useState(true);

  const realEvents = useMemo(
    () => (hideDemo ? events.filter((e) => !isBuiltInTestEvent(e)) : events),
    [events, hideDemo]
  );

  const rows = useMemo(() => {
    let list = [...realEvents].sort((a, b) => eventTimestamp(b) - eventTimestamp(a));
    if (threatsOnly) list = list.filter(isThreat);
    if (agentFilter) list = list.filter((e) => String(e.agent_id ?? "") === agentFilter);
    return list.slice(0, 120);
  }, [realEvents, threatsOnly, agentFilter]);

  const agents = useMemo(() => buildAgentInventory(realEvents), [realEvents]);
  const threatCount = useMemo(() => realEvents.filter(isThreat).length, [realEvents]);
  const rate = useMemo(() => computeRecentEventRate(realEvents), [realEvents]);

  const selectedSessionId = String(selectedEvent?.session_id ?? "");
  const chain = useMemo(
    () => buildSessionChain(realEvents, selectedSessionId),
    [realEvents, selectedSessionId]
  );
  const chainVerdict = useMemo(() => scoreChain(chain), [chain]);

  const selectedId = selectedEvent ? stableId(selectedEvent, 0) : undefined;

  useEffect(() => {
    if (!selectedEvent) return;
    selectedRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedEvent]);

  const kpis = [
    { label: "Agents", value: String(agents.length), Icon: Bot },
    { label: "Actions", value: (metrics?.total_events ?? realEvents.length).toLocaleString(), Icon: Terminal },
    { label: "Threats", value: String(threatCount), hot: threatCount > 0, Icon: CircleAlert },
    {
      label: "Defense",
      value: metrics ? `${Math.round(metrics.defense_score ?? 0)}/100` : "—",
      Icon: Shield,
    },
  ];

  const liveLabel = live
    ? rate > 0
      ? `Live · ${rate}/min`
      : "Live"
    : apiOnline
      ? "Updating"
      : "Offline";

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background text-foreground">
      {/* Header */}
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground">Command Center</h1>
          <p className="text-[13px] text-muted-foreground">Live actions from your agents</p>
        </div>

        <LiveIndicator connected={live} label={liveLabel} className="text-[11px]" />

        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
            <Link href="/get-started">
              <Plug className="h-3.5 w-3.5" />
              API Keys
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground"
            onClick={onRefresh}
            aria-label="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-5 py-2.5">
        {kpis.map((k) => {
          const isThreats = k.label === "Threats";
          const isAgents = k.label === "Agents";
          const pressed = isThreats ? threatsOnly : isAgents ? Boolean(agentFilter) : false;
          return (
            <button
              key={k.label}
              type="button"
              onClick={() => {
                if (isThreats) setThreatsOnly((v) => !v);
                if (isAgents) setAgentFilter(null);
                if (k.label === "Actions") {
                  setThreatsOnly(false);
                  setAgentFilter(null);
                }
              }}
              title={
                isThreats
                  ? "Show only flagged or blocked actions"
                  : isAgents
                    ? "Clear agent filter"
                    : "Show all live actions"
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-left transition-colors",
                pressed ? "border-primary/40 bg-primary/10" : "border-border hover:border-border hover:bg-muted/50"
              )}
            >
              <k.Icon className={cn("h-3.5 w-3.5", k.hot ? "text-[hsl(var(--status-error))]" : "text-muted-foreground")} />
              <span className="text-[12px] font-medium text-muted-foreground">{k.label}</span>
              <span className={cn("font-mono text-[13px] font-semibold tabular-nums", k.hot ? "text-[hsl(var(--status-error))]" : "text-foreground")}>
                {k.value}
              </span>
            </button>
          );
        })}
      </div>

      {!apiOnline ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[hsl(var(--status-warning-border))] bg-[hsl(var(--status-warning-subtle))] px-4 py-1.5 text-[11px] text-[hsl(var(--status-warning))]">
          <WifiOff className="h-3.5 w-3.5" />
          Backend is offline. Live activity needs ARTSA running.
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[200px_minmax(0,1.7fr)_minmax(280px,0.95fr)]">
        <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-border lg:flex">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-[13px] font-medium text-foreground">Agents</p>
            <span className="font-mono text-[10px] text-muted-foreground">{agents.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {agents.length === 0 ? (
              <div className="p-4 text-[12px] leading-relaxed text-muted-foreground">
                No agents yet. Connect your app, or send a test from the empty feed.
              </div>
            ) : (
              <ul className="p-1.5">
                {agents.map((a) => {
                  const active = agentFilter === a.id;
                  const d = DECISION[a.status];
                  return (
                    <li key={a.id} className="mb-0.5">
                      <button
                        type="button"
                        onClick={() => setAgentFilter((cur) => (cur === a.id ? null : a.id))}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                          active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-card"
                        )}
                      >
                        <span className={cn("h-6 w-6 shrink-0 rounded-md ring-1 ring-inset", d.bg, d.ring)}>
                          <Bot className={cn("m-1 h-4 w-4", d.text)} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-foreground">{a.id}</span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            {a.events} actions
                            {a.threats > 0 ? (
                              <span className="text-[hsl(var(--status-error))]"> · {a.threats} threats</span>
                            ) : null}
                          </span>
                        </span>
                        <span className={cn("font-mono text-[12px] font-semibold tabular-nums", riskColor(a.maxRisk))}>
                          {a.maxRisk ? `${a.maxRisk}/100` : "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-foreground">Live activity</p>
              {agentFilter ? (
                <button
                  type="button"
                  onClick={() => setAgentFilter(null)}
                  className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary ring-1 ring-primary/25"
                >
                  {agentFilter} ×
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setThreatsOnly((v) => !v)}
                aria-pressed={threatsOnly}
                title="Show only flagged or blocked actions"
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium ring-1 transition-colors",
                  threatsOnly
                    ? "bg-[hsl(var(--status-error-subtle))] text-[hsl(var(--status-error))] ring-[hsl(var(--status-error-border))]"
                    : "text-muted-foreground ring-border hover:text-foreground"
                )}
              >
                {threatsOnly ? "Showing threats" : `Threats${threatCount > 0 ? ` (${threatCount})` : ""}`}
              </button>
              <button
                type="button"
                onClick={() => setHideDemo((v) => !v)}
                aria-pressed={!hideDemo}
                title="Include built-in sample events in this feed"
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium ring-1 transition-colors",
                  hideDemo ? "text-muted-foreground ring-border hover:text-foreground" : "bg-primary/10 text-primary ring-primary/25"
                )}
              >
                {hideDemo ? "Show samples" : "Hide samples"}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {loading && !rows.length ? (
              <div className="space-y-1.5 p-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-11 animate-pulse rounded-lg bg-card" />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 p-10 text-center">
                <Shield className="h-8 w-8 text-muted-foreground" />
                <p className="text-[13px] font-medium">Nothing to review yet</p>
                <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
                  Connect your app so every action appears here — or send a test to see a block in this session.
                </p>
                <div className="flex gap-2">
                  <Button asChild size="sm" className="h-9 gap-1.5">
                    <Link href="/get-started">
                      <Plug className="h-3.5 w-3.5" />
                      Connect your app
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9"
                    disabled={probeLoading || !apiOnline}
                    onClick={onProbe}
                  >
                    {probeLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    Send a test
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="p-1.5">
                {rows.map((e, i) => {
                  const id = stableId(e, i);
                  const risk = Number(e.risk_score ?? 0);
                  const status = verdictStatus(String(e.verdict ?? ""), risk);
                  const active = selectedId === id;
                  const testEvent = isBuiltInTestEvent(e);
                  return (
                    <li key={id} className="mb-0.5">
                      <button
                        ref={active ? selectedRef : undefined}
                        type="button"
                        onClick={() => onSelect(e)}
                        className={cn(
                          "grid w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                          active ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-card"
                        )}
                      >
                        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">{formatEventAge(e)}</span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[12px] font-medium text-foreground">
                              {String(e.tool_name ?? e.event_type ?? "request")}
                            </span>
                            {testEvent ? (
                              <span className="rounded bg-primary/10 px-1 text-[8px] font-semibold uppercase text-primary ring-1 ring-primary/25">
                                test
                              </span>
                            ) : null}
                          </span>
                          <span className="block truncate text-[12px] text-muted-foreground">
                            <Bot className="mr-0.5 inline h-3 w-3" />
                            {String(e.agent_id ?? "—")}
                          </span>
                        </span>
                        <DecisionBadge status={status} />
                        <span className={cn("font-mono text-[12px] font-semibold tabular-nums", riskColor(risk))}>
                          {risk ? `${risk}/100` : "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-[13px] font-medium text-foreground">Event details</p>
            {chain.length > 0 ? (
              <span className="font-mono text-[10px] text-muted-foreground">{chain.length} steps</span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 [scrollbar-width:thin]">
            {!selectedEvent ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <ChevronRight className="h-6 w-6 text-muted-foreground" aria-hidden />
                <p className="text-[13px] font-medium text-foreground">Select an action</p>
                <p className="max-w-[220px] text-[13px] leading-relaxed text-muted-foreground">
                  Click a row to see who ran it and every step in the session.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Identity correlation */}
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-[12px] text-muted-foreground">Who</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Bot className="h-4 w-4 text-primary" />
                    <span className="text-[13px] font-medium">{String(selectedEvent.agent_id ?? "agent")}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <p className="text-muted-foreground">Session</p>
                      <p className="truncate font-mono text-foreground">{selectedSessionId || "—"}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Tool</p>
                      <p className="truncate font-mono text-foreground">{String(selectedEvent.tool_name ?? "—")}</p>
                    </div>
                  </div>
                </div>

                {/* Chain-level verdict */}
                {chain.length > 0 ? (
                  <div
                    className={cn(
                      "rounded-lg p-3 ring-1",
                      DECISION[chainVerdict.status].bg,
                      DECISION[chainVerdict.status].ring
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-medium text-muted-foreground">This session</p>
                      <DecisionBadge status={chainVerdict.status} />
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className={cn("font-mono text-[22px] font-semibold tabular-nums", riskColor(chainVerdict.score))}>
                        {chainVerdict.score}/100
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        peak {chainVerdict.peak}
                        {chainVerdict.escalated ? " · escalating" : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                      Score for the whole session — one step can look safe while the combined outcome is not.
                    </p>
                  </div>
                ) : null}

                {/* Chain steps */}
                <div>
                  <p className="mb-1.5 text-[12px] font-medium text-muted-foreground">Steps</p>
                  <ol className="space-y-1.5">
                    {chain.map((step, i) => {
                      const stepActive = step.id === selectedId;
                      return (
                        <li key={step.id} className="relative pl-5">
                          <span className={cn("absolute left-1 top-2 h-2 w-2 rounded-full", DECISION[step.status].dot)} />
                          {i < chain.length - 1 ? (
                            <span className="absolute left-[7px] top-4 h-full w-px bg-border" />
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              const match = realEvents.find(
                                (e, idx) => stableId(e, idx) === step.id
                              );
                              if (match) onSelect(match);
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                              stepActive ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-card"
                            )}
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] text-foreground">{step.toolName}</span>
                              <span className="block text-[10px] text-muted-foreground">step {i + 1}</span>
                            </span>
                            <DecisionBadge status={step.status} />
                            <span className={cn("font-mono text-[11px] font-semibold tabular-nums", riskColor(step.risk))}>
                              {step.risk}/100
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
