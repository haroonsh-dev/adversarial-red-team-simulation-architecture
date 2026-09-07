"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { publishRedTeamChrome } from "@/components/red-team/RedTeamShell";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { useDashboardMetrics } from "@/lib/context/DashboardMetricsProvider";
import {
  formatEventTime,
  type LiveMonitorEvent,
  type LiveOutcome,
} from "@/lib/liveMonitorEvents";
import {
  buildLiveAiActivity,
  deriveLiveResearchAnalytics,
  liveIngestStreamNewestFirst,
} from "@/lib/redTeamLiveIngest";
import { cn } from "@/lib/utils";

const ROW_H = 44;
const VIEWPORT_H = 420;

function outcomeTone(outcome: LiveOutcome | null | undefined) {
  if (outcome === "fail") return "fail";
  if (outcome === "pass") return "pass";
  if (outcome === "flag") return "flag";
  return "neutral";
}

function WorkingBlotter({
  activity,
  working,
  hot,
}: {
  activity: ReturnType<typeof buildLiveAiActivity>;
  working: boolean;
  hot: boolean;
}) {
  const latest = activity.latest;
  const risk = Number(latest?.risk_score ?? 0);
  const fields = [
    { k: "Agent", v: String(latest?.agent_id ?? "—") },
    { k: "Tool", v: String(latest?.tool_name ?? "—") },
    { k: "Verdict", v: String(latest?.verdict ?? latest?.action ?? "—") },
    { k: "Action", v: String(latest?.recommended_action ?? latest?.action ?? "NONE") },
    { k: "Risk", v: latest ? `R${Math.round(risk)}` : "—" },
  ];

  return (
    <div
      className={cn(
        "rounded-md border px-4 py-3",
        working
          ? hot
            ? "border-[hsl(var(--severity-critical))]/55 bg-[hsl(var(--severity-critical))]/12"
            : "border-[hsl(var(--severity-critical))]/35 bg-[hsl(var(--severity-critical))]/6"
          : "border-border"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              working
                ? "animate-pulse bg-[hsl(var(--severity-critical))] shadow-[0_0_10px_hsl(var(--severity-critical)/0.6)]"
                : "bg-muted-foreground/35"
            )}
          />
          <p
            className={cn(
              "font-mono text-[11px] font-semibold uppercase tracking-[0.12em]",
              working ? "text-[hsl(var(--severity-critical))]" : "text-muted-foreground"
            )}
          >
            {working ? (hot ? "AI working · hot path" : "AI working") : "AI idle"}
          </p>
        </div>
        <p className="font-mono text-[10px] text-muted-foreground">
          live hop · input → agent → detect → verdict
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {fields.map((f) => (
          <div key={f.k} className="min-w-0">
            <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {f.k}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate font-mono text-[13px]",
                working && (f.k === "Risk" || f.k === "Verdict") && hot
                  ? "text-[hsl(var(--severity-critical))]"
                  : "text-foreground"
              )}
            >
              {f.v}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {activity.pipeline.map((node, i) => (
          <span key={node.id} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded-sm border px-2 py-1 font-mono text-[10px]",
                node.hot
                  ? "border-[hsl(var(--severity-critical))]/50 text-[hsl(var(--severity-critical))]"
                  : node.active
                    ? "border-border text-foreground"
                    : "border-border/50 text-muted-foreground"
              )}
            >
              {node.label}
            </span>
            {i < activity.pipeline.length - 1 ? (
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function OutcomePulse({ events }: { events: LiveMonitorEvent[] }) {
  const recent = events.slice(0, 64);
  if (!recent.length) {
    return (
      <div className="flex h-16 items-center justify-center rounded-md border border-dashed border-[hsl(var(--severity-critical))]/25 text-[12px] text-muted-foreground">
        Waiting for AI activity…
      </div>
    );
  }
  const fails = recent.filter((e) => e.outcome === "fail").length;
  const flags = recent.filter((e) => e.outcome === "flag").length;
  const passes = recent.filter((e) => e.outcome === "pass").length;

  return (
    <div className="rounded-md border border-[hsl(var(--severity-critical))]/30 bg-muted p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--severity-critical))]">
          Activity sequence · newest left
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          fail {fails} · flag {flags} · pass {passes}
        </p>
      </div>
      <div className="flex gap-0.5 overflow-x-auto pb-0.5">
        {recent.map((e) => {
          const tone = outcomeTone(e.outcome);
          return (
            <div
              key={`${e.seq}-${e.ts}`}
              title={e.summary}
              className={cn(
                "h-10 w-2 shrink-0 rounded-[1px]",
                tone === "fail" && "animate-pulse bg-[hsl(var(--severity-critical))]",
                tone === "pass" && "bg-[hsl(var(--severity-low))]",
                tone === "flag" && "bg-[hsl(var(--severity-medium))]",
                tone === "neutral" && "bg-muted-foreground/25"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}

function EvidenceStream({ events }: { events: LiveMonitorEvent[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (!scrollerRef.current) return;
    scrollerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [events[0]?.seq, events.length]);

  const total = events.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4);
  const visible = Math.ceil(VIEWPORT_H / ROW_H) + 8;
  const end = Math.min(total, start + visible);
  const slice = events.slice(start, end);

  return (
    <div
      ref={scrollerRef}
      className="relative overflow-y-auto rounded-md border border-[hsl(var(--severity-critical))]/25 bg-background"
      style={{ height: VIEWPORT_H }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      role="log"
      aria-live="polite"
      aria-label="Live AI working evidence stream"
    >
      {total === 0 ? (
        <div className="space-y-3 px-4 py-12 text-center">
          <p className="text-[14px] text-foreground">No AI activity yet</p>
          <p className="mx-auto max-w-sm text-[13px] text-muted-foreground">
            When agents are tested, each scan shows up here as it happens. Start from Attack Lab or
            run a campaign.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              href="/red-team/lab"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-foreground hover:bg-muted/40"
            >
              Open Attack Lab
            </Link>
            <Link
              href="/red-team/campaigns/new"
              className="rounded-md border border-border bg-background px-3 py-1.5 text-[12px] text-foreground hover:bg-muted/40"
            >
              Start a campaign
            </Link>
          </div>
        </div>
      ) : (
        <div style={{ height: total * ROW_H, position: "relative" }}>
          {slice.map((e, i) => {
            const idx = start + i;
            const tone = outcomeTone(e.outcome);
            return (
              <div
                key={`${e.seq}-${e.ts}-${e.summary}`}
                className={cn(
                  "absolute left-0 right-0 grid grid-cols-[4.75rem_minmax(0,1fr)_3.5rem] items-center gap-2 border-l-2 px-3 text-[13px]",
                  tone === "fail" && "border-l-[hsl(var(--severity-critical))]",
                  tone === "pass" && "border-l-[hsl(var(--severity-low))]",
                  tone === "flag" && "border-l-[hsl(var(--severity-medium))]",
                  tone === "neutral" && "border-l-[hsl(var(--severity-critical))]/30"
                )}
                style={{ top: idx * ROW_H, height: ROW_H }}
              >
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatEventTime(e.ts)}
                </span>
                <span className="truncate text-foreground">{e.summary}</span>
                <span
                  className={cn(
                    "text-right font-mono text-[10px] uppercase",
                    tone === "fail" && "text-[hsl(var(--severity-critical))]",
                    tone === "pass" && "text-[hsl(var(--severity-low))]",
                    tone === "flag" && "text-[hsl(var(--severity-medium))]",
                    tone === "neutral" && "text-muted-foreground"
                  )}
                >
                  {e.outcome ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** AI Activity — red live working console; evidence stream for analysts on-call. */
export default function RedTeamLiveIngestMonitorPage() {
  const { liveEvents, connected, metrics } = useDashboardMetrics();
  const { apiOnline, wsConnected } = useConnection();

  const stream = useMemo(() => liveIngestStreamNewestFirst(liveEvents), [liveEvents]);
  const activity = useMemo(() => buildLiveAiActivity(liveEvents), [liveEvents]);
  const research = useMemo(() => deriveLiveResearchAnalytics(liveEvents), [liveEvents]);
  const live = apiOnline && (connected || wsConnected);
  const working = live && stream.length > 0;
  const hot =
    research.posture === "critical" ||
    stream[0]?.outcome === "fail" ||
    (metrics.max_risk_score || 0) >= 80;

  useEffect(() => {
    publishRedTeamChrome(
      live ? (stream.length ? "live" : "connecting") : apiOnline ? "stalled" : "error"
    );
    return () => publishRedTeamChrome("idle");
  }, [live, stream.length, apiOnline]);

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" asChild>
          <Link href="/red-team/monitor">Open Detections</Link>
        </Button>
      </div>

      <WorkingBlotter activity={activity} working={working} hot={hot} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Mini label="Window n" value={String(research.n)} />
        <Mini
          label="Breach %"
          value={research.breachRate != null ? `${research.breachRate}%` : "—"}
          hot={(research.breachRate ?? 0) >= 20}
        />
        <Mini label="μ risk" value={research.meanRisk != null ? String(research.meanRisk) : "—"} />
        <Mini
          label="p95"
          value={research.p95Risk != null ? String(research.p95Risk) : "—"}
          hot={(research.p95Risk ?? 0) >= 80}
        />
        <Mini
          label="Δ risk"
          value={
            research.riskDelta == null
              ? "—"
              : research.riskDelta > 0
                ? `+${research.riskDelta}`
                : String(research.riskDelta)
          }
          hot={(research.riskDelta ?? 0) > 8}
        />
      </div>

      <OutcomePulse events={stream} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
        <section className="min-w-0 space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--severity-critical))]">
              Evidence stream
            </h3>
            <span className="font-mono text-[10px] text-muted-foreground">{stream.length} rows</span>
          </div>
          <EvidenceStream events={stream} />
        </section>

        <aside className="space-y-3 lg:sticky lg:top-2 lg:self-start">
          <div className="rounded-md border border-[hsl(var(--severity-critical))]/25 px-3 py-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Live mix
            </p>
            <div className="space-y-2.5 font-mono text-[11px]">
              {research.outcomeMix.length === 0 ? (
                <p className="text-muted-foreground">No outcomes yet</p>
              ) : (
                research.outcomeMix.map((o) => {
                  const pct = research.n > 0 ? Math.round((o.value / research.n) * 100) : 0;
                  return (
                    <div key={o.name}>
                      <div className="mb-0.5 flex justify-between">
                        <span className="text-muted-foreground">{o.name}</span>
                        <span className="text-foreground">
                          {o.value} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, background: o.fill }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-md border border-border px-3 py-3">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Hot tools
            </p>
            {research.toolExposure.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1.5">
                {research.toolExposure.slice(0, 5).map((t) => (
                  <li key={t.tool} className="flex justify-between gap-2 font-mono text-[11px]">
                    <span className="truncate text-muted-foreground">{t.tool}</span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        t.maxRisk >= 80
                          ? "text-[hsl(var(--severity-critical))]"
                          : "text-foreground"
                      )}
                    >
                      R{t.maxRisk}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {research.finding && research.posture !== "empty" ? (
            <p className="rounded-md border border-border px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--severity-critical))]">
                Note
              </span>
              <br />
              {research.finding}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function Mini({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2",
        hot && value !== "—"
          ? "border-[hsl(var(--severity-critical))]/35"
          : "border-border"
      )}
    >
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[16px] font-semibold tabular-nums",
          hot && value !== "—" ? "text-[hsl(var(--severity-critical))]" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}
