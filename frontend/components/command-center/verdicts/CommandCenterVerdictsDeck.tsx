"use client";

import { useMemo } from "react";
import { CheckCircle2, Clock, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getSecurityEventForRound,
  type LiveRound,
  type VerdictItem,
} from "../prototype/liveRounds";

export function CommandCenterVerdictsDeck({
  round,
  roundIdx,
  onSelectVerdict,
  className,
}: {
  round: LiveRound;
  roundIdx: number;
  onSelectVerdict?: (verdict: VerdictItem) => void;
  className?: string;
}) {
  const securityEvent = useMemo(
    () => getSecurityEventForRound(round, roundIdx),
    [round, roundIdx]
  );

  const verdicts = round.verdicts ?? [];

  function getVerdictToneStyle(tone: VerdictItem["tone"]) {
    switch (tone) {
      case "ok":
        return {
          badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          icon: <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />,
        };
      case "warn":
        return {
          badge: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
          icon: <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />,
        };
      default:
        return {
          badge: "border-border bg-muted/40 text-muted-foreground",
          icon: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
        };
    }
  }

  return (
    <div
      aria-label="Evaluation and Runtime Verdicts"
      className={cn(
        "rounded-xl border border-border bg-card/40 p-4 transition-colors space-y-3",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          EVALUATION & ARBITRATION VERDICTS
        </span>
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
          <span>ACTIVE ROUND</span>
          <span className="font-semibold text-foreground">R{round.round}</span>
        </div>
      </div>

      {/* Triad of Agent Verdicts: Target, Judge, Defender */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {verdicts.map((item) => {
          const style = getVerdictToneStyle(item.tone);
          return (
            <button
              key={item.agent}
              type="button"
              onClick={() => onSelectVerdict?.(item)}
              aria-label={`Inspect ${item.agent} arbitration verdict`}
              className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/20 p-2.5 text-left font-mono transition-all hover:border-border hover:bg-muted/30 cursor-pointer group"
              title={`Click to inspect ${item.agent} arbitration verdict`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-sans text-[11px] font-semibold text-foreground">
                  {item.agent} Verdict
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase border",
                    style.badge
                  )}
                >
                  {style.icon}
                  {item.tone}
                </span>
              </div>
              <p className="mt-1.5 text-[10px] text-muted-foreground leading-snug line-clamp-2 group-hover:text-foreground/90 transition-colors">
                {item.detail}
              </p>
            </button>
          );
        })}
      </div>

      {/* Cryptographic Event & Trace Audit Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5 font-mono text-[10px]">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground uppercase text-[9px] tracking-wider">
            EVENT
          </span>
          <span className="font-semibold text-foreground">
            {securityEvent.eventId}
          </span>
          <span className="text-border">·</span>
          <span className="text-muted-foreground uppercase text-[9px] tracking-wider">
            TRACE
          </span>
          <span className="text-sky-400">
            {securityEvent.traceId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground uppercase text-[9px] tracking-wider">
            SIGNAL:
          </span>
          <span className="text-foreground/90 truncate max-w-[200px]" title={securityEvent.detectionSignal}>
            {securityEvent.detectionSignal}
          </span>
        </div>
      </div>
    </div>
  );
}
