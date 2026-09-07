"use client";

import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Circle,
  Radio,
  ScrollText,
  Send,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyIngestCurlButton } from "@/components/shared/IngestSnippetPanel";
import { COMMAND_CENTER_UI, INTEGRATION_HEALTH_UI } from "@/lib/getStartedLabels";
import type { IntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { cn } from "@/lib/utils";

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
  ) : (
    <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
  );
}

export function IntegrationHealthPanel({
  apiOnline,
  wsConnected,
  ingestKeyConfigured,
  outboundConnected,
  outboundCount,
  hasInboundEvents,
  latestSessionId,
  className,
  compact,
}: {
  apiOnline: boolean;
  wsConnected: boolean;
  ingestKeyConfigured: boolean;
  outboundConnected: boolean;
  outboundCount: number;
  hasInboundEvents: boolean;
  latestSessionId?: string;
  className?: string;
  compact?: boolean;
}) {
  const inboundReady = apiOnline && ingestKeyConfigured && hasInboundEvents;
  const logsHref = latestSessionId
    ? `/logs?session=${encodeURIComponent(latestSessionId)}`
    : "/logs";

  return (
    <section
      className={cn(
        "surface-panel overflow-hidden",
        className
      )}
    >
      <div className="border-b border-border bg-muted/15 px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold">{INTEGRATION_HEALTH_UI.title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{INTEGRATION_HEALTH_UI.subtitle}</p>
      </div>

      <div className={cn("grid gap-4 p-4 sm:p-5", compact ? "sm:grid-cols-2" : "lg:grid-cols-2")}>
        <div className="space-y-3 rounded-lg border border-foreground/15 bg-muted/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ArrowDownLeft className="h-4 w-4 text-muted-foreground" aria-hidden />
            {COMMAND_CENTER_UI.inboundTitle}
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <StatusIcon ok={apiOnline} />
              <span>{apiOnline ? INTEGRATION_HEALTH_UI.apiOnline : INTEGRATION_HEALTH_UI.apiOffline}</span>
            </li>
            <li className="flex items-start gap-2">
              {ingestKeyConfigured ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span>
                {ingestKeyConfigured
                  ? COMMAND_CENTER_UI.ingestKeyOk
                  : COMMAND_CENTER_UI.ingestKeyMissing}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <StatusIcon ok={hasInboundEvents} />
              <span>
                {hasInboundEvents
                  ? INTEGRATION_HEALTH_UI.trafficSeen
                  : INTEGRATION_HEALTH_UI.noTrafficYet}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Radio className={cn("h-4 w-4 shrink-0", wsConnected ? "text-foreground" : "text-muted-foreground")} aria-hidden />
              <span className="text-muted-foreground">
                {wsConnected ? INTEGRATION_HEALTH_UI.wsLive : INTEGRATION_HEALTH_UI.wsPolling}
              </span>
            </li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant={inboundReady ? "outline" : "default"}>
              <Link href="/get-started">
                <Send className="h-3.5 w-3.5" />
                {COMMAND_CENTER_UI.sendTestEvent}
              </Link>
            </Button>
            <CopyIngestCurlButton size="sm" variant="outline" />
            {hasInboundEvents && (
              <Button asChild size="sm" variant="outline">
                <Link href={logsHref}>
                  <ScrollText className="h-3.5 w-3.5" />
                  {COMMAND_CENTER_UI.viewFullLog}
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-muted/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            {COMMAND_CENTER_UI.outboundTitle}
          </div>
          <p className="text-xs text-muted-foreground">{COMMAND_CENTER_UI.outboundDetail}</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <StatusIcon ok={outboundConnected} />
              <span>
                {outboundConnected
                  ? `${COMMAND_CENTER_UI.outboundConnected} (${outboundCount})`
                  : INTEGRATION_HEALTH_UI.outboundOptional}
              </span>
            </li>
          </ul>
          <p className="text-xs text-muted-foreground">{INTEGRATION_HEALTH_UI.outboundReminder}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/integrations">{COMMAND_CENTER_UI.manageIntegrations}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/red-team/lab">Attack Lab</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Bridge for components that still pass IntegrationStatus object. */
export function integrationStatusFrom(
  status: IntegrationStatus,
  outboundConnected: boolean
): {
  ingestKeyConfigured: boolean;
  outboundConnected: boolean;
  outboundCount: number;
} {
  return {
    ingestKeyConfigured: status.ingestKeyConfigured,
    outboundConnected,
    outboundCount: status.customConnectors + status.alertChannels,
  };
}
