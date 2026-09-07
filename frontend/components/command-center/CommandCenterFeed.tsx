"use client";

import { useEffect, useRef, useState } from "react";
import { AGENT_SHORT, severityColor, type AgentEvent } from "@/lib/commandCenterOps";
import { cn } from "@/lib/utils";

function hopLine(e: AgentEvent): string {
  const src = AGENT_SHORT[e.sourceAgent] ?? e.sourceAgent.slice(0, 3).toUpperCase();
  if (!e.targetAgent) return src;
  const dst = AGENT_SHORT[e.targetAgent] ?? e.targetAgent.slice(0, 3).toUpperCase();
  return `${src} → ${dst}`;
}

export function CommandCenterFeed({
  events,
  onSelectAgent,
}: {
  events: AgentEvent[];
  onSelectAgent?: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const [userAway, setUserAway] = useState(false);

  useEffect(() => {
    if (!pinned || userAway) return;
    const el = scroller.current;
    if (el) el.scrollTop = 0;
  }, [events, pinned, userAway]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const nearTop = el.scrollTop < 24;
    setUserAway(!nearTop);
    if (nearTop) setPinned(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Live blotter
          </p>
          <p className="font-mono text-[9px] text-zinc-600">{events.length} events in window</p>
        </div>
        {!pinned || userAway ? (
          <button
            type="button"
            className="rounded-sm border border-cyan-500/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-400 hover:bg-cyan-500/10"
            onClick={() => {
              setPinned(true);
              setUserAway(false);
              if (scroller.current) scroller.current.scrollTop = 0;
            }}
          >
            Jump to live
          </button>
        ) : (
          <span className="font-mono text-[10px] text-emerald-500">● TAILING</span>
        )}
      </div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto font-mono text-[11px] leading-[1.3]"
      >
        {events.length === 0 ? (
          <p className="px-3 py-4 text-zinc-600">Waiting for stream…</p>
        ) : (
          events.map((e, i) => {
            const ts = new Date(e.timestamp).toLocaleTimeString(undefined, {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const sev = e.severity ?? "info";
            const agent = e.targetAgent ?? e.sourceAgent;
            const hop = hopLine(e);
            return (
              <button
                key={`${e.timestamp}-${e.sourceAgent}-${i}`}
                type="button"
                onClick={() => onSelectAgent?.(agent)}
                className={cn(
                  "flex w-full gap-2 border-b border-zinc-900/90 px-2 py-1.5 text-left transition-colors hover:bg-muted/80",
                  i === 0 && "bg-muted/40"
                )}
              >
                <span
                  className="mt-0.5 w-0.5 shrink-0 self-stretch rounded-full"
                  style={{ background: severityColor(sev) }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="shrink-0 tabular-nums text-zinc-600">{ts}</span>
                    <span className="shrink-0 font-semibold text-zinc-400">{hop}</span>
                    <span className="shrink-0 uppercase text-zinc-600">{e.type.replace("_", " ")}</span>
                    {e.asiTag ? (
                      <span
                        className="shrink-0 rounded-sm border px-1 py-px text-[9px] uppercase"
                        style={{
                          color: severityColor(sev),
                          borderColor: `${severityColor(sev)}55`,
                        }}
                      >
                        {e.asiTag}
                      </span>
                    ) : null}
                    {e.hmacValid === false ? (
                      <span className="shrink-0 text-[9px] uppercase text-red-400">hmac!</span>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "mt-0.5 truncate",
                      sev === "critical" && "text-red-300",
                      sev === "warning" && "text-amber-300",
                      sev === "info" && "text-foreground/80"
                    )}
                  >
                    {e.message}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
