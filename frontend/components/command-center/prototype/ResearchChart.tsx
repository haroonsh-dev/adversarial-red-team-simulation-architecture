"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useThemeSafe } from "@/lib/context/ThemeProvider";
import { yAxisScale, type ChartAnnotation, type DetectionPoint } from "./model";
import { MinMaxLast } from "./atoms";

export function ResearchChart({
  series,
  annotations,
  compact,
  highlightPlaybook,
}: {
  series: DetectionPoint[];
  annotations: ChartAnnotation[];
  compact?: boolean;
  highlightPlaybook?: string | null;
}) {
  const { isLight } = useThemeSafe();
  const artsa = series.map((p) => p.artsa);
  const base = series.map((p) => p.baseline);
  const last = artsa[artsa.length - 1] ?? 0;
  const baseLast = base[base.length - 1] ?? 62;
  const y = yAxisScale([...artsa, ...base]);

  const artsStroke = isLight ? "#0284c7" : "#00d2ff";
  const baseStroke = isLight ? "#94a3b8" : "#64748b";
  const gridStroke = isLight ? "rgba(0, 0, 0, 0.07)" : "rgba(255, 255, 255, 0.07)";
  const tickFill = isLight ? "#64748b" : "#94a3b8";
  const tooltipBg = isLight ? "#ffffff" : "#131622";
  const tooltipBorder = isLight ? "rgba(0, 0, 0, 0.12)" : "rgba(255, 255, 255, 0.12)";
  const tooltipText = isLight ? "#0f172a" : "#f8fafc";

  return (
    <div className="flex h-full min-h-[320px] w-full flex-col">
      {compact ? null : (
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <MinMaxLast
            name="ARTSA"
            min={artsa.length ? Math.min(...artsa) : 0}
            max={artsa.length ? Math.max(...artsa) : 0}
            last={last}
            accent="text-[var(--cc-primary)]"
          />
          <MinMaxLast
            name="BASE"
            min={base.length ? Math.min(...base) : 62}
            max={base.length ? Math.max(...base) : 62}
            last={baseLast}
          />
        </div>
      )}
      <div className="relative min-h-[260px] w-full flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={260} minWidth={100}>
          <ComposedChart data={series} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="cc-artsa-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={artsStroke} stopOpacity={isLight ? 0.22 : 0.3} />
                <stop offset="100%" stopColor={artsStroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={gridStroke} strokeDasharray="3 6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: tickFill, fontFamily: "ui-monospace, monospace" }}
              axisLine={false}
              tickLine={false}
              minTickGap={28}
            />
            <YAxis
              type="number"
              domain={y.domain}
              ticks={y.ticks}
              allowDecimals={false}
              reversed={false}
              tick={{ fontSize: 10, fill: tickFill, fontFamily: "ui-monospace, monospace" }}
              axisLine={false}
              tickLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: tooltipBg,
                borderColor: tooltipBorder,
                borderRadius: "8px",
                color: tooltipText,
                fontSize: "11px",
                fontFamily: "ui-monospace, monospace",
                boxShadow: isLight ? "0 4px 12px rgba(0,0,0,0.08)" : "0 8px 24px rgba(0,0,0,0.5)",
              }}
              formatter={(value, name) => [`${value}%`, String(name)]}
            />
            {annotations.map((a) => {
              const hot = highlightPlaybook === a.playbook;
              return (
                <ReferenceLine
                  key={a.playbook}
                  x={a.label}
                  stroke={hot ? artsStroke : baseStroke}
                  strokeWidth={hot ? 2 : 1}
                  strokeDasharray={hot ? undefined : "2 3"}
                  label={{
                    value: a.playbook,
                    position: "insideTopRight",
                    fill: hot ? artsStroke : baseStroke,
                    fontSize: 9,
                    fontFamily: "ui-monospace, monospace",
                  }}
                />
              );
            })}
            <Area
              type="monotone"
              dataKey="artsa"
              name="ARTSA"
              stroke={artsStroke}
              strokeWidth={2.1}
              fill="url(#cc-artsa-fill)"
              dot={false}
              activeDot={{ r: 4, fill: artsStroke, stroke: tooltipBg, strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              name="Baseline"
              stroke={baseStroke}
              strokeWidth={1.2}
              strokeDasharray="4 3"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

