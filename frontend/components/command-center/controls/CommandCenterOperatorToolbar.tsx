"use client";

import { AlertOctagon, Ban, RotateCcw, Shield, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OperatorActionType } from "./CommandCenterConfirmationModal";

export function CommandCenterOperatorToolbar({
  onRequestAction,
  onReplayCurrentRound,
  lastOperatorAction,
  className,
}: {
  onRequestAction: (actionType: OperatorActionType, targetName?: string) => void;
  onReplayCurrentRound?: () => void;
  lastOperatorAction?: string | null;
  className?: string;
}) {
  return (
    <div
      aria-label="Operator Containment and Simulation Controls"
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3.5 font-mono text-[11px] transition-colors",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            OPERATOR INTERVENTION DECK
          </span>
          <span className="rounded border border-border bg-muted/40 px-1.5 py-0.2 text-[9px] text-muted-foreground">
            SOC LEVEL 3
          </span>
        </div>

        <span className="text-[10px] text-muted-foreground">
          Destructive actions require cryptographic operator confirmation
        </span>
      </div>

      {/* Control Buttons Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 pt-1 font-mono text-[10px]">
        {/* Kill Session */}
        <button
          type="button"
          onClick={() => onRequestAction("KILL_SESSION", "RUN-00182")}
          className="flex items-center justify-center gap-1.5 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 font-semibold text-rose-500 hover:bg-rose-500/20 active:scale-[0.98] transition-colors cursor-pointer"
          title="Terminate active session immediately"
        >
          <AlertOctagon className="h-3.5 w-3.5" />
          KILL SESSION
        </button>

        {/* Quarantine Agent */}
        <button
          type="button"
          onClick={() => onRequestAction("QUARANTINE_AGENT", "Target Agent")}
          className="flex items-center justify-center gap-1.5 rounded border border-rose-500/30 bg-rose-500/5 px-2.5 py-2 font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 active:scale-[0.98] transition-colors cursor-pointer"
          title="Quarantine target agent and revoke tool permissions"
        >
          <Shield className="h-3.5 w-3.5" />
          QUARANTINE AGENT
        </button>

        {/* Block Tool */}
        <button
          type="button"
          onClick={() => onRequestAction("BLOCK_TOOL", "invoice_export")}
          className="flex items-center justify-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 font-semibold text-amber-500 hover:bg-amber-500/20 active:scale-[0.98] transition-colors cursor-pointer"
          title="Block tool invocation across all agents"
        >
          <Ban className="h-3.5 w-3.5" />
          BLOCK TOOL
        </button>

        {/* Replay Round */}
        <button
          type="button"
          onClick={() => onReplayCurrentRound?.()}
          className="flex items-center justify-center gap-1.5 rounded border border-border bg-card px-2.5 py-2 font-semibold text-foreground hover:bg-muted active:scale-[0.98] transition-colors cursor-pointer"
          title="Re-execute current round payload in isolation"
        >
          <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
          REPLAY ROUND
        </button>

        {/* Deploy Mitigation */}
        <button
          type="button"
          onClick={() => onRequestAction("DEPLOY_MITIGATION", "Adaptive Policy v1.2")}
          className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-2 font-semibold text-emerald-500 hover:bg-emerald-500/20 active:scale-[0.98] transition-colors cursor-pointer"
          title="Deploy compiled defensive containment policy"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          DEPLOY MITIGATION
        </button>
      </div>

      {/* Audit Feedback Banner if action performed */}
      {lastOperatorAction ? (
        <div className="mt-1 flex items-center justify-between rounded border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-[10px] text-sky-400">
          <span>
            OPERATOR AUDIT: <span className="font-semibold text-foreground">{lastOperatorAction}</span>
          </span>
          <span className="text-[9px] uppercase font-mono text-muted-foreground">
            UI-READY · BACKEND INTEGRATION REQUIRED
          </span>
        </div>
      ) : null}
    </div>
  );
}
