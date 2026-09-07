"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Calendar, Flame, CheckCircle2, AlertTriangle, Layers, Loader2, Server } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { CHART_TOOLTIP_PROPS } from "@/lib/chartTheme";
import { fetchFromBackend } from "@/lib/api";
import { EMPTY_STATE_UI } from "@/lib/getStartedLabels";
import { formatDateTime } from "@/lib/dates";
import { useAuthRole } from "@/lib/hooks/useAuthRole";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ObservatoryData {
  total_rounds: number;
  heatmap: Array<{ day: string; rounds: number; intensity: number }>;
  red_queen: Array<{ generation: number; attack_success: number; adaptation_measured?: boolean }>;
  regression_suite: {
    gates: Array<{ name: string; status: string; severity: string; value: number }>;
    passing: number;
    total: number;
  };
  benchmark: {
    avg_latency_ms: number;
    thresholds: Array<{ threshold: number; precision: number; recall: number; fpr: number }>;
  };
  ablation?: {
    baseline: { recall_at_80: number; precision_at_80: number };
    ablation: Array<{
      detector: string;
      recall_at_80: number;
      recall_delta_vs_baseline: number;
      avg_latency_ms: number;
    }>;
    dataset_version?: string;
  } | null;
  ablation_available?: boolean;
  ablation_schedule?: {
    enabled: boolean;
    interval_sec: number;
    last_run_at: string | null;
    next_run_at: string | null;
    runs_total: number;
  };
  dataset_version?: string;
  benchmark_cached?: boolean;
  platform?: {
    environment: string;
    rag_backend: string;
    oidc_enabled: boolean;
    auth_required: boolean;
    use_sqlite: boolean;
    use_celery: boolean;
    embedding_model: string;
  };
}

/**
 * Continuous Observatory — security regression tracking, Red Queen
 * co-evolution metrics, and CI benchmark gates (live data only).
 * Folds the former /observatory page into the Command Center.
 */
export default function ObservatoryPanel() {
  const [data, setData] = useState<ObservatoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [ablationRunning, setAblationRunning] = useState(false);
  const { capabilities } = useAuthRole();

  const loadObservatory = () =>
    fetchFromBackend("/api/v1/observatory", { silent: true }).then((res) => {
      if (res && typeof res === "object" && "total_rounds" in (res as Record<string, unknown>)) {
        setData(res as ObservatoryData);
      } else {
        setData(null);
      }
      setLoading(false);
    });

  useEffect(() => {
    loadObservatory();
  }, []);

  const handleRunAblation = async () => {
    setAblationRunning(true);
    await fetchFromBackend("/api/v1/benchmark/ablation", { method: "POST" });
    await loadObservatory();
    setAblationRunning(false);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading observatory…</p>;
  }

  const heatmap = data?.heatmap ?? [];
  const redQueen = data?.red_queen ?? [];
  const gates = data?.regression_suite?.gates ?? [];
  const ablationRows =
    data?.ablation?.ablation.map((row) => ({
      detector: row.detector.replace("Detector", ""),
      recall_delta: row.recall_delta_vs_baseline,
      recall_at_80: row.recall_at_80,
    })) ?? [];

  const formatScheduleTime = (iso: string | null | undefined) =>
    formatDateTime(iso, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  const schedule = data?.ablation_schedule;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Continuous Observatory</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Security regression tracking, Red Queen co-evolution metrics, and CI benchmark gates — live data only.
        </p>
      </div>

      {data?.platform && (
        <DashboardCard
          title="Platform Status"
          description="Runtime configuration for auth, RAG, and detection pipeline"
          badge={
            <Badge variant="outline" className="font-mono text-[10px] uppercase">
              {data.platform.environment}
            </Badge>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "RAG backend", value: data.platform.rag_backend },
              { label: "Auth mode", value: data.platform.oidc_enabled ? "OIDC + API key" : "API key" },
              { label: "Auth required", value: data.platform.auth_required ? "yes" : "no" },
              { label: "Database", value: data.platform.use_sqlite ? "SQLite" : "Postgres" },
              { label: "Async ingest", value: data.platform.use_celery ? "Celery" : "inline" },
              { label: "Embeddings", value: data.platform.embedding_model },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Server className="h-3 w-3" aria-hidden />
                  {item.label}
                </p>
                <p className="mt-1 font-mono text-xs text-foreground">{item.value}</p>
              </div>
            ))}
          </div>
          {data.dataset_version && (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground">
              Benchmark dataset: {data.dataset_version}
              {data.benchmark_cached ? " · cached" : " · fresh run"}
            </p>
          )}
        </DashboardCard>
      )}

      <DashboardCard
        title="Simulation Heatmap"
        description="30-day wargame activity intensity"
        badge={
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" aria-hidden />
            Last 30 days
          </span>
        }
      >
        {heatmap.length > 0 ? (
          <div
            className="grid grid-cols-10 gap-1.5 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-15"
            role="img"
            aria-label="30-day attack activity heatmap"
          >
            {heatmap.map((cell) => (
              <div
                key={cell.day}
                title={`${cell.day}: ${cell.rounds} rounds`}
                aria-label={`${cell.day}: ${cell.rounds} rounds, intensity ${cell.intensity}`}
                className={cn(
                  "aspect-square rounded-sm",
                  cell.intensity >= 4 && "bg-severity-critical/80",
                  cell.intensity === 3 && "bg-severity-high/80",
                  cell.intensity === 2 && "bg-severity-medium/70",
                  cell.intensity === 1 && "bg-severity-low/60",
                  cell.intensity === 0 && "bg-muted"
                )}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Calendar}
            title="No campaign data"
            description="Run a red-team scan to fill the activity heatmap."
            action={
              <Button asChild size="sm">
                <Link href="/campaigns">{EMPTY_STATE_UI.runWargame}</Link>
              </Button>
            }
          />
        )}
      </DashboardCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DashboardCard
          title="Red Queen Dynamics"
          description="Attack success trend per generation — adaptation loop not yet wired to campaign outcomes"
        >
          {redQueen.length > 0 ? (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={redQueen}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="generation" tickFormatter={(g) => `G${g}`} stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
                  <Tooltip {...CHART_TOOLTIP_PROPS} />
                  <Bar dataKey="attack_success" fill="hsl(var(--severity-critical))" radius={[4, 4, 0, 0]} name="Attack success" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon={Flame} title="No generation data" description="Complete multi-round campaigns to see co-evolution trends." action={<Button asChild size="sm"><Link href="/campaigns">Run campaign</Link></Button>} />
          )}
        </DashboardCard>

        <DashboardCard
          title="CI Regression Gates"
          description="Benchmark-driven release quality checks"
          badge={
            <Badge variant={gates.every((g) => g.status === "PASSING") ? "success" : "warning"}>
              {data?.regression_suite?.passing ?? 0}/{data?.regression_suite?.total ?? 0} passing
            </Badge>
          }
        >
          <ul className="space-y-2">
            {gates.length === 0 ? (
              <li className="text-sm text-muted-foreground">Loading benchmark gates…</li>
            ) : (
              gates.map((gate) => (
                <li
                  key={gate.name}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    {gate.status === "PASSING" ? (
                      <CheckCircle2 className="h-4 w-4 text-status-success" aria-hidden />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-severity-critical" aria-hidden />
                    )}
                    <span className="font-mono text-xs font-medium">{gate.name}</span>
                  </div>
                  <Badge variant={gate.status === "PASSING" ? "success" : "critical"} className="font-mono text-[10px]">
                    {gate.status}
                  </Badge>
                </li>
              ))
            )}
          </ul>
          {data?.benchmark && (
            <p className="mt-4 font-mono text-[11px] text-muted-foreground">
              Latency: {data.benchmark.avg_latency_ms}ms · P/R @80:{" "}
              {data.benchmark.thresholds.find((t) => t.threshold === 80)?.precision?.toFixed(2)}/
              {data.benchmark.thresholds.find((t) => t.threshold === 80)?.recall?.toFixed(2)}
            </p>
          )}
        </DashboardCard>
      </div>

      <DashboardCard
        title="Detector Ablation"
        description="Marginal recall impact when each detector is disabled (520-sample v3 dataset)"
        badge={
          data?.ablation?.baseline ? (
            <Badge variant="secondary" className="font-mono text-[10px]">
              baseline recall @80: {data.ablation.baseline.recall_at_80.toFixed(2)}
            </Badge>
          ) : undefined
        }
      >
        {schedule && (
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Scheduled refresh</p>
              <p className="mt-1 font-mono text-xs">{schedule.enabled ? "On" : "Off"}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Interval</p>
              <p className="mt-1 font-mono text-xs">
                {schedule.enabled && schedule.interval_sec > 0
                  ? schedule.interval_sec >= 3600
                    ? `${Math.round(schedule.interval_sec / 3600)}h`
                    : `${schedule.interval_sec}s`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Last run</p>
              <p className="mt-1 font-mono text-xs">{formatScheduleTime(schedule.last_run_at)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Next run</p>
              <p className="mt-1 font-mono text-xs">{formatScheduleTime(schedule.next_run_at)}</p>
            </div>
            {schedule.runs_total > 0 && (
              <p className="col-span-full font-mono text-[11px] text-muted-foreground">
                {schedule.runs_total} scheduled run{schedule.runs_total === 1 ? "" : "s"} since startup
              </p>
            )}
          </div>
        )}
        {ablationRows.length > 0 ? (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ablationRows} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={10} />
                <YAxis
                  type="category"
                  dataKey="detector"
                  width={100}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                />
                <Tooltip
                  {...CHART_TOOLTIP_PROPS}
                  formatter={(value: number) => [value.toFixed(4), "Recall delta"]}
                />
                <Bar dataKey="recall_delta" name="Recall delta vs baseline" radius={[0, 4, 4, 0]}>
                  {ablationRows.map((entry) => (
                    <Cell
                      key={entry.detector}
                      fill={
                        entry.recall_delta <= -0.05
                          ? "hsl(var(--severity-critical))"
                          : entry.recall_delta <= -0.02
                            ? "hsl(var(--severity-high))"
                            : "hsl(var(--severity-medium))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState
            icon={Layers}
            title="No ablation data yet"
            description="Run a detector ablation study to measure each detector's contribution to recall."
            action={
              capabilities.can_run_ablation ? (
                <Button size="sm" onClick={handleRunAblation} disabled={ablationRunning}>
                  {ablationRunning ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                      Running ablation…
                    </>
                  ) : (
                    "Run ablation study"
                  )}
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">Requires admin or redteam API key.</p>
              )
            }
          />
        )}
        {ablationRows.length > 0 && capabilities.can_run_ablation && (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" size="sm" onClick={handleRunAblation} disabled={ablationRunning}>
              {ablationRunning ? "Refreshing…" : "Re-run ablation"}
            </Button>
          </div>
        )}
      </DashboardCard>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" aria-hidden />
        {data?.total_rounds ?? 0} completed rounds
      </p>
    </div>
  );
}
