"use client";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_AXIS_TICK, CHART_CRITICAL, CHART_GRID, CHART_PRIMARY, CHART_TOOLTIP_PROPS } from "@/lib/chartTheme";
import type { LiveAiActivityModel } from "@/lib/redTeamLiveIngest";
import { cn } from "@/lib/utils";

/** Live AI activity visualization — pipeline + charts from ingest telemetry. */
export function LiveAiActivityViz({
  model,
  className,
}: {
  model: LiveAiActivityModel;
  className?: string;
}) {
  const { riskSeries, tools, agents, detectors, pipeline, latest } = model;
  const idle = !latest;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Kill-chain style AI activity pipeline */}
      <div className="rounded-md border border-border p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            AI activity path
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {idle ? "idle" : "live hop"}
          </span>
        </div>
        <div className="flex flex-wrap items-stretch gap-1 sm:flex-nowrap">
          {pipeline.map((node, i) => (
            <div key={node.id} className="flex min-w-0 flex-1 items-center gap-1">
              <div
                className={cn(
                  "w-full rounded-md border px-2.5 py-2.5 transition-colors",
                  node.active
                    ? node.hot
                      ? "border-[hsl(var(--severity-critical))]/50 bg-[hsl(var(--severity-critical))]/10"
                      : "border-foreground/20 bg-muted/40"
                    : "border-border/60 opacity-45"
                )}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {node.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 truncate font-mono text-[11px]",
                    node.hot ? "text-[hsl(var(--severity-critical))]" : "text-foreground"
                  )}
                >
                  {node.detail}
                </p>
              </div>
              {i < pipeline.length - 1 ? (
                <span
                  className={cn(
                    "hidden shrink-0 sm:inline",
                    node.hot ? "animate-pulse text-[hsl(var(--severity-critical))]" : "text-muted-foreground"
                  )}
                  aria-hidden
                >
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Risk over time */}
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Live risk timeline
          </p>
          <div className="h-[200px] w-full" role="img" aria-label="Risk score over recent events">
            {riskSeries.length < 2 ? (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                Need 2+ live events for the chart
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={riskSeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, 100]}
                    tick={CHART_AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                    width={28}
                  />
                  <Tooltip {...CHART_TOOLTIP_PROPS} />
                  <Area
                    type="monotone"
                    dataKey="risk"
                    stroke={CHART_PRIMARY}
                    fill={CHART_PRIMARY}
                    fillOpacity={0.15}
                    strokeWidth={1.75}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="critical"
                    stroke={CHART_CRITICAL}
                    fill={CHART_CRITICAL}
                    fillOpacity={0.35}
                    strokeWidth={0}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tools / AI surfaces */}
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI tools / surfaces
          </p>
          <div className="h-[200px] w-full" role="img" aria-label="Tool call volume">
            {tools.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[12px] text-muted-foreground">
                No tool activity yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={tools}
                  layout="vertical"
                  margin={{ top: 4, right: 8, left: 8, bottom: 0 }}
                >
                  <CartesianGrid {...CHART_GRID} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={CHART_AXIS_TICK} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="tool"
                    width={88}
                    tick={CHART_AXIS_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...CHART_TOOLTIP_PROPS} />
                  <Bar dataKey="count" fill={CHART_PRIMARY} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {/* Agents */}
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Active agents
          </p>
          {agents.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">No agents yet</p>
          ) : (
            <ul className="space-y-2">
              {agents.map((a) => (
                <li key={a.agent} className="flex items-center gap-3 text-[12px]">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      a.maxRisk >= 80
                        ? "animate-pulse bg-[hsl(var(--severity-critical))]"
                        : a.maxRisk >= 50
                          ? "bg-[hsl(var(--severity-high))]"
                          : "bg-[hsl(var(--severity-low))]"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate font-medium">{a.agent}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    n{a.count} · R{Math.round(a.maxRisk)}
                  </span>
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-[#67b3ef]"
                      style={{ width: `${Math.min(100, a.maxRisk)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detectors */}
        <div className="rounded-md border border-border p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Detector hits
          </p>
          {detectors.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted-foreground">
              No detector hits yet — safe traffic or waiting for scans
            </p>
          ) : (
            <ul className="space-y-2">
              {detectors.map((d) => {
                const max = detectors[0]?.hits ?? 1;
                return (
                  <li key={d.name} className="text-[12px]">
                    <div className="mb-1 flex justify-between gap-2">
                      <span className="truncate font-medium">{d.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{d.hits}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--severity-critical))]"
                        style={{ width: `${Math.round((d.hits / max) * 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
