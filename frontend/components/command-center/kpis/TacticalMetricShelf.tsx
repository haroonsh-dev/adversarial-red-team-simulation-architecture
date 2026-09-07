"use client";

import { useMemo } from "react";
import { CockpitCard } from "../cockpit/CockpitCard";
import { cn } from "@/lib/utils";
import type { StrategicModel } from "../prototype/model";

function CleanSparkline({
  values,
  strokeColor = "#00D2FF",
}: {
  values: number[];
  strokeColor?: string;
}) {
  const points = useMemo(() => {
    if (!values || values.length === 0) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const width = 64;
    const height = 22;

    return values
      .map((val, idx) => {
        const x = (idx / Math.max(1, values.length - 1)) * width;
        const y = height - ((val - min) / range) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [values]);

  if (!points) return null;

  return (
    <svg width="64" height="22" className="overflow-visible">
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

export function TacticalMetricShelf({
  model,
  onOpenInspect,
}: {
  model: StrategicModel;
  onOpenInspect: (kind: "monitor", id: string) => void;
}) {
  const kpiItems = [
    {
      id: "lift",
      label: "Adaptive Lift",
      value: `${model.lift.liftPp >= 0 ? "+" : ""}${model.lift.liftPp}pp`,
      sub: `ARTSA ${model.lift.last}% vs ${model.lift.baseline}% static baseline`,
      spark: model.lift.sparkline,
      hot: model.lift.liftPp >= 0,
      accent: model.lift.liftPp >= 0 ? "text-[var(--cc-primary)]" : "text-red-500",
      stroke: model.lift.liftPp >= 0 ? "var(--cc-primary)" : "#EF4444",
    },
    {
      id: "containment",
      label: "Active Containment",
      value: `${model.containment.total} sessions`,
      sub: `${model.containment.quarantined} quarantined · ${model.containment.terminated} terminated`,
      spark: model.containment.sparkline,
      hot: model.containment.total > 0,
      accent: "text-[var(--cc-text-primary)]",
      stroke: "var(--cc-status-containment)",
    },
    {
      id: "slo",
      label: "Hop Latency & SLO",
      value: `${model.hopSloMs}ms`,
      sub: `vs 50ms budget · ${model.hopSloBurn}% SLO burn`,
      spark: model.hops.map((h) => h.latencyMs),
      hot: model.hopSloMs <= 50,
      accent: model.hopSloMs <= 50 ? "text-[var(--cc-text-primary)]" : "text-amber-500",
      stroke: model.hopSloMs <= 50 ? "var(--cc-status-success)" : "#F59E0B",
    },
    {
      id: "disagree",
      label: "Judge ≠ Defender Disagreement",
      value: `${model.disagreement.rate}%`,
      sub: `${model.disagreement.rate}% divergence · ${model.disagreement.defenderMiss} Defender misses`,
      spark: model.disagreement.sparkline,
      hot: model.disagreement.rate < 5,
      accent: model.disagreement.rate < 5 ? "text-[var(--cc-text-primary)]" : "text-red-500",
      stroke: model.disagreement.rate < 5 ? "var(--cc-status-success)" : "#EF4444",
    },
  ];

  return (
    <div className="grid h-[88px] shrink-0 grid-cols-1 gap-3 px-4 pt-3 sm:grid-cols-2 xl:grid-cols-4">
      {kpiItems.map((kpi) => (
        <CockpitCard key={kpi.id} className="h-full">
          <button
            type="button"
            onClick={() => onOpenInspect("monitor", kpi.id)}
            className="flex h-full w-full flex-col justify-between p-2.5 text-left transition-colors hover:bg-[var(--cc-bg-surface-hover)] active:scale-[0.99]"
            title={`Inspect ${kpi.label}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-text-muted)]">
                {kpi.label}
              </span>
              <CleanSparkline values={kpi.spark} strokeColor={kpi.stroke} />
            </div>
            <div>
              <p className={cn("font-mono text-[20px] font-bold tracking-tight tabular-nums", kpi.accent)}>
                {kpi.value}
              </p>
              <p className="truncate font-mono text-[10px] text-[var(--cc-text-dim)]">
                {kpi.sub}
              </p>
            </div>
          </button>
        </CockpitCard>
      ))}
    </div>
  );
}
