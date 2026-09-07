"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CampaignAttackViz } from "@/components/red-team/CampaignAttackViz";
import { publishRedTeamChrome } from "@/components/red-team/RedTeamShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { buildCampaignAttackViz } from "@/lib/campaignAttackViz";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { useLiveMonitorFeed } from "@/lib/hooks/useLiveMonitorFeed";
import {
  LIVE_AGENTS,
  formatEventTime,
  type LiveMonitorEvent,
  type LiveOutcome,
} from "@/lib/liveMonitorEvents";
import type { LiveChromeState } from "@/lib/redTeamNav";
import { cn } from "@/lib/utils";

const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED", "ERROR"]);
const ROW_H = 40;
const VIEWPORT_H = 280;

function outcomeBorder(outcome: LiveOutcome | null | undefined, kind: string): string {
  if (kind === "verdict") {
    if (outcome === "pass") return "border-l-[hsl(var(--severity-low))]";
    if (outcome === "fail") return "border-l-[hsl(var(--severity-critical))]";
    return "border-l-[hsl(var(--severity-medium))]";
  }
  if (kind === "attack") return "border-l-[#67b3ef]";
  if (kind === "response") return "border-l-muted-foreground/50";
  return "border-l-border";
}

/** Lightweight windowing — only paint visible rows. */
function VirtualEventStream({
  events,
  follow,
}: {
  events: LiveMonitorEvent[];
  follow: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    if (!follow || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [events.length, follow]);

  const total = events.length;
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 4);
  const visible = Math.ceil(VIEWPORT_H / ROW_H) + 8;
  const end = Math.min(total, start + visible);
  const slice = events.slice(start, end);

  return (
    <div
      ref={scrollerRef}
      className="relative overflow-y-auto rounded-md border border-border bg-background/40"
      style={{ height: VIEWPORT_H }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      role="log"
      aria-live="polite"
      aria-label="Live attack event stream"
    >
      {total === 0 ? (
        <p className="px-4 py-12 text-center text-[13px] text-muted-foreground">
          Waiting for Red Team to launch attacks — path above lights as rounds start.
        </p>
      ) : (
        <div style={{ height: total * ROW_H, position: "relative" }}>
          {slice.map((e, i) => {
            const idx = start + i;
            return (
              <div
                key={`${e.seq}-${e.kind}`}
                className={cn(
                  "absolute left-0 right-0 flex items-start gap-3 border-l-2 px-3 py-2 text-[13px]",
                  outcomeBorder(e.outcome, e.kind)
                )}
                style={{ top: idx * ROW_H, height: ROW_H }}
              >
                <span className="w-[4.5rem] shrink-0 font-mono text-[11px] text-muted-foreground">
                  {formatEventTime(e.ts)}
                </span>
                <span className="w-14 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
                  {e.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">{e.summary}</span>
                {e.round != null ? (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    R{e.round}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TheaterInner() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { campaigns, loading: listLoading } = useCampaigns();
  const campaign = campaigns.find((c) => c.id === id);

  const follow = searchParams.get("follow") !== "0";
  const [followLatest, setFollowLatest] = useState(follow);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);

  const { stream, agents, campaignStatus, detection, transport, wsConnected } = useLiveMonitorFeed(
    id || null,
    followLatest
  );

  const viz = useMemo(() => buildCampaignAttackViz(stream), [stream]);
  const status = (campaignStatus ?? campaign?.status ?? "UNKNOWN").toUpperCase();
  const running = Boolean(id) && !TERMINAL.has(status);

  const setFollow = useCallback(
    (next: boolean) => {
      setFollowLatest(next);
      const q = new URLSearchParams(searchParams.toString());
      q.set("follow", next ? "1" : "0");
      router.replace(`/red-team/monitor/${id}?${q.toString()}`, { scroll: false });
    },
    [id, router, searchParams]
  );

  useEffect(() => {
    let state: LiveChromeState = "idle";
    if (!id) state = "idle";
    else if (listLoading && !campaign) state = "connecting";
    else if (TERMINAL.has(status)) state = "ended";
    else if (!followLatest && running) state = "paused";
    else if (running && (wsConnected || transport === "poll")) state = "live";
    else if (running) state = "connecting";
    else state = "ended";
    publishRedTeamChrome(state);
  }, [id, listLoading, campaign, status, followLatest, running, wsConnected, transport]);

  // Follow latest round unless user picks one
  useEffect(() => {
    if (followLatest && viz.latestRound != null) {
      setSelectedRound(viz.latestRound);
    }
  }, [followLatest, viz.latestRound]);

  if (!id) {
    return (
      <p className="text-[13px] text-muted-foreground">
        Select a campaign from{" "}
        <Link href="/red-team/campaigns" className="underline-offset-2 hover:underline">
          Campaigns
        </Link>
        .
      </p>
    );
  }

  if (listLoading && !campaign) {
    return <Skeleton className="h-64 w-full" />;
  }

  const progress =
    campaign && campaign.total_rounds > 0
      ? Math.min(100, Math.round((campaign.rounds_completed / campaign.total_rounds) * 100))
      : null;

  return (
    <div className="flex min-h-[calc(100vh-12rem)] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Live run · under Monitor
          </p>
          <p className="mt-0.5 text-[14px] font-medium text-foreground">
            {campaign?.name || id.slice(0, 8)}
          </p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            This is one campaign theater. The sidebar{" "}
            <Link href="/red-team/monitor" className="underline-offset-2 hover:underline">
              Monitor
            </Link>{" "}
            lists every run. All-agent traffic is under{" "}
            <Link href="/red-team/monitor/live" className="underline-offset-2 hover:underline">
              Activity
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            {status}
            {campaign
              ? ` · ${campaign.rounds_completed}/${campaign.total_rounds}`
              : ""}
            {" · "}
            {transport === "ws" ? "live" : transport === "poll" ? "refreshing" : "offline"}
          </span>
          <Button
            size="sm"
            variant={followLatest ? "default" : "outline"}
            onClick={() => setFollow(!followLatest)}
          >
            {followLatest ? "Following" : "Follow"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/red-team/evidence?campaign=${id}`}>Evidence</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/red-team/monitor">← Monitor</Link>
          </Button>
        </div>
      </div>

      {progress != null ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              running ? "bg-[#67b3ef]" : "bg-[hsl(var(--severity-low))]"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {/* Agent stage */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-4">
          {LIVE_AGENTS.map((a) => {
            const st = agents[a.id] ?? "idle";
            return (
              <div key={a.id} className="flex items-center gap-1.5 text-[11px]">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    st === "running" && "animate-pulse bg-[#67b3ef] shadow-[0_0_8px_#67b3ef88]",
                    st === "done" && "bg-[hsl(var(--severity-low))]",
                    st === "idle" && "bg-muted-foreground/35"
                  )}
                  title={st}
                />
                <span
                  className={cn(
                    st === "running" ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {a.label}
                </span>
              </div>
            );
          })}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-muted-foreground">
          detect {detection.rate != null ? `${detection.rate}%` : "—"}
          {" · "}
          {detection.passed}/{detection.judged} blocked
        </div>
      </div>

      {/* Visual attack launch theater */}
      <CampaignAttackViz
        model={viz}
        selectedRound={selectedRound}
        onSelectRound={(r) => {
          setSelectedRound(r);
          setFollow(false);
        }}
      />

      {/* Event stream */}
      <section className="min-w-0 space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Attack event stream
          </h2>
          <span className="font-mono text-[10px] text-muted-foreground">{stream.length} events</span>
        </div>
        <VirtualEventStream events={stream} follow={followLatest} />
      </section>
    </div>
  );
}

export default function LiveMonitorPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <TheaterInner />
    </Suspense>
  );
}
