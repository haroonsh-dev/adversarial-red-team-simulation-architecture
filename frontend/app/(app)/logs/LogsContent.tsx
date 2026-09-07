"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ScrollText,
  Search,
  FileCode,
  X,
  Loader2,
  Download,
  Pause,
  Play,
  Shield,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DetectSubNav } from "@/components/red-team/DetectSubNav";
import { DashboardCard } from "@/components/shared/DashboardCard";
import type { TelemetryEvent } from "@/components/shared/LiveTelemetryStream";
import { StatCard } from "@/components/shared/StatCard";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardMetrics } from "@/lib/hooks/useDashboardMetrics";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { fetchFromBackend } from "@/lib/api";
import { severityFromScore, type SeverityLabel } from "@/lib/severity";
import { READINESS_UI } from "@/lib/getStartedLabels";
import type { Session, ToolCallEvent } from "@/lib/types";
import { PageStack } from "@/components/shared/PageStack";
import { LogsSetupEmpty } from "@/components/logs/LogsSetupEmpty";
import { SecurityEventTable } from "@/components/logs/SecurityEventTable";
import { SecurityEventInspector } from "@/components/logs/SecurityEventInspector";
import { SessionLayerStrip } from "@/components/shared/SessionLayerStrip";
import {
  downloadSecurityExport,
  filterSecurityRows,
  toSecurityLogRows,
  type ActionFilter,
  type SecurityLogRow,
} from "@/lib/securityLog";
import { cn } from "@/lib/utils";

type SeverityFilter = "all" | SeverityLabel;

interface TimelineEntry {
  event: ToolCallEvent;
  evaluation?: Record<string, unknown> | null;
}

type LogEvent = TelemetryEvent;

const MAX_ROWS = 500;

function timelineToLogEvent(entry: TimelineEntry): LogEvent {
  const evt = entry.event;
  const evaluation = entry.evaluation ?? {};
  const risk =
    typeof evaluation.risk_score === "number"
      ? evaluation.risk_score
      : typeof evaluation.overall_score === "number"
        ? evaluation.overall_score
        : 0;
  return {
    event_id: evt.id,
    session_id: evt.session_id,
    tool_name: evt.tool_name,
    risk_score: risk,
    verdict: String(evaluation.verdict ?? ""),
    action: String(evaluation.recommended_action ?? ""),
    triggered_at: evt.timestamp,
    agent_id: evt.agent_id,
    layer_scores: evaluation.layer_scores,
    rule_based_score: evaluation.rule_based_score,
    semantic_score: evaluation.semantic_score,
    injection_score: evaluation.injection_score,
  };
}

export default function LogsContent() {
  const searchParams = useSearchParams();
  const sessionParam = searchParams.get("session")?.trim() ?? "";
  const agentParam = searchParams.get("agent")?.trim() ?? "";

  const { liveEvents, loading, metrics, pullTelemetryRecent, connected } = useDashboardMetrics();
  const { apiOnline, wsConnected } = useConnection();
  const [query, setQuery] = useState(agentParam);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [sessionDetail, setSessionDetail] = useState<Session | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<LogEvent[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frozenEvents, setFrozenEvents] = useState<LogEvent[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (agentParam) {
      setQuery(agentParam);
    }
  }, [agentParam]);

  useEffect(() => {
    if (!apiOnline || sessionParam) return;
    void pullTelemetryRecent(true);
    // When WS is live, events arrive in ms — skip aggressive REST spam.
    // When WS is down, poll every 400ms so the stream still feels instant.
    if (connected || wsConnected) return;
    const id = window.setInterval(() => {
      if (!paused) void pullTelemetryRecent(true);
    }, 400);
    return () => window.clearInterval(id);
  }, [apiOnline, sessionParam, pullTelemetryRecent, paused, connected, wsConnected]);

  const loadSession = useCallback(async (sessionId: string) => {
    setSessionLoading(true);
    const [session, timeline] = await Promise.all([
      fetchFromBackend<Session>(`/api/v1/sessions/${sessionId}`, { silent: true }),
      fetchFromBackend<TimelineEntry[]>(`/api/v1/sessions/${sessionId}/timeline`, { silent: true }),
    ]);
    setSessionDetail(session ?? null);
    if (Array.isArray(timeline) && timeline.length) {
      setTimelineEvents(timeline.map(timelineToLogEvent));
    } else {
      setTimelineEvents([]);
    }
    setSessionLoading(false);
  }, []);

  useEffect(() => {
    if (!sessionParam) {
      setSessionDetail(null);
      setTimelineEvents([]);
      return;
    }
    void loadSession(sessionParam);
  }, [sessionParam, loadSession]);

  const liveBaseEvents = useMemo(() => {
    const stream = liveEvents as LogEvent[];
    if (!sessionParam) return stream;

    const filteredStream = stream.filter(
      (e) => String(e.session_id ?? "") === sessionParam
    );

    if (timelineEvents.length > 0) {
      const byId = new Map<string, LogEvent>();
      for (const e of [...timelineEvents, ...filteredStream]) {
        const id = String(e.event_id ?? e.id ?? "");
        if (id) byId.set(id, e);
        else byId.set(`anon-${byId.size}`, e);
      }
      return Array.from(byId.values()).sort((a, b) =>
        String(a.triggered_at ?? a.ts ?? "").localeCompare(String(b.triggered_at ?? b.ts ?? ""))
      );
    }

    return filteredStream;
  }, [liveEvents, sessionParam, timelineEvents]);

  const baseEvents = paused && frozenEvents ? frozenEvents : liveBaseEvents;

  const togglePause = () => {
    if (paused) {
      setFrozenEvents(null);
      setPaused(false);
      return;
    }
    setFrozenEvents(liveBaseEvents);
    setPaused(true);
  };

  const rows = useMemo(() => toSecurityLogRows(baseEvents).slice(0, MAX_ROWS), [baseEvents]);

  const filteredRows = useMemo(
    () =>
      filterSecurityRows(rows, {
        query,
        severity: severityFilter,
        action: actionFilter,
      }),
    [rows, query, severityFilter, actionFilter]
  );

  const selected = useMemo(
    () => filteredRows.find((r) => r.id === selectedId) ?? null,
    [filteredRows, selectedId]
  );

  const counts = metrics?.severity_counts ?? { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };

  const actionCounts = useMemo(() => {
    const c = { KILL: 0, QUARANTINE: 0, FLAG: 0, ALLOW: 0 };
    for (const r of rows) {
      if (r.action === "KILL") c.KILL += 1;
      else if (r.action === "QUARANTINE") c.QUARANTINE += 1;
      else if (r.action === "FLAG" || r.action === "ESCALATE") c.FLAG += 1;
      else if (r.action === "ALLOW") c.ALLOW += 1;
    }
    return c;
  }, [rows]);

  const sessionEvaluation = useMemo(() => {
    if (!timelineEvents.length) return null;
    const latest = timelineEvents[timelineEvents.length - 1];
    return {
      verdict: String(latest.verdict ?? ""),
      risk_score: Number(latest.risk_score ?? 0),
      layer_scores: latest.layer_scores as Record<string, unknown> | undefined,
      rule_based_score: latest.rule_based_score,
      semantic_score: latest.semantic_score,
      injection_score: latest.injection_score,
    } as Record<string, unknown>;
  }, [timelineEvents]);

  const onSelectRow = (row: SecurityLogRow) => setSelectedId(row.id);

  return (
    <PageStack>
      <PageHeader
        title="Activity"
        description="Every agent action ARTSA checked — how risky it looked, and what we did."
        icon={<ScrollText className="h-5 w-5" />}
        badge={<LiveIndicator connected={apiOnline && wsConnected && !paused} className="meta-badge" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={togglePause}
              disabled={baseEvents.length === 0 && !paused}
            >
              {paused ? (
                <>
                  <Play className="h-3.5 w-3.5" aria-hidden />
                  Resume live
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" aria-hidden />
                  Pause
                </>
              )}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/replay">
                <FileCode className="h-4 w-4" />
                Sessions
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={filteredRows.length === 0}
              onClick={() => downloadSecurityExport(filteredRows, "ndjson")}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export NDJSON
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={filteredRows.length === 0}
              onClick={() => downloadSecurityExport(filteredRows, "csv")}
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Export CSV
            </Button>
          </div>
        }
      />

      <DetectSubNav />

      {sessionParam && (
        <div
          className={cn(
            "rounded-[8px] border border-border bg-card p-4 sm:flex sm:items-center sm:justify-between sm:gap-4"
          )}
        >
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#67b3ef]">
              {READINESS_UI.sessionFocus}
            </p>
            <p className="mt-1 truncate font-mono text-sm text-foreground">{sessionParam}</p>
            {sessionLoading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading session…
              </p>
            ) : sessionDetail ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
                  {sessionDetail.agent_id}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {sessionDetail.status}
                </Badge>
                <SeverityBadge severity={severityFromScore(sessionDetail.max_risk_score)} />
                <span className="text-xs text-muted-foreground">
                  Peak risk {sessionDetail.max_risk_score.toFixed(0)}/100
                </span>
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">
                {READINESS_UI.noEventsForSession}
              </p>
            )}
            <SessionLayerStrip evaluation={sessionEvaluation} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 sm:mt-0">
            <Button asChild size="sm">
              <Link href={`/replay?session=${encodeURIComponent(sessionParam)}`}>
                <FileCode className="h-4 w-4" />
                {READINESS_UI.viewReplay}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/logs">
                <X className="h-4 w-4" />
                {READINESS_UI.showAllSessions}
              </Link>
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Critical"
          value={counts.CRITICAL ?? 0}
          severity="CRITICAL"
          onClick={() => setSeverityFilter("CRITICAL")}
        />
        <StatCard
          label="High"
          value={counts.HIGH ?? 0}
          severity="HIGH"
          onClick={() => setSeverityFilter("HIGH")}
        />
        <StatCard
          label="Quarantine / Kill"
          value={actionCounts.KILL + actionCounts.QUARANTINE}
          icon={Shield}
          subtitle={`${actionCounts.KILL} stopped · ${actionCounts.QUARANTINE} held for review`}
          onClick={() => setActionFilter("QUARANTINE")}
        />
        <StatCard
          label={sessionParam ? "This session" : "Events in view"}
          value={rows.length}
          icon={ScrollText}
          subtitle={paused ? "Frozen snapshot" : "Click to clear filters"}
          onClick={() => {
            setSeverityFilter("all");
            setActionFilter("all");
            setQuery("");
          }}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <DashboardCard
          title="Containment events"
          description="Filter by severity or action · search agent, tool, session, event id"
          contentClassName="space-y-3 !p-0"
        >
          <div className="space-y-3 border-b border-border px-4 pt-1 pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative max-w-md flex-1">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search agent, tool, session, event id…"
                  className="pl-9"
                  aria-label="Search security log"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Tabs
                  value={severityFilter}
                  onValueChange={(v) => setSeverityFilter(v as SeverityFilter)}
                >
                  <TabsList>
                    <TabsTrigger value="all" className="text-xs">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="CRITICAL" className="text-xs">
                      Crit
                    </TabsTrigger>
                    <TabsTrigger value="HIGH" className="text-xs">
                      High
                    </TabsTrigger>
                    <TabsTrigger value="MEDIUM" className="text-xs">
                      Med
                    </TabsTrigger>
                    <TabsTrigger value="LOW" className="text-xs">
                      Low
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs
                  value={actionFilter}
                  onValueChange={(v) => setActionFilter(v as ActionFilter)}
                >
                  <TabsList>
                    <TabsTrigger value="all" className="text-xs">
                      Any action
                    </TabsTrigger>
                    <TabsTrigger value="KILL" className="text-xs">
                      Kill
                    </TabsTrigger>
                    <TabsTrigger value="QUARANTINE" className="text-xs">
                      Quarantine
                    </TabsTrigger>
                    <TabsTrigger value="FLAG" className="text-xs">
                      Flag
                    </TabsTrigger>
                    <TabsTrigger value="ALLOW" className="text-xs">
                      Allow
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <span>
                Showing {filteredRows.length} of {rows.length}
                {sessionParam ? " · session scoped" : ""}
                {paused ? " · paused" : " · live"}
              </span>
              <div className="flex items-center gap-2">
                {!apiOnline && (
                  <Badge variant="warning" className="text-[10px] normal-case tracking-normal">
                    Backend offline
                  </Badge>
                )}
                <button
                  type="button"
                  className="text-[#67b3ef] hover:underline"
                  onClick={() => downloadSecurityExport(filteredRows, "json")}
                  disabled={filteredRows.length === 0}
                >
                  JSON
                </button>
              </div>
            </div>
          </div>

          {filteredRows.length === 0 && !loading && !sessionLoading ? (
            <div className="px-4 py-8">
              <LogsSetupEmpty
                apiOnline={apiOnline}
                wsConnected={wsConnected}
                hasEvents={baseEvents.length > 0}
              />
              {baseEvents.length > 0 ? (
                <p className="mt-3 text-center text-[13px] text-muted-foreground">
                  No events match the current filters.
                </p>
              ) : null}
            </div>
          ) : (
            <SecurityEventTable
              rows={filteredRows}
              selectedId={selectedId}
              onSelect={onSelectRow}
              loading={loading || sessionLoading}
              className="h-[560px]"
            />
          )}
        </DashboardCard>

        <SecurityEventInspector row={selected} className="min-h-[560px]" />
      </div>
    </PageStack>
  );
}
