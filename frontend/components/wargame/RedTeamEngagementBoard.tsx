"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AsiCategory } from "@/lib/asiCategories";
import type { ProbeWeight, TargetPosture } from "@/lib/redTeamEngagement";

interface RedTeamEngagementBoardProps {
  targetName?: string | null;
  targetModel?: string | null;
  profileLabel: string;
  mutations: boolean;
  loadout: ProbeWeight[];
  objectives: AsiCategory[];
  posture: TargetPosture;
  rounds: number;
  roundsCompleted: number;
  estimateMin: number;
  focusObjective?: string;
  canLaunch: boolean;
  isRunning: boolean;
  onLaunch?: () => void;
  className?: string;
}

const PRESSURE_TONE: Record<TargetPosture["pressure"], string> = {
  unset: "text-muted-foreground",
  low: "text-[#4ade80]",
  medium: "text-[hsl(var(--severity-high))]",
  high: "text-[hsl(var(--severity-critical))]",
};

/**
 * Idle Session pane for operators — probe schedule, prior posture, round queue.
 * Replaces empty "No active session" void without duplicating the Pipeline chain.
 */
export function RedTeamEngagementBoard({
  targetName,
  targetModel,
  profileLabel,
  mutations,
  loadout,
  objectives,
  posture,
  rounds,
  roundsCompleted,
  estimateMin,
  focusObjective,
  canLaunch,
  isRunning,
  onLaunch,
  className,
}: RedTeamEngagementBoardProps) {
  const hasTarget = Boolean(targetName);
  const status = isRunning ? "EXECUTING" : hasTarget ? "ARMED" : "NO_TARGET";
  const statusTone =
    status === "EXECUTING"
      ? "text-[#67b3ef]"
      : status === "ARMED"
        ? "text-[#4ade80]"
        : "text-muted-foreground";

  const maxWeight = Math.max(1, ...loadout.map((p) => p.weight));
  const queueLen = Math.min(Math.max(rounds, 1), 16);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background",
        className
      )}
    >
      {/* Status strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#67b3ef]">
            Engagement
          </span>
          <span className={cn("font-mono text-[10px] uppercase tracking-[0.08em]", statusTone)}>
            {status}
          </span>
          {hasTarget ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              {targetName}
              {targetModel ? ` · ${targetModel}` : ""}
            </span>
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground">No target selected</span>
          )}
        </div>
        <span className="font-mono text-[9px] uppercase text-muted-foreground">
          {profileLabel}
          {mutations ? " · mut" : ""} · {rounds}r · ~{estimateMin}m
        </span>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
        {/* Probe loadout */}
        <div className="border-b border-border p-3 lg:border-b-0 lg:border-r">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Probe loadout
          </p>
          <div className="space-y-2">
            {loadout.map((probe) => {
              const pct = Math.round((probe.weight / maxWeight) * 100);
              return (
                <div key={probe.code} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] text-foreground">{probe.code}</span>
                      <span className="ml-2 truncate text-[11px] text-muted-foreground">
                        {probe.label}
                      </span>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                      {probe.weight}%
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-card">
                    <div
                      className="h-full rounded-full bg-[#67b3ef]/80"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Prior posture */}
        <div className="border-b border-border p-3 lg:border-b-0">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Prior posture · this target
          </p>
          {!hasTarget ? (
            <p className="py-6 text-center font-mono text-[11px] text-muted-foreground">
              Select a target to load prior scan pressure
            </p>
          ) : posture.scanCount === 0 ? (
            <p className="py-6 text-center font-mono text-[11px] text-muted-foreground">
              Baseline unset — no prior scans for this provider
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <Metric label="Scans" value={String(posture.scanCount)} />
              <Metric label="Completed" value={String(posture.completedCount)} />
              <Metric
                label="Avg attack"
                value={posture.avgAttack != null ? posture.avgAttack.toFixed(1) : "—"}
              />
              <Metric
                label="Pressure"
                value={posture.pressure.toUpperCase()}
                valueClassName={PRESSURE_TONE[posture.pressure]}
              />
              <Metric label="Last status" value={posture.lastStatus ?? "—"} />
              <Metric label="Last rounds" value={posture.lastRounds ?? "—"} />
            </div>
          )}
        </div>
      </div>

      {/* ASI scope */}
      {objectives.length > 0 && (
        <div className="border-t border-border px-3 py-2.5">
          <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Technique scope (ASI)
          </p>
          <div className="flex flex-wrap gap-1">
            {objectives.map((asi) => (
              <span
                key={asi.code}
                className="inline-flex items-center gap-1.5 rounded-[4px] border border-border bg-muted px-2 py-1"
                title={asi.label}
              >
                <span className="font-mono text-[10px] text-[#67b3ef]">{asi.code}</span>
                <span className="text-[10px] text-muted-foreground">{asi.short}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Round queue — fills as telemetry arrives */}
      <div className="border-t border-border px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Round queue
          </p>
          <p className="font-mono text-[9px] tabular-nums text-muted-foreground">
            {roundsCompleted}/{rounds} complete
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: queueLen }, (_, i) => {
            const filled = i < roundsCompleted;
            const active = isRunning && i === roundsCompleted;
            return (
              <span
                key={i}
                className={cn(
                  "inline-flex h-7 min-w-[2rem] items-center justify-center rounded-[4px] border font-mono text-[10px] tabular-nums",
                  filled &&
                    "border-[#4ade80]/40 bg-[#4ade80]/10 text-[#4ade80]",
                  active &&
                    "border-primary/50 bg-primary/10 text-primary animate-pulse",
                  !filled &&
                    !active &&
                    "border-border bg-muted text-muted-foreground"
                )}
              >
                R{i + 1}
              </span>
            );
          })}
          {rounds > 16 ? (
            <span className="font-mono text-[10px] text-muted-foreground">+{rounds - 16}</span>
          ) : null}
        </div>
      </div>

      {focusObjective?.trim() ? (
        <div className="border-t border-border px-3 py-2">
          <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Operator focus
          </p>
          <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground">
            {focusObjective.trim()}
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <p className="font-mono text-[10px] text-muted-foreground">
          {isRunning
            ? "Awaiting adversarial exchange telemetry…"
            : "Session theater opens when rounds land"}
        </p>
        {!isRunning && onLaunch ? (
          <Button size="sm" disabled={!canLaunch} onClick={onLaunch}>
            Start scan
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 font-mono text-[13px] tabular-nums text-foreground", valueClassName)}>
        {value}
      </p>
    </div>
  );
}
