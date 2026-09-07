"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  Activity,
  BarChart3,
  Download,
  Gauge,
  ShieldCheck,
  Shield,
  Target,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatCard } from "@/components/shared/StatCard";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { ThreatMatrix } from "@/components/shared/ThreatMatrix";
import { RiskTrendChart } from "@/components/charts/RiskTrendChart";
import { SeverityDonutChart } from "@/components/charts/SeverityDonutChart";
import {
  ActionMixChart,
  RankedBarChart,
  VolumeStackedChart,
} from "@/components/charts/AnalyticsMixCharts";
import { StatCardsSkeleton, ChartSkeleton } from "@/components/shared/PageSkeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDashboardMetrics } from "@/lib/hooks/useDashboardMetrics";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { severityFromScore } from "@/lib/severity";
import { PageStack } from "@/components/shared/PageStack";
import { EMPTY_STATE_UI } from "@/lib/getStartedLabels";
import dynamic from "next/dynamic";
import { DetectionRateChart } from "@/components/charts/DetectionRateChart";
import {
  buildDetectionSeries,
  detectionSeriesToCsv,
  downloadTextFile,
} from "@/lib/detectionAnalytics";
import {
  analyticsBundleToCsv,
  deriveEnterpriseAnalytics,
} from "@/lib/enterpriseAnalytics";

const ObservatoryPanel = dynamic(() => import("@/components/ObservatoryPanel"), { ssr: false });
const XRayPanel = dynamic(() => import("@/components/XRayPanel"), { ssr: false });

export default function AnalyticsPage() {
  const { metrics, liveEvents, loading } = useDashboardMetrics();
  const { apiOnline, wsConnected } = useConnection();

  const analytics = useMemo(
    () => deriveEnterpriseAnalytics(metrics, liveEvents),
    [metrics, liveEvents]
  );

  const detectionSeries = useMemo(
    () => buildDetectionSeries(metrics?.risk_trend, metrics?.defense_score),
    [metrics?.risk_trend, metrics?.defense_score]
  );

  const exportAll = () => {
    downloadTextFile(
      `artsa-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
      analyticsBundleToCsv(analytics)
    );
  };

  const exportDetectionCsv = () => {
    if (!detectionSeries.length) return;
    downloadTextFile(
      `artsa-detection-rate-${new Date().toISOString().slice(0, 10)}.csv`,
      detectionSeriesToCsv(detectionSeries)
    );
  };

  return (
    <PageStack>
      <PageHeader
        title="Security analytics"
        description="Risk over time, how serious events were, and what ARTSA did — from live activity only."
        icon={<BarChart3 className="h-5 w-5" />}
        badge={<LiveIndicator connected={apiOnline && wsConnected} className="meta-badge" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!analytics.hasLiveSignal}
              onClick={exportAll}
            >
              <Download className="h-3.5 w-3.5" />
              Export bundle CSV
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/logs">Open security log</Link>
            </Button>
          </div>
        }
      />

      {loading ? (
        <StatCardsSkeleton />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard label="Events" value={analytics.totalEvents} icon={Activity} />
          <StatCard
            label="Containment rate"
            value={`${analytics.containmentRate}%`}
            icon={Shield}
            subtitle={`${analytics.containedCount} enforced`}
          />
          <StatCard
            label="Avg risk"
            value={analytics.avgRisk}
            severity={severityFromScore(analytics.avgRisk)}
          />
          <StatCard
            label="Max risk"
            value={analytics.maxRisk}
            severity={severityFromScore(analytics.maxRisk)}
          />
          <StatCard
            label="Defense score"
            value={`${analytics.defenseScore}%`}
            icon={Gauge}
          />
          <StatCard
            label="Critical"
            value={analytics.severitySlices.find((s) => s.key === "CRITICAL")?.value ?? 0}
            severity="CRITICAL"
          />
        </div>
      )}

      {/* Primary ops row */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <DashboardCard
          title="Risk trajectory"
          description="Live risk score with CRITICAL (≥80) and HIGH (≥50) reference bands"
          contentClassName="space-y-2"
        >
          {loading ? (
            <ChartSkeleton />
          ) : analytics.riskTrend.length > 0 ? (
            <>
              <RiskTrendChart data={analytics.riskTrend} />
              <div className="flex flex-wrap gap-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                <span>
                  Avg <span className="text-foreground">{analytics.avgRisk}</span>
                </span>
                <span>
                  Max <span className="text-foreground">{analytics.maxRisk}</span>
                </span>
                <span>
                  Points <span className="text-foreground">{analytics.riskTrend.length}</span>
                </span>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Activity}
              title={EMPTY_STATE_UI.noAnalyticsTitle}
              description={EMPTY_STATE_UI.noAnalyticsDescription}
              action={
                <Button asChild size="sm">
                  <Link href="/sandbox">Generate live traffic</Link>
                </Button>
              }
              className="py-16"
            />
          )}
        </DashboardCard>

        <DashboardCard
          title="Severity mix"
          description="Distribution of screened events by severity band"
        >
          {loading ? (
            <ChartSkeleton />
          ) : analytics.severitySlices.some((s) => s.value > 0) ? (
            <>
              <SeverityDonutChart data={analytics.severitySlices} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                {analytics.severitySlices.map((s) => (
                  <div
                    key={s.key}
                    className="flex items-center justify-between rounded-[6px] border border-border bg-background px-2.5 py-1.5 font-mono text-[11px]"
                  >
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: s.fill }} />
                      {s.label}
                    </span>
                    <span className="text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Target}
              title="No severity data"
              description="Severity mix appears once ingest or metrics report events."
              className="py-12"
            />
          )}
        </DashboardCard>
      </div>

      {/* Secondary row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard
          title="Detection rate vs static baseline"
          description="ARTSA live detection vs fixed 62% baseline"
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={detectionSeries.length === 0}
              onClick={exportDetectionCsv}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
          }
        >
          {loading ? (
            <ChartSkeleton />
          ) : detectionSeries.length > 0 ? (
            <DetectionRateChart data={detectionSeries} />
          ) : (
            <EmptyState
              icon={BarChart3}
              title="No detection trend yet"
              description="Ingest agent traffic to plot live detection against the static baseline."
              className="py-12"
            />
          )}
        </DashboardCard>

        <DashboardCard
          title="Containment action mix"
          description="Kill · quarantine · flag · allow decisions from live stream"
        >
          {loading ? (
            <ChartSkeleton />
          ) : analytics.actionSlices.length > 0 ? (
            <ActionMixChart data={analytics.actionSlices} />
          ) : (
            <EmptyState
              icon={Shield}
              title="No actions yet"
              description="Containment actions appear as the engine screens tool calls."
              className="py-12"
            />
          )}
        </DashboardCard>
      </div>

      {/* Volume + ranks */}
      <div className="grid gap-4 xl:grid-cols-3">
        <DashboardCard
          title="Event volume"
          description="Throughput stacked by elevated severity"
          contentClassName="space-y-2"
        >
          {analytics.volume.length > 0 ? (
            <VolumeStackedChart data={analytics.volume} />
          ) : (
            <EmptyState
              icon={Activity}
              title="No volume series"
              description="Volume buckets fill from live telemetry timestamps."
              className="py-10"
            />
          )}
        </DashboardCard>

        <DashboardCard title="Highest-risk tools" description="Peak risk · call volume">
          {analytics.topTools.length > 0 ? (
            <RankedBarChart data={analytics.topTools} valueKey="maxRisk" />
          ) : (
            <EmptyState
              icon={Target}
              title="No tools ranked"
              description="Tool ranks appear after screened tool calls."
              className="py-10"
            />
          )}
        </DashboardCard>

        <DashboardCard title="Highest-risk agents" description="Peak risk · call volume">
          {analytics.topAgents.length > 0 ? (
            <RankedBarChart data={analytics.topAgents} valueKey="maxRisk" />
          ) : (
            <EmptyState
              icon={Target}
              title="No agents ranked"
              description="Agent ranks appear after live agent traffic."
              className="py-10"
            />
          )}
        </DashboardCard>
      </div>

      <DashboardCard title="Defense depth" description="Multi-layer containment effectiveness">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Overall defense score
          </span>
          <Badge variant="outline" className="meta-badge font-mono">
            {analytics.defenseScore}%
          </Badge>
        </div>
        <div className="space-y-3">
          {analytics.defenseLayers.map((layer) => (
            <div key={layer.key} className="space-y-1.5">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted-foreground">{layer.label}</span>
                <span className="font-mono text-foreground">{layer.value}%</span>
              </div>
              <Progress value={layer.value} className="h-1.5" aria-label={`${layer.label} at ${layer.value}%`} />
            </div>
          ))}
          {analytics.defenseLayers.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              Send agent activity to see layer-by-layer scores.
            </p>
          )}
        </div>
      </DashboardCard>

      <ThreatMatrix />

      <DashboardCard
        title="Continuous observatory"
        description="Regression gates, co-evolution metrics, and detector ablation"
        badge={<ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />}
      >
        <ObservatoryPanel />
      </DashboardCard>

      <XRayPanel />
    </PageStack>
  );
}
