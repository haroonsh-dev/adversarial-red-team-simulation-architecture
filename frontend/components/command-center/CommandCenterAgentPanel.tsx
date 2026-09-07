"use client";

import { cn } from "@/lib/utils";
import {
  AGENT_SHORT,
  agentMessages,
  statusColor,
  type AgentEvent,
  type AgentStatus,
} from "@/lib/commandCenterOps";

export function CommandCenterAgentPanel({
  agentId,
  status,
  events,
  onClose,
}: {
  agentId: string;
  status: AgentStatus;
  events: AgentEvent[];
  onClose: () => void;
}) {
  const msgs = agentMessages(events, agentId, 16);
  const code = AGENT_SHORT[agentId] ?? agentId.slice(0, 3).toUpperCase();

  return (
    <aside
      className="absolute inset-y-0 right-0 z-50 flex w-[min(420px,55%)] flex-col border-l border-zinc-600 bg-background shadow-[-12px_0_40px_rgba(0,0,0,0.65)]"
      role="dialog"
      aria-label={`${agentId} inspect`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            Inspect · {code}
          </p>
          <p className="mt-1 truncate font-mono text-[16px] font-semibold text-foreground">{agentId}</p>
          <p className="mt-2 inline-flex items-center gap-2 rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase tracking-wider">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: statusColor(status) }}
            />
            <span style={{ color: statusColor(status) }}>{status.replace("_", " ")}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase text-zinc-400 hover:border-zinc-500 hover:text-foreground"
        >
          Esc
        </button>
      </div>

      <div className="border-b border-border px-3 py-2.5">
        <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          Current task
        </p>
        <p className="mt-1.5 font-mono text-[12px] leading-relaxed text-foreground">
          {msgs[0]?.message ?? "Idle — awaiting next hop in the kill chain"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-muted">
        <div className="bg-background px-3 py-2">
          <p className="font-mono text-[9px] uppercase text-zinc-600">Events</p>
          <p className="mt-0.5 font-mono text-[14px] tabular-nums text-foreground">{msgs.length}</p>
        </div>
        <div className="bg-background px-3 py-2">
          <p className="font-mono text-[9px] uppercase text-zinc-600">Role</p>
          <p className="mt-0.5 font-mono text-[14px] text-foreground">{code}</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
          Recent traffic
        </p>
        <ul className="space-y-0">
          {msgs.length === 0 ? (
            <li className="font-mono text-[11px] text-zinc-600">No recent traffic</li>
          ) : (
            msgs.map((m, i) => (
              <li
                key={`${m.timestamp}-${i}`}
                className={cn(
                  "border-b border-zinc-900 py-2 font-mono text-[11px]",
                  i === 0 && "text-foreground"
                )}
              >
                <div className="flex gap-2 text-zinc-600">
                  <span className="tabular-nums">
                    {new Date(m.timestamp).toLocaleTimeString(undefined, { hour12: false })}
                  </span>
                  <span className="uppercase">{m.type.replace("_", " ")}</span>
                </div>
                <p className="mt-0.5 text-zinc-400">{m.message}</p>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  );
}
