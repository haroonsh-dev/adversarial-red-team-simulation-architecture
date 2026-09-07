"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiTile } from "@/components/red-team/KpiTile";
import { OutcomeBadge } from "@/components/red-team/OutcomeBadge";
import { RedTeamHomeCharts } from "@/components/red-team/RedTeamHomeCharts";
import { RedTeamGlossary } from "@/components/red-team/RedTeamGlossary";
import { SecurityBoundaryViz } from "@/components/red-team/SecurityBoundaryViz";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CHART_AXIS_TICK, CHART_CRITICAL, CHART_GRID, CHART_PRIMARY, CHART_TOOLTIP_PROPS } from "@/lib/chartTheme";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { useDashboardMetrics } from "@/lib/context/DashboardMetricsProvider";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { buildLiveAiActivity, ingestDetectionStats, severityBuckets } from "@/lib/redTeamLiveIngest";
import { deriveRedTeamOverview } from "@/lib/redTeamOverview";
import { cn } from "@/lib/utils";

const WORKFLOW = [
  { href: "/red-team/lab", label: "Attack Lab", desc: "Check a message" },
  { href: "/red-team/campaigns", label: "Campaigns", desc: "Start a run" },
  { href: "/red-team/library", label: "Attack Library", desc: "Pick a template" },
  { href: "/red-team/monitor", label: "Detections", desc: "Watch live" },
  { href: "/findings", label: "Findings", desc: "Triage hits" },
] as const;

/** Red Team home — real campaign + ingest telemetry, charts, security posture. */
export default function RedTeamHomePage() {
  const { campaigns, loading } = useCampaigns();
  const { liveEvents, connected, metrics } = useDashboardMetrics();
  const { apiOnline, wsConnected } = useConnection();

  const overview = useMemo(() => deriveRedTeamOverview(campaigns), [campaigns]);
  const ingestStats = useMemo(() => ingestDetectionStats(liveEvents), [liveEvents]);
  const sev = useMemo(() => severityBuckets(liveEvents), [liveEvents]);
  const activity = useMemo(() => buildLiveAiActivity(liveEvents), [liveEvents]);
  const live = apiOnline && (connected || wsConnected);

  const detectionOk = overview.hasFindingData
    ? (overview.detectPct ?? 0) >= 50
    : ingestStats.detectPct == null
      ? true
      : ingestStats.detectPct < 40;
  const boundaryOk = overview.critical === 0 && sev.CRITICAL === 0;
  const dataSafe = overview.successes === 0;

  if (loading && campaigns.length === 0 && liveEvents.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <RedTeamGlossary />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Red Team</h2>
          <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">
            Probe containment, launch campaigns, open live theaters — posture numbers support the next
            action.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px]",
              live
                ? "border-[hsl(var(--severity-low-border))] text-[hsl(var(--severity-low))]"
                : "border-border text-muted-foreground"
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                live ? "animate-pulse bg-[hsl(var(--severity-low))]" : "bg-muted-foreground/40"
              )}
            />
            {live ? "INGEST LIVE" : "INGEST OFF"}
            {" · "}
            {ingestStats.total} evt
          </span>
          <Button asChild size="sm" variant="outline">
            <Link href="/red-team/lab">Probe in Lab</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/red-team/campaigns/new">Launch campaign</Link>
          </Button>
        </div>
      </div>

      {/* Workflow strip */}
      <nav
        className="flex flex-wrap gap-1.5 rounded-md border border-border p-2"
        aria-label="Red Team workflow"
      >
        {WORKFLOW.map((step, i) => (
          <Link
            key={step.href}
            href={step.href}
            className="group flex min-w-[7.5rem] flex-1 items-center gap-2 rounded-md px-2.5 py-2 hover:bg-muted/40"
          >
            <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
            <span>
              <span className="block text-[12px] font-medium text-foreground group-hover:underline">
                {step.label}
              </span>
              <span className="block text-[10px] text-muted-foreground">{step.desc}</span>
            </span>
          </Link>
        ))}
      </nav>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <KpiTile label="Rounds" value={overview.attacks || "—"} hint="Campaign attacks run" />
        <KpiTile
          label="Breached"
          value={overview.successes}
          hint="Attacks that landed"
          tone={overview.successes > 0 ? "critical" : "neutral"}
        />
        <KpiTile
          label="Detect"
          value={overview.detectPct != null ? `${overview.detectPct}%` : "—"}
          hint="Blocked among judged"
          tone="success"
        />
        <KpiTile
          label="Critical"
          value={overview.critical + sev.CRITICAL}
          hint="Campaign + live"
          tone={overview.critical + sev.CRITICAL > 0 ? "critical" : "neutral"}
        />
        <KpiTile
          label="Running"
          value={overview.runningCount}
          hint="Active campaigns"
          tone={overview.runningCount > 0 ? "warning" : "neutral"}
        />
        <KpiTile
          label="Live risk"
          value={Math.round(metrics.max_risk_score || 0)}
          hint="Highest live risk"
          tone={(metrics.max_risk_score || 0) >= 80 ? "critical" : "neutral"}
        />
      </div>

      {/* Posture + boundary */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <section className="rounded-md border border-border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Live AI risk timeline
            </h3>
            <Link
              href="/red-team/monitor/live"
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Open Activity →
            </Link>
          </div>
          {activity.riskSeries.length >= 2 ? (
            <div className="h-[180px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activity.riskSeries} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rtRiskFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_PRIMARY} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...CHART_GRID} />
                  <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={CHART_AXIS_TICK} axisLine={false} tickLine={false} />
                  <Tooltip {...CHART_TOOLTIP_PROPS} />
                  <Area
                    type="monotone"
                    dataKey="risk"
                    stroke={CHART_PRIMARY}
                    fill="url(#rtRiskFill)"
                    strokeWidth={1.5}
                    name="Risk"
                  />
                  <Area
                    type="monotone"
                    dataKey="critical"
                    stroke={CHART_CRITICAL}
                    fill="transparent"
                    strokeWidth={1.25}
                    name="Critical band"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[180px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border text-center text-[12px] text-muted-foreground">
              <p className="text-[13px] text-foreground">No live activity yet</p>
              <p className="max-w-xs">Run a check in Attack Lab or start a campaign — risk over time will show here.</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href="/red-team/lab">Attack Lab</Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/red-team/campaigns/new">Start campaign</Link>
                </Button>
              </div>
            </div>
          )}
          {overview.untested.length > 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">Untested families: </span>
              {overview.untested.join(" · ")}
            </p>
          ) : null}
        </section>

        <SecurityBoundaryViz
          detectionOk={detectionOk}
          boundaryOk={boundaryOk}
          dataSafe={dataSafe}
          className="lg:sticky lg:top-2 lg:self-start"
        />
      </div>

      <RedTeamHomeCharts
        coverageChart={overview.coverageChart}
        outcomeChart={overview.outcomeChart}
        statusMix={overview.statusMix}
        campaignRisk={overview.campaignRisk}
        hasFindingData={overview.hasFindingData}
      />

      {/* Posture banner */}
      <div
        className={cn(
          "rounded-md border px-3 py-2.5 text-[13px]",
          overview.posture === "strong" &&
            "border-[hsl(var(--severity-low-border))] bg-[hsl(var(--severity-low))]/5",
          overview.posture === "mixed" &&
            "border-[hsl(var(--severity-medium-border))] bg-[hsl(var(--severity-medium))]/5",
          overview.posture === "weak" &&
            "border-[hsl(var(--severity-critical-border))] bg-[hsl(var(--severity-critical))]/5",
          overview.posture === "unknown" && "border-border"
        )}
      >
        <span className="font-medium">Defense posture: </span>
        {overview.posture === "strong" && "Strong — most judged attacks were blocked."}
        {overview.posture === "mixed" && "Mixed — several attacks landed; tighten policies."}
        {overview.posture === "weak" && "Weak — breach rate is high; prioritize remediations."}
        {overview.posture === "unknown" &&
          "Unknown — run a campaign or check an attack message to measure detection."}
      </div>

      {/* Recent findings */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Recent findings
          </h3>
          <Link
            href="/red-team/findings"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            All findings →
          </Link>
        </div>
        {overview.recent.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-[13px] text-muted-foreground">
            No findings yet.{" "}
            <Link href="/red-team/campaigns/new" className="underline-offset-2 hover:underline">
              Create a campaign
            </Link>{" "}
            or probe in{" "}
            <Link href="/red-team/lab" className="underline-offset-2 hover:underline">
              Attack Lab
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {overview.recent.map((row) => (
              <li key={row.id}>
                <Link
                  href={row.href}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[13px] hover:bg-muted/30"
                >
                  <span className="min-w-0 truncate font-medium">{row.title}</span>
                  <div className="flex items-center gap-2">
                    <OutcomeBadge
                      outcome={row.outcome === "success" ? "attack_succeeded" : "blocked"}
                    />
                    <span className="text-[11px] text-muted-foreground">{row.when}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {overview.runningCount > 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {overview.runningCount} campaign{overview.runningCount === 1 ? "" : "s"} running —{" "}
          <Link href="/red-team/monitor" className="underline-offset-2 hover:underline">
            open Monitor
          </Link>
        </p>
      ) : null}
    </div>
  );
}
