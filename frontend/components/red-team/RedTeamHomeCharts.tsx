"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_AXIS_TICK, CHART_CRITICAL, CHART_GRID, CHART_TOOLTIP_PROPS } from "@/lib/chartTheme";

type CoverageRow = {
  family: string;
  full: string;
  tested: number;
  breached: number;
  blocked: number;
  defendPct: number;
};

type NamedValue = { name: string; value: number; fill: string };

type CampaignRiskRow = {
  id: string;
  name: string;
  fullName: string;
  risk: number;
  rounds: number;
  total: number;
  status: string;
  provider?: string;
  model?: string;
  error?: string | null;
};

/** Recharts panels for Red Team home — real campaign aggregates only. */
export function RedTeamHomeCharts({
  coverageChart,
  outcomeChart,
  statusMix,
  campaignRisk,
  hasFindingData,
}: {
  coverageChart: CoverageRow[];
  outcomeChart: NamedValue[];
  statusMix: NamedValue[];
  campaignRisk: CampaignRiskRow[];
  hasFindingData: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-md border border-border p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Family coverage
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">tested · blocked · breach</span>
        </div>
        {coverageChart.some((r) => r.tested > 0) ? (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coverageChart} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid {...CHART_GRID} />
                <XAxis dataKey="family" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  {...CHART_TOOLTIP_PROPS}
                  formatter={(value, name) => [value, String(name)]}
                  labelFormatter={(_, payload) => {
                    const row = payload?.[0]?.payload as CoverageRow | undefined;
                    return row?.full ?? "";
                  }}
                />
                <Bar dataKey="blocked" stackId="a" fill="hsl(var(--severity-low))" name="Blocked" radius={[0, 0, 0, 0]} />
                <Bar dataKey="breached" stackId="a" fill={CHART_CRITICAL} name="Breached" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart hint="Run a campaign — family coverage fills from findings." />
        )}
      </section>

      <section className="rounded-md border border-border p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Attack outcomes
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {hasFindingData ? "from findings" : "no findings"}
          </span>
        </div>
        {outcomeChart.length > 0 ? (
          <div className="flex h-[220px] items-center gap-4">
            <div className="h-full min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={outcomeChart}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    {outcomeChart.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP_PROPS} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-28 shrink-0 space-y-2 font-mono text-[11px]">
              {outcomeChart.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ background: d.fill }} />
                    {d.name}
                  </span>
                  <span className="text-foreground">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyChart hint="Outcomes appear after campaign rounds are judged." />
        )}
      </section>

      <section className="rounded-md border border-border p-3 lg:col-span-2">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Campaign risk
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {campaignRisk.length} campaigns · live API · risk 0–100
          </span>
        </div>
        {campaignRisk.length > 0 ? (
          <div className="max-h-[360px] overflow-y-auto rounded-md border border-border/60">
            <table className="w-full min-w-[520px] text-left text-[12px]">
              <thead className="sticky top-0 z-[1] border-b border-border bg-muted text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Campaign</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Rounds</th>
                  <th className="min-w-[140px] px-3 py-2 font-medium">Risk</th>
                  <th className="px-3 py-2 font-medium tabular-nums">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {campaignRisk.map((row) => {
                  const failed = row.status === "FAILED" || row.status === "ERROR";
                  const running = row.status === "RUNNING" || row.status === "PENDING";
                  const barColor = failed
                    ? "bg-[hsl(var(--severity-critical))]"
                    : row.risk >= 80
                      ? "bg-[hsl(var(--severity-critical))]"
                      : row.risk >= 50
                        ? "bg-[hsl(var(--severity-medium))]"
                        : running
                          ? "bg-[#67b3ef]"
                          : "bg-[hsl(var(--severity-low))]";
                  return (
                    <tr key={row.id} className="hover:bg-muted/20">
                      <td className="max-w-[280px] px-3 py-2">
                        <Link
                          href={`/red-team/monitor/${row.id}`}
                          className="block truncate font-medium text-foreground hover:underline"
                          title={row.fullName}
                        >
                          {row.fullName}
                        </Link>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {[row.provider, row.model].filter(Boolean).join(" / ") || row.id.slice(0, 8)}
                          {row.error ? ` · ${row.error}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            failed
                              ? "font-mono text-[10px] uppercase text-[hsl(var(--severity-critical))]"
                              : running
                                ? "font-mono text-[10px] uppercase text-[#67b3ef]"
                                : "font-mono text-[10px] uppercase text-muted-foreground"
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-muted-foreground">
                        {row.rounds}/{row.total || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${Math.max(row.risk > 0 ? 4 : 0, row.risk)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums text-foreground">{row.risk}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyChart hint="Launch a campaign to plot risk by run." />
        )}
      </section>

      <section className="rounded-md border border-border p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Campaign status mix
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">live API</span>
        </div>
        {statusMix.length > 0 ? (
          <div className="flex h-[220px] items-center gap-4">
            <div className="h-full min-w-0 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusMix}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    {statusMix.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP_PROPS} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="w-28 shrink-0 space-y-2 font-mono text-[11px]">
              {statusMix.map((d) => (
                <li key={d.name} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ background: d.fill }} />
                    {d.name}
                  </span>
                  <span className="text-foreground">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <EmptyChart hint="No campaigns yet." />
        )}
      </section>
    </div>
  );
}

function EmptyChart({ hint }: { hint: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-[12px] text-muted-foreground">
      {hint}
    </div>
  );
}
