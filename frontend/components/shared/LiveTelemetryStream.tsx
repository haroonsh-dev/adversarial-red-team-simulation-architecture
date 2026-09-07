"use client";

import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EMPTY_STATE_UI } from "@/lib/getStartedLabels";
import { cn } from "@/lib/utils";

export interface TelemetryEvent {
  event_id?: string;
  id?: string;
  session_id?: string;
  triggered_at?: string;
  ts?: string;
  tool_name?: string;
  risk_score?: number;
  verdict?: string;
  severity?: string;
  event_type?: string;
  action?: string;
  [key: string]: unknown;
}

interface LiveTelemetryStreamProps {
  events: TelemetryEvent[];
  loading?: boolean;
  height?: string;
  className?: string;
  emptyAction?: React.ReactNode;
  interactive?: boolean;
  /** When set, rows for this session get a subtle highlight */
  highlightSessionId?: string;
  /** Custom navigation per row (e.g. replay deep link). Defaults to /logs when omitted. */
  getEventHref?: (event: TelemetryEvent) => string | undefined;
  /** Select row without navigation — SOC inline forensics */
  onSelectEvent?: (event: TelemetryEvent) => void;
}

export function LiveTelemetryStream({
  events,
  loading = false,
  height = "h-64",
  className,
  emptyAction,
  interactive = true,
  highlightSessionId,
  getEventHref,
  onSelectEvent,
}: LiveTelemetryStreamProps) {
  const router = useRouter();
  const streamItems = events.length ? [...events].slice(-50).reverse() : [];

  return (
    <ScrollArea className={cn(height, "surface-inset rounded-lg", className)}>
      <div className="space-y-0 p-2" aria-live="polite" aria-label="Live telemetry events">
        {loading ? (
          <div className="space-y-2 p-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : streamItems.length === 0 ? (
          <EmptyState
            icon={Activity}
            title={EMPTY_STATE_UI.noActivityTitle}
            description={EMPTY_STATE_UI.noActivityDescription}
            action={emptyAction}
            variant="compact"
            className="border-0 py-12"
          />
        ) : (
          streamItems.map((evt, i) => {
            const score = Number(evt.risk_score ?? 0);
            const tool = String(evt.tool_name ?? evt.event_type ?? "event");
            const verdict = String(evt.verdict ?? "");
            const stableKey =
              String(evt.event_id ?? "") ||
              String(evt.id ?? "") ||
              String(evt.triggered_at ?? "") ||
              String(evt.ts ?? "");
            const sessionId = String(evt.session_id ?? "");
            const selected =
              highlightSessionId && sessionId && sessionId === highlightSessionId;
            const href =
              interactive && !onSelectEvent
                ? getEventHref?.(evt) ??
                  (sessionId ? `/replay?session=${encodeURIComponent(sessionId)}` : "/logs")
                : undefined;
            return (
              <button
                type="button"
                key={stableKey || i}
                disabled={!interactive}
                onClick={() => {
                  if (onSelectEvent) {
                    onSelectEvent(evt);
                    return;
                  }
                  if (href) router.push(href);
                }}
                className={cn(
                  "interactive-row flex w-full items-center justify-between gap-3 rounded-md border-b border-border/40 px-3 py-2.5 text-left font-mono text-xs last:border-0",
                  interactive && "cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none",
                  selected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
                  !selected && interactive && "hover:bg-muted/40"
                )}
              >
                <div className="min-w-0 truncate">
                  <span className="text-foreground">{tool}</span>
                  {sessionId && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {sessionId.slice(0, 8)}…
                    </span>
                  )}
                  {verdict && (
                    <span className="ml-2 text-[10px] uppercase text-muted-foreground">{verdict}</span>
                  )}
                </div>
                <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 tabular-nums text-foreground">
                  {Number.isFinite(score) && score > 0 ? score.toFixed(1) : "—"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </ScrollArea>
  );
}
