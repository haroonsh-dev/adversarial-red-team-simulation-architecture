"use client";

import Link from "next/link";
import {
  ChevronDown,
  Download,
  Microscope,
  Pause,
  Play,
  ScrollText,
  SkipBack,
  SkipForward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import type { Session } from "@/lib/types";
import { severityFromScore } from "@/lib/severity";
import { cn } from "@/lib/utils";

function statusTone(status: Session["status"]): string {
  if (status === "BREACHED") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (status === "QUARANTINED") return "border-status-warning/40 bg-status-warning/10 text-status-warning";
  if (status === "ACTIVE") return "border-status-success/40 bg-status-success/10 text-status-success";
  return "border-border bg-muted/30 text-muted-foreground";
}

export function ReplayTheaterHeader({
  sessions,
  selectedSession,
  selectedSessionId,
  onSelectSession,
  peakRisk,
  breachedCount,
  eventCount,
  playing,
  onTogglePlay,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onExport,
  onForensics,
  forensicsLoading,
  exportDisabled,
  actionLoading,
  onQuarantine,
  onKill,
}: {
  sessions: Session[];
  selectedSession: Session | undefined;
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  peakRisk: number;
  breachedCount: number;
  eventCount: number;
  playing: boolean;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  onExport: () => void;
  onForensics: () => void;
  forensicsLoading: boolean;
  exportDisabled: boolean;
  actionLoading: boolean;
  onQuarantine: () => void;
  onKill: () => void;
}) {
  const peakSeverity = severityFromScore(peakRisk);

  return (
    <header className="replay-theater-hero">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.12),transparent_55%)]" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              Sessions
            </Badge>
            {selectedSession && (
              <span
                className={cn(
                  "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase",
                  statusTone(selectedSession.status)
                )}
              >
                {selectedSession.status}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {selectedSession?.agent_id ?? "Pick a session"}
            </h1>
            {selectedSession?.circuit_breaker_open ? (
              <p className="mt-1 text-sm font-medium text-destructive">
                Circuit breaker open — cascading failures contained.
              </p>
            ) : null}
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Scrub through each action — see when risk spiked and what ARTSA did.
            </p>
          </div>
          {sessions.length > 0 && (
            <div className="flex max-w-md items-center gap-2">
              <label htmlFor="replay-session-select" className="sr-only">
                Switch session
              </label>
              <div className="relative min-w-0 flex-1">
                <select
                  id="replay-session-select"
                  value={selectedSessionId ?? ""}
                  onChange={(e) => onSelectSession(e.target.value)}
                  className="h-9 w-full appearance-none rounded-lg border border-border bg-background/80 pl-3 pr-8 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.agent_id} · {s.tool_call_count} events · {s.status}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              {selectedSession && (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/logs?session=${encodeURIComponent(selectedSession.id)}`}>
                    <ScrollText className="h-3.5 w-3.5" />
                    Logs
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex items-end gap-4">
            <div className="text-center">
              <p
                className={cn(
                  "font-mono text-4xl font-bold tabular-nums leading-none sm:text-5xl",
                  peakSeverity === "CRITICAL" && "text-destructive",
                  peakSeverity === "HIGH" && "text-status-warning",
                  peakSeverity === "MEDIUM" && "text-foreground",
                  peakSeverity === "LOW" && "text-muted-foreground"
                )}
              >
                {peakRisk.toFixed(0)}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Peak risk</p>
            </div>
            <div className="hidden h-12 w-px bg-border sm:block" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <span className="text-muted-foreground">Events</span>
              <span className="font-mono font-medium tabular-nums">{eventCount}</span>
              <span className="text-muted-foreground">Breaches</span>
              <span className="font-mono font-medium tabular-nums text-destructive">{breachedCount}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="icon" variant="secondary" className="h-10 w-10" onClick={onPrev} disabled={!canPrev} aria-label="Previous turn">
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button size="icon" className="h-11 w-11" onClick={onTogglePlay} disabled={eventCount === 0} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button size="icon" variant="secondary" className="h-10 w-10" onClick={onNext} disabled={!canNext} aria-label="Next turn">
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
        <Button size="sm" variant="outline" onClick={onExport} disabled={exportDisabled}>
          <Download className="h-3.5 w-3.5" />
          Export
        </Button>
        <Button size="sm" variant="outline" onClick={onForensics} disabled={forensicsLoading || exportDisabled}>
          {forensicsLoading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Microscope className="h-3.5 w-3.5" />
          )}
          Deep analysis
        </Button>
        {selectedSession?.status === "ACTIVE" && (
          <>
            <Button size="sm" variant="outline" disabled={actionLoading} onClick={onQuarantine}>
              Quarantine
            </Button>
            <Button size="sm" variant="destructive" disabled={actionLoading} onClick={onKill}>
              Stop session
            </Button>
          </>
        )}
        {selectedSession && (
          <div className="ml-auto flex items-center gap-2">
            <SeverityBadge severity={peakSeverity} />
            <span className="font-mono text-[10px] text-muted-foreground">{selectedSession.id.slice(0, 12)}…</span>
          </div>
        )}
      </div>
    </header>
  );
}
