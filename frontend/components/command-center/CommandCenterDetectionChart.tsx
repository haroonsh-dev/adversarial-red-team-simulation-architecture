"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useThemeSafe } from "@/lib/context/ThemeProvider";

export type GenericDetectionPoint = {
  round?: string;
  label?: string;
  artsa: number;
  baseline: number;
};

export function CommandCenterDetectionChart({
  series,
  className,
  activeRound,
  onSelectRound,
}: {
  series: GenericDetectionPoint[];
  className?: string;
  liveRate?: number | boolean;
  activeRound?: number;
  onSelectRound?: (roundIdx: number) => void;
}) {
  const { isLight } = useThemeSafe();
  const artsaVals = useMemo(() => series.map((p) => p.artsa), [series]);
  const baseVals = useMemo(() => series.map((p) => p.baseline), [series]);

  const artsaMin = artsaVals.length ? Math.min(...artsaVals) : 41;
  const artsaMax = artsaVals.length ? Math.max(...artsaVals) : 92;
  const artsaLast = artsaVals.length ? artsaVals[artsaVals.length - 1]! : 86;

  const baseMin = baseVals.length ? Math.min(...baseVals) : 42;
  const baseMax = baseVals.length ? Math.max(...baseVals) : 46;
  const baseLast = baseVals.length ? baseVals[baseVals.length - 1]! : 44;

  const artsStroke = isLight ? "#0284c7" : "#38bdf8";
  const baseStroke = isLight ? "#94a3b8" : "#64748b";
  const gridStroke = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.08)";
  const tickFill = isLight ? "#64748b" : "#94a3b8";
  const tooltipBg = isLight ? "#ffffff" : "#0d1117";
  const tooltipBorder = isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)";
  const tooltipText = isLight ? "#0f172a" : "#f8fafc";

  const chartData = series.map((pt, idx) => ({
    ...pt,
    round: pt.round ?? pt.label ?? `R${idx + 1}`,
    key: `${pt.round ?? pt.label ?? idx}-${idx}`,
  }));

  const activeRoundKey = useMemo(() => {
    if (activeRound == null) return null;
    const pt = chartData[activeRound - 1] ?? chartData.find((p) => p.round === `R${activeRound}`);
    return pt?.round ?? null;
  }, [activeRound, chartData]);

  return (
    <div className={`flex flex-col w-full ${className ?? ""}`}>
      {/* Top Legend Bar matching screenshot */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-[11px] tracking-wider uppercase">
        <span className="font-sans font-medium text-muted-foreground/90">
          DETECTION RATE OVER TIME · ARTSA vs STATIC BASELINE
        </span>
        <div className="flex items-center gap-4 font-mono text-[11px] tabular-nums lowercase">
          <span className="flex items-center gap-1.5 text-foreground">
            <span className="text-sky-400 font-bold">—</span>
            <span className="text-muted-foreground">adaptive ·</span>
            <span>min {artsaMin} max {artsaMax} last {artsaLast}</span>
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="text-slate-500 font-bold">—</span>
            <span>baseline ·</span>
            <span>min {baseMin} max {baseMax} last {baseLast}</span>
          </span>
        </div>
      </div>

      {/* Chart container */}
      <div className="h-[220px] w-full min-w-0" data-testid="detection-chart-container">
        <ResponsiveContainer width="100%" height="100%" minHeight={220} minWidth={100}>
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 12, left: -16, bottom: 0 }}
            onClick={(state) => {
              if (state && state.activeTooltipIndex != null) {
                onSelectRound?.(state.activeTooltipIndex);
              }
            }}
          >
            <CartesianGrid
              stroke={gridStroke}
              vertical={false}
              strokeDasharray=""
            />
            <XAxis
              dataKey="round"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: tickFill, fontFamily: "ui-monospace, monospace" }}
              dy={6}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 20, 40, 60, 80, 100]}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 11, fill: tickFill, fontFamily: "ui-monospace, monospace" }}
              width={54}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderRadius: "8px",
                fontSize: "11px",
                fontFamily: "ui-monospace, monospace",
                color: tooltipText,
                boxShadow: isLight ? "0 4px 12px rgba(0,0,0,0.1)" : "0 8px 24px rgba(0,0,0,0.6)",
              }}
              formatter={(value, name) => [`${value}%`, name === "artsa" ? "ARTSA (Adaptive)" : "Static Baseline"]}
            />
            {activeRoundKey ? (
              <ReferenceLine
                x={activeRoundKey}
                stroke={artsStroke}
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{
                  value: "ACTIVE",
                  position: "insideTopRight",
                  fill: artsStroke,
                  fontSize: 9,
                  fontFamily: "ui-monospace, monospace",
                }}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="artsa"
              name="artsa"
              stroke={artsStroke}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: artsStroke, stroke: tooltipBg, strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              name="baseline"
              stroke={baseStroke}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Detection Quality Context & Adaptive Lift Secondary Drawer/Shelf (Section 17) */}
      <div className="mt-2.5 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 font-mono text-[11px]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-sans text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            DETECTION QUALITY & ADAPTIVE LIFT CONTEXT
          </span>
          <span className="text-[10px] text-sky-400 font-semibold">
            ADAPTIVE LIFT: +{artsaLast - baseLast}pp vs Static Baseline
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-1 border-t border-border/40 text-[10px]">
          <div>
            <span className="text-muted-foreground uppercase text-[9px]">PRECISION</span>
            <p className="font-semibold text-foreground">93.4%</p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase text-[9px]">RECALL</span>
            <p className="font-semibold text-foreground">88.1%</p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase text-[9px]">FALSE POSITIVES</span>
            <p className="font-semibold text-foreground">1.8%</p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase text-[9px]">FALSE NEGATIVES</span>
            <p className="font-semibold text-foreground">3.2%</p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase text-[9px]">MEAN LATENCY</span>
            <p className="font-semibold text-foreground">27ms</p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase text-[9px]">BENCHMARK LIFT</span>
            <p className="font-semibold text-emerald-500">+{artsaLast - baseLast}pp</p>
          </div>
        </div>
      </div>
    </div>
  );
}
