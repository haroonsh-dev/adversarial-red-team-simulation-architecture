"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SeveritySlice } from "@/lib/enterpriseAnalytics";
import { CHART_TOOLTIP_PROPS } from "@/lib/chartTheme";

export default function SeverityDonutChartInner({ data }: { data: SeveritySlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const chartData = data.filter((d) => d.value > 0);

  return (
    <div className="relative h-[260px] w-full" role="img" aria-label="Severity distribution">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData.length ? chartData : [{ key: "EMPTY", label: "None", value: 1, fill: "#313131" }]}
            dataKey="value"
            nameKey="label"
            innerRadius="58%"
            outerRadius="82%"
            paddingAngle={chartData.length > 1 ? 2 : 0}
            stroke="hsl(var(--background))"
            strokeWidth={2}
          >
            {(chartData.length ? chartData : [{ fill: "#313131" }]).map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip
            {...CHART_TOOLTIP_PROPS}
            formatter={(value: number, name: string) => [`${value}`, name]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Events</p>
        <p className="font-mono text-2xl font-medium tabular-nums text-foreground">{total}</p>
      </div>
    </div>
  );
}
