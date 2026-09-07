"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Activity,
  CheckCircle2,
  FileCode,
  Plug,
  Rocket,
  ScrollText,
  Send,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  COMMAND_CENTER_UI,
  READINESS_UI,
  guardActionLabel,
  guardDecisionLabel,
} from "@/lib/getStartedLabels";
import type { IntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { IngestConnectionHelp } from "@/components/dashboard/IngestConnectionHelp";
import { severityFromScore } from "@/lib/severity";
import { cn } from "@/lib/utils";

type ActivityEvent = Record<string, unknown>;

function eventKey(evt: ActivityEvent, index: number): string {
  return (
    String(evt.event_id ?? "") ||
    String(evt.id ?? "") ||
    `${String(evt.session_id ?? "")}-${String(evt.tool_name ?? "")}-${index}`
  );
}

function formatTool(evt: ActivityEvent): string {
  return String(evt.tool_name ?? evt.event_type ?? "event");
}

export function IntegrationActivityPanel({
  events,
  loading,
  apiOnline,
  wsConnected,
  totalEvents,
  activeSessions,
  outboundConnected,
  integrationStatus,
  usingHydrated,
  onTestIngest,
  ingestTestLoading,
  ingestTestMessage,
  ingestTestOk,
}: {
  events: ActivityEvent[];
  loading?: boolean;
  apiOnline: boolean;
  wsConnected: boolean;
  totalEvents: number;
  activeSessions: number;
  outboundConnected: boolean;
  integrationStatus: IntegrationStatus;
  usingHydrated?: boolean;
  onTestIngest: () => void;
  ingestTestLoading: boolean;
  ingestTestMessage: string | null;
  ingestTestOk: boolean | null;
}) {
  const ordered = useMemo(() => events.slice(0, 20), [events]);
  const latest = ordered[0];

  const latestRisk = latest ? Number(latest.risk_score ?? 0) : 0;
  const latestSeverity = severityFromScore(latestRisk);
  const latestSession = latest ? String(latest.session_id ?? "") : "";
  const latestAgent = latest ? String(latest.agent_id ?? "—") : "";
  const latestVerdict = latest ? String(latest.verdict ?? "") : "";
  const latestAction = latest ? String(latest.action ?? latest.recommended_action ?? "") : "";

  const outboundCount =
    integrationStatus.customConnectors + integrationStatus.alertChannels;
  const hasEvents = ordered.length > 0;

  return (
    <section className="surface-panel overflow-hidden">
      <div className="border-b border-border bg-muted/15 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              {COMMAND_CENTER_UI.integrationActivity}
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              {COMMAND_CENTER_UI.integrationActivityHint}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/integrations">
                <Plug className="h-4 w-4" />
                {outboundConnected
                  ? COMMAND_CENTER_UI.manageIntegrations
                  : COMMAND_CENTER_UI.connectIntegration}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/logs">
                <ScrollText className="h-4 w-4" />
                {COMMAND_CENTER_UI.viewFullLog}
              </Link>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1",
              apiOnline
                ? "border-border bg-muted/40 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground"
            )}
          >
            {apiOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {apiOnline ? COMMAND_CENTER_UI.guardConnected : COMMAND_CENTER_UI.guardOffline}
          </span>
          {outboundConnected && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-foreground" />
              {COMMAND_CENTER_UI.outboundConnected} ({outboundCount})
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1 text-muted-foreground">
            <Activity className="h-3.5 w-3.5" />
            {wsConnected && hasEvents
              ? COMMAND_CENTER_UI.liveFeedActive
              : wsConnected
                ? COMMAND_CENTER_UI.liveFeedNoEvents
                : COMMAND_CENTER_UI.liveFeedPolling}
          </span>
          <span className="rounded-md border border-border bg-muted/30 px-2.5 py-1 text-muted-foreground">
            {COMMAND_CENTER_UI.eventsScreened}:{" "}
            <span className="font-medium text-foreground">{totalEvents}</span>
          </span>
          <span className="rounded-md border border-border bg-muted/30 px-2.5 py-1 text-muted-foreground">
            {COMMAND_CENTER_UI.activeSessions}:{" "}
            <span className="font-medium text-foreground">{activeSessions}</span>
          </span>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4">
        {loading && ordered.length === 0 ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : latest ? (
          <div className="rounded-xl border border-foreground/15 bg-muted/20 p-4 sm:p-5 animate-panel-in">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {COMMAND_CENTER_UI.latestResponse}
              </p>
              {usingHydrated && (
                <Badge variant="secondary" className="text-[9px]">From session history</Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={latestSeverity} />
                  <span className="text-2xl font-semibold tabular-nums">{latestRisk.toFixed(0)}</span>
                  <span className="text-sm text-muted-foreground">/100 danger</span>
                </div>
                <p className="text-sm">
                  <span className="text-muted-foreground">{READINESS_UI.guardDecision}:</span>{" "}
                  <span className="font-medium">{guardDecisionLabel(latestVerdict)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">{COMMAND_CENTER_UI.toolCall}:</span>{" "}
                  <span className="font-mono font-medium">{formatTool(latest)}</span>
                </p>
                <p className="text-sm">
                  <span className="text-muted-foreground">{COMMAND_CENTER_UI.agent}:</span>{" "}
                  <span className="font-medium">{latestAgent}</span>
                </p>
                {latestAction && (
                  <p className="text-sm text-muted-foreground">
                    ARTSA: {guardActionLabel(latestAction)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {latestSession && (
                  <>
                    <Button asChild size="sm">
                      <Link href={`/logs?session=${encodeURIComponent(latestSession)}`}>
                        <ScrollText className="h-4 w-4" />
                        Activity log
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/replay?session=${encodeURIComponent(latestSession)}`}>
                        <FileCode className="h-4 w-4" />
                        Replay
                      </Link>
                    </Button>
                  </>
                )}
              </div>
            </div>
            {latestSession && (
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                {COMMAND_CENTER_UI.session}: {latestSession}
              </p>
            )}
          </div>
        ) : outboundConnected ? (
          <div className="rounded-xl border border-border bg-muted/20 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-foreground" />
            <h3 className="mt-3 text-base font-semibold">{COMMAND_CENTER_UI.outboundConnected}</h3>
            <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">
              {COMMAND_CENTER_UI.waitingForIngest}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button asChild size="sm">
                <Link href="/get-started">
                  <Send className="mr-2 h-4 w-4" />
                  {COMMAND_CENTER_UI.sendTestEvent}
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/settings/integrations">{COMMAND_CENTER_UI.manageIntegrations}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Plug}
            title={COMMAND_CENTER_UI.waitingForTraffic}
            description={COMMAND_CENTER_UI.waitingHint}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/get-started">
                    <Rocket className="mr-2 h-4 w-4" />
                    {COMMAND_CENTER_UI.getStarted}
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings/integrations">
                    {COMMAND_CENTER_UI.connectIntegration}
                  </Link>
                </Button>
              </div>
            }
            className="py-10"
          />
        )}

        {ordered.length > 1 && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {COMMAND_CENTER_UI.recentResponses}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
              {ordered.slice(1, 12).map((evt, i) => {
                const risk = Number(evt.risk_score ?? 0);
                const sessionId = String(evt.session_id ?? "");
                const href = sessionId
                  ? `/replay?session=${encodeURIComponent(sessionId)}`
                  : "/logs";
                return (
                  <Link
                    key={eventKey(evt, i)}
                    href={href}
                    className="flex w-[168px] shrink-0 flex-col rounded-md border border-border bg-muted/20 px-2.5 py-2 transition-colors hover:bg-muted/40"
                  >
                    <span className="truncate font-mono text-[11px] text-foreground">
                      {formatTool(evt)}
                    </span>
                    <span className="mt-0.5 truncate text-[10px] text-muted-foreground">
                      {String(evt.agent_id ?? "—")}
                    </span>
                    <div className="mt-1.5 flex items-center justify-between gap-1">
                      <Badge variant="secondary" className="text-[9px]">
                        {guardDecisionLabel(String(evt.verdict ?? ""))}
                      </Badge>
                      <span className="font-mono text-[10px] tabular-nums text-foreground">
                        {risk.toFixed(0)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {(totalEvents === 0 || !hasEvents) && apiOnline && !latest && (
          <IngestConnectionHelp
            wsConnected={wsConnected}
            hasEvents={hasEvents}
            ingestKeyConfigured={integrationStatus.ingestKeyConfigured}
            onTestIngest={onTestIngest}
            testLoading={ingestTestLoading}
            testMessage={ingestTestMessage}
            testOk={ingestTestOk}
          />
        )}
      </div>
    </section>
  );
}
