"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AlertOctagon,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ATTACK_TIMELINE,
  type AttackTimelineStep,
} from "../prototype/liveRounds";

export function CommandCenterAttackTimeline({
  currentRoundIdx,
  onSelectStep,
  className,
}: {
  currentRoundIdx: number;
  onSelectStep?: (step: AttackTimelineStep, idx: number) => void;
  className?: string;
}) {
  const steps = useMemo(() => ATTACK_TIMELINE, []);
  const activeStep = steps[currentRoundIdx] ?? steps[0]!;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const container = scrollerRef.current;
    const activeCard = cardRefs.current[currentRoundIdx];
    if (container && activeCard) {
      const cardLeft = activeCard.offsetLeft;
      const cardWidth = activeCard.offsetWidth;
      const containerWidth = container.offsetWidth;
      const targetScrollLeft = cardLeft - containerWidth / 2 + cardWidth / 2;

      if (typeof container.scrollTo === "function") {
        container.scrollTo({
          left: Math.max(0, targetScrollLeft),
          behavior: "smooth",
        });
      } else {
        container.scrollLeft = Math.max(0, targetScrollLeft);
      }
    }
  }, [currentRoundIdx]);

  function getStatusIcon(status: AttackTimelineStep["status"]) {
    switch (status) {
      case "blocked":
        return <AlertOctagon className="h-3 w-3 text-rose-500" />;
      case "breach":
        return <ShieldAlert className="h-3 w-3 text-red-500" />;
      case "contained":
        return <ShieldCheck className="h-3 w-3 text-emerald-500" />;
      case "suspicious":
        return <Clock className="h-3 w-3 text-amber-500" />;
      default:
        return <CheckCircle2 className="h-3 w-3 text-sky-400" />;
    }
  }

  function getActionBadgeStyle(action: string) {
    if (action.includes("BLOCK") || action.includes("QUARANTINE")) {
      return "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400";
    }
    if (action.includes("PATCH") || action.includes("CONTAIN")) {
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    }
    if (action.includes("FLAG") || action.includes("BREACH") || action.includes("SCORE")) {
      return "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400";
    }
    return "border-border bg-muted/30 text-muted-foreground";
  }

  return (
    <div
      aria-label="Attack and Containment Timeline"
      className={cn(
        "flex flex-col rounded-xl border border-border bg-card/40 p-4 transition-colors",
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-sans text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            ATTACK & CONTAINMENT TIMELINE
          </span>
          <span className="rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground">
            STEP {currentRoundIdx + 1} OF {steps.length}
          </span>
          {/* Horizontal scroll affordance buttons */}
          <div className="flex items-center gap-1 ml-1">
            <button
              type="button"
              onClick={() => {
                if (scrollerRef.current && typeof scrollerRef.current.scrollBy === "function") {
                  scrollerRef.current.scrollBy({ left: -220, behavior: "smooth" });
                }
              }}
              className="rounded border border-border/80 bg-muted/40 p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Scroll timeline left"
              aria-label="Scroll timeline left"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (scrollerRef.current && typeof scrollerRef.current.scrollBy === "function") {
                  scrollerRef.current.scrollBy({ left: 220, behavior: "smooth" });
                }
              }}
              className="rounded border border-border/80 bg-muted/40 p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Scroll timeline right"
              aria-label="Scroll timeline right"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          What Happened · When · Detection Signal · Action Taken
        </span>
      </div>

      {/* Horizontal Scroller of Timeline Steps */}
      <div
        ref={scrollerRef}
        className="flex gap-2.5 overflow-x-auto p-1.5 pb-2 scroll-smooth [scrollbar-width:thin]"
      >
        {steps.map((step, idx) => {
          const isCurrent = idx === currentRoundIdx;
          const isPast = idx < currentRoundIdx;

          return (
            <button
              key={`${step.eventId}-${idx}`}
              ref={(el) => {
                cardRefs.current[idx] = el;
              }}
              type="button"
              onClick={() => onSelectStep?.(step, idx)}
              className={cn(
                "group relative flex min-w-[200px] flex-col justify-start rounded-lg border p-2.5 text-left font-mono transition-all cursor-pointer select-none",
                isCurrent
                  ? "border-sky-500/80 bg-sky-500/10 ring-1 ring-sky-400/50 shadow-md"
                  : isPast
                    ? "border-border/60 bg-muted/20 opacity-85 hover:opacity-100 hover:border-border"
                    : "border-border/30 bg-muted/10 opacity-55 hover:opacity-85 hover:border-border"
              )}
              title={`Inspect Step ${idx + 1} (${step.label}): ${step.whatHappened}`}
            >
              {/* Top Row: Round label & Timestamp */}
              <div className="flex items-center justify-between gap-1 w-full text-[10px]">
                <span
                  className={cn(
                    "font-bold uppercase tracking-wide",
                    isCurrent ? "text-sky-400" : "text-foreground"
                  )}
                >
                  {step.label} · {step.threatCode}
                </span>
                <span className="text-muted-foreground text-[9px] tabular-nums">
                  {step.when}
                </span>
              </div>

              {/* What Happened (summary) */}
              <p className="mt-1.5 line-clamp-2 text-[11px] font-sans leading-snug text-foreground/90 group-hover:text-foreground">
                {step.whatHappened}
              </p>

              {/* Detector & Action Taken */}
              <div className="mt-auto pt-2 flex flex-col gap-1 border-t border-border/50 text-[9px]">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-muted-foreground uppercase text-[8px] tracking-wider">
                    DETECTOR
                  </span>
                  <span className="truncate text-foreground/80 font-medium text-right max-w-[120px]">
                    {step.whatDetectedIt}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <span className="text-muted-foreground uppercase text-[8px] tracking-wider">
                    ACTION
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[8px] font-semibold uppercase tracking-wide border",
                      getActionBadgeStyle(step.actionTaken)
                    )}
                  >
                    {getStatusIcon(step.status)}
                    {step.actionTaken}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active step readout banner */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px]">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground uppercase">
            ACTIVE [{activeStep.label}]
          </span>
          <span className="text-muted-foreground">
            {activeStep.agentFrom} → {activeStep.agentTo}:
          </span>
          <span className="text-foreground/90">
            {activeStep.whatHappened}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Detection:</span>
          <span className="font-semibold text-foreground">
            {activeStep.whatDetectedIt}
          </span>
          <span className="text-border">·</span>
          <span className="text-muted-foreground">Action:</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.2 font-semibold uppercase text-[10px] border",
              getActionBadgeStyle(activeStep.actionTaken)
            )}
          >
            {activeStep.actionTaken}
          </span>
        </div>
      </div>
    </div>
  );
}
