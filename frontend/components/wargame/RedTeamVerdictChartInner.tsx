"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { VerdictSlice } from "@/lib/redTeamAnalytics";
import { CHART_TOOLTIP_PROPS } from "@/lib/chartTheme";

export default function RedTeamVerdictChartInner({ data }: { data: VerdictSlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative h-[220px] w-full" role="img" aria-label="Verdict mix">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="hsl(var(--background))"
            strokeWidth={2}
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.fill} />
            ))}
          </Pie>
          <Tooltip {...CHART_TOOLTIP_PROPS} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Rounds</p>
        <p className="font-mono text-xl font-medium text-foreground">{total}</p>
      </div>
    </div>
  );
}
