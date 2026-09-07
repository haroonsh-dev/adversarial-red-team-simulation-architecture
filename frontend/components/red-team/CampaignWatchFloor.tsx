"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { LandingMotionCard } from "@/components/landing/LandingMotionCard";
import { Button } from "@/components/ui/button";
import { riskScoreFromSummary } from "@/lib/assessmentResults";
import {
  buildOrbit,
  orbitBucket,
  orbitStats,
  selectOrbitCampaigns,
  type OrbitMode,
} from "@/lib/campaignOrbit";
import type { CampaignListItem } from "@/lib/hooks/useCampaigns";
import { easeOut, fadeUp, staggerContainer } from "@/lib/motionPresets";
import { cn } from "@/lib/utils";

/** Live-first campaign orbit — running dots move with round progress; idle is explicit. */
export function CampaignWatchFloor({ campaigns }: { campaigns: CampaignListItem[] }) {
  const runningAll = useMemo(
    () => campaigns.filter((c) => orbitBucket(c.status) === "running"),
    [campaigns]
  );
  const [mode, setMode] = useState<OrbitMode>("live");
  const [focusId, setFocusId] = useState<string | null>(null);

  const field = useMemo(() => selectOrbitCampaigns(campaigns, mode), [campaigns, mode]);
  const orbit = useMemo(() => buildOrbit(field), [field]);
  const stats = useMemo(() => orbitStats(orbit, campaigns.length, mode), [orbit, campaigns.length, mode]);

  const focus =
    orbit.find((n) => n.id === focusId) ??
    orbit.find((n) => n.live) ??
    [...orbit].sort((a, b) => (b.risk ?? -1) - (a.risk ?? -1))[0] ??
    null;

  const watchList =
    runningAll.length > 0
      ? runningAll.slice(0, 6)
      : [...campaigns]
          .filter((c) => orbitBucket(c.status) === "completed")
          .slice(0, 6);

  if (campaigns.length === 0) {
    return (
      <LandingMotionCard index={0} className="flex h-44 flex-col items-center justify-center gap-3 p-6">
        <p className="text-[13px] text-muted-foreground">
          Orbit empty — start a run and a live dot appears here.
        </p>
        <Button size="sm" asChild>
          <Link href="/red-team/lab">Attack Lab</Link>
        </Button>
      </LandingMotionCard>
    );
  }

  const liveActive = stats.live > 0;

  return (
    <div className="space-y-5">
      <LandingMotionCard
        index={0}
        className={cn(
          "overflow-hidden border bg-card p-4 sm:p-5",
          liveActive
            ? "border-[hsl(var(--severity-info-border))] ring-1 ring-primary/20"
            : "border-border"
        )}
        glow={false}
      >
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-xl">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Campaign orbit · {liveActive ? "live field" : "waiting for live"}
            </p>
            <p className="mt-1 text-[14px] leading-snug text-foreground">
              {liveActive ? (
                <>
                  Live dots move outward as <span className="text-muted-foreground">rounds complete</span>
                  . History dots use scored risk only.
                </>
              ) : (
                <>
                  Center shows <span className="font-medium">IDLE</span> until a campaign is RUNNING —
                  not a fake live score. History μ is optional below.
                </>
              )}
            </p>
          </div>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            {(
              [
                ["live", "Live field"],
                ["history", "Full history"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "rounded px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                  mode === id
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="relative mx-auto aspect-square w-full max-w-[440px]">
            {(
              [
                { inset: "6%", tone: "border-[hsl(var(--severity-critical-border))]/50" },
                { inset: "16%", tone: "border-[hsl(var(--severity-high-border))]/45" },
                { inset: "26%", tone: "border-[hsl(var(--severity-medium-border))]/45" },
                { inset: "36%", tone: "border-border" },
              ] as const
            ).map((ring) => (
              <div
                key={ring.inset}
                className={cn("pointer-events-none absolute rounded-full border", ring.tone)}
                style={{ inset: ring.inset }}
              />
            ))}

            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <line
                x1="50%"
                y1="50%"
                x2="88%"
                y2="22%"
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeDasharray="3 4"
              />
              <line
                x1="50%"
                y1="50%"
                x2="50%"
                y2="92%"
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeDasharray="3 4"
              />
              <line
                x1="50%"
                y1="50%"
                x2="12%"
                y2="28%"
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeDasharray="3 4"
              />
            </svg>

            <p className="pointer-events-none absolute right-[6%] top-[14%] font-mono text-[9px] uppercase tracking-wider text-primary">
              Live
            </p>
            <p className="pointer-events-none absolute bottom-[6%] left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--severity-low))]">
              Contained
            </p>
            <p className="pointer-events-none absolute left-[6%] top-[16%] font-mono text-[9px] uppercase tracking-wider text-[hsl(var(--severity-critical))]">
              Failed
            </p>

            {liveActive ? (
              <motion.div
                className="pointer-events-none absolute inset-[6%] rounded-full"
                style={{
                  background:
                    "conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary) / 0.28) 24deg, transparent 48deg)",
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                aria-hidden
              />
            ) : null}

            {/* Core: LIVE count when working; IDLE when not — never fake μ as “live” */}
            <div
              className={cn(
                "absolute left-1/2 top-1/2 z-[1] flex h-[4.75rem] w-[4.75rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-card shadow-md",
                liveActive
                  ? "border-primary/50 ring-2 ring-primary/25"
                  : "border-border"
              )}
            >
              {liveActive ? (
                <>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-primary">
                    Live
                  </span>
                  <span className="font-mono text-[20px] font-semibold tabular-nums text-primary">
                    {stats.live}
                  </span>
                  <span className="font-mono text-[8px] text-muted-foreground">
                    {stats.liveProgress}% rounds
                  </span>
                </>
              ) : (
                <>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground">
                    Idle
                  </span>
                  <span className="font-mono text-[17px] font-semibold tabular-nums text-muted-foreground">
                    0
                  </span>
                  <span className="font-mono text-[8px] text-muted-foreground">
                    {stats.mean != null ? `hist μ ${stats.mean}` : "no live"}
                  </span>
                </>
              )}
            </div>

            {liveActive && stats.liveProgress > 0 ? (
              <div
                className="pointer-events-none absolute left-1/2 top-1/2 z-0 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-primary/40"
                style={{
                  width: `${(30 + (stats.liveProgress / 100) * 18) * 2}%`,
                  height: `${(30 + (stats.liveProgress / 100) * 18) * 2}%`,
                }}
                title="Mean live round progress"
              />
            ) : null}

            {orbit.map((n, i) => {
              const x = 50 + Math.cos(n.angle) * n.radiusPct;
              const y = 50 + Math.sin(n.angle) * n.radiusPct;
              const active = focus?.id === n.id;
              return (
                <motion.div
                  key={n.id}
                  className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: n.live ? 1 : 0.75, scale: 1, left: `${x}%`, top: `${y}%` }}
                  transition={{
                    delay: n.live ? 0 : 0.02 + i * 0.02,
                    duration: 0.45,
                    ease: easeOut,
                  }}
                >
                  <button
                    type="button"
                    onMouseEnter={() => setFocusId(n.id)}
                    onFocus={() => setFocusId(n.id)}
                    onClick={() => setFocusId(n.id)}
                    className="group relative block"
                    aria-label={`${n.name}, ${n.live ? "live" : n.status}, ${n.rounds}`}
                  >
                    <motion.span
                      className={cn(
                        "block rounded-full border-2",
                        n.live && "border-primary bg-primary",
                        n.failed &&
                          !n.live &&
                          "border-[hsl(var(--severity-critical))] bg-[hsl(var(--severity-critical))]",
                        n.done &&
                          "border-[hsl(var(--severity-low))] bg-[hsl(var(--severity-low))]",
                        !n.live &&
                          !n.failed &&
                          !n.done &&
                          "border-muted-foreground/50 bg-muted-foreground/40",
                        active && "ring-2 ring-foreground/40 ring-offset-1 ring-offset-background"
                      )}
                      style={{ width: n.size, height: n.size }}
                      animate={
                        n.live
                          ? {
                              scale: [1, 1.35, 1],
                              boxShadow: [
                                "0 0 0 0 hsl(var(--primary) / 0.4)",
                                "0 0 0 8px hsl(var(--primary) / 0)",
                                "0 0 0 0 hsl(var(--primary) / 0.4)",
                              ],
                            }
                          : { scale: active ? 1.15 : 1 }
                      }
                      transition={
                        n.live
                          ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                          : { duration: 0.2 }
                      }
                    />
                  </button>
                </motion.div>
              );
            })}
          </div>

          <aside className="flex flex-col gap-3 lg:self-center">
            <div
              className={cn(
                "rounded-md border px-3 py-2.5 shadow-sm",
                liveActive
                  ? "border-[hsl(var(--severity-info-border))] bg-[hsl(var(--severity-info-subtle))]"
                  : "border-border bg-card"
              )}
            >
              <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Field reading
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-foreground">{stats.finding}</p>
              {!liveActive ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" className="h-7 text-[11px]" asChild>
                    <Link href="/red-team/lab">Start live run</Link>
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" asChild>
                    <Link href="/red-team/monitor">Monitor</Link>
                  </Button>
                </div>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <Metric k="Live" v={String(stats.live)} tone={liveActive ? "live" : "neutral"} />
              <Metric
                k="Failed"
                v={String(stats.failed)}
                tone={stats.failed > 0 ? "critical" : "neutral"}
              />
              <Metric
                k="Max R"
                v={stats.max ? String(stats.max) : "—"}
                tone={stats.max >= 80 ? "critical" : "neutral"}
              />
              <Metric
                k={liveActive ? "Rounds" : "Hist μ"}
                v={liveActive ? `${stats.liveProgress}%` : stats.mean != null ? String(stats.mean) : "—"}
                tone={liveActive ? "live" : "neutral"}
              />
            </dl>

            <AnimatePresence mode="wait">
              {focus ? (
                <motion.div
                  key={focus.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25, ease: easeOut }}
                  className={cn(
                    "rounded-md border px-3 py-3",
                    focus.live &&
                      "border-[hsl(var(--severity-info-border))] bg-[hsl(var(--severity-info-subtle))]",
                    focus.failed &&
                      !focus.live &&
                      "border-[hsl(var(--severity-critical-border))] bg-[hsl(var(--severity-critical-subtle))]",
                    focus.done &&
                      !focus.live &&
                      "border-[hsl(var(--severity-low-border))] bg-[hsl(var(--severity-low-subtle))]",
                    !focus.live && !focus.failed && !focus.done && "border-border bg-card"
                  )}
                >
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    Focus node
                  </p>
                  <p className="mt-1 truncate text-[13px] font-semibold">{focus.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {focus.status} · {focus.rounds} · {focus.provider}/{focus.model}
                  </p>
                  <div className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[20px] font-semibold tabular-nums text-foreground">
                      {focus.live
                        ? `${Math.round(focus.progress * 100)}%`
                        : focus.risk != null
                          ? `R${focus.risk}`
                          : "—"}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {focus.live ? "round progress" : focus.band === "unknown" ? "unscored" : `${focus.band} band`}
                    </span>
                  </div>
                  <ButtonLink href={focus.href} live={focus.live} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </aside>
        </div>
      </LandingMotionCard>

      <div>
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {runningAll.length > 0 ? "Watching live" : "Recent contained"}
          </h3>
          <span className="font-mono text-[10px] text-muted-foreground">
            {runningAll.length > 0 ? `${runningAll.length} running` : "start a run for live cards"}
          </span>
        </div>

        {watchList.length === 0 ? (
          <LandingMotionCard index={0} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13px] text-muted-foreground">
              No live or completed runs to watch yet.
            </p>
            <Button size="sm" asChild>
              <Link href="/red-team/lab">Start Attack Lab</Link>
            </Button>
          </LandingMotionCard>
        ) : (
          <motion.div
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            {watchList.map((c, i) => {
              const b = orbitBucket(c.status);
              const live = b === "running";
              const risk = riskScoreFromSummary(c.summary ?? null);
              const total = Math.max(1, Number(c.total_rounds || 1));
              const done = Number(c.rounds_completed || 0);
              const pct = Math.min(100, Math.round((done / total) * 100));

              return (
                <motion.div key={c.id} variants={fadeUp} transition={{ ease: easeOut }}>
                  <Link
                    href={`/red-team/monitor/${c.id}${live ? "?follow=1" : ""}`}
                    className="block h-full"
                    onMouseEnter={() => setFocusId(c.id)}
                  >
                    <LandingMotionCard
                      index={i}
                      className={cn(
                        "flex h-full flex-col p-4 sm:p-5",
                        live &&
                          "border-[hsl(var(--severity-info-border))] bg-[hsl(var(--severity-info-subtle))] ring-1 ring-primary/25"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {live ? (
                            <motion.span
                              className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary"
                              animate={{ opacity: [1, 0.55, 1] }}
                              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
                            >
                              <span className="relative flex h-1.5 w-1.5">
                                <span className="absolute inset-0 animate-ping rounded-full bg-primary/50" />
                                <span className="relative h-1.5 w-1.5 rounded-full bg-primary" />
                              </span>
                              Live
                            </motion.span>
                          ) : (
                            <span className="font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--severity-low))]">
                              Contained
                            </span>
                          )}
                          <h4 className="mt-1.5 truncate text-[15px] font-semibold tracking-tight">
                            {c.name}
                          </h4>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                            {c.provider}/{c.model}
                          </p>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      </div>
                      <div className="mt-4 space-y-1.5">
                        <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                          <span>
                            {done}/{c.total_rounds} rounds
                          </span>
                          <span>{live ? `${pct}%` : risk != null ? `R${risk}` : "—"}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                          <motion.div
                            className={cn(
                              "h-full origin-left rounded-full",
                              live ? "bg-primary" : "bg-[hsl(var(--severity-low))]"
                            )}
                            animate={{ scaleX: Math.max(live ? 0.08 : 0.02, pct / 100) }}
                            transition={{ duration: 0.4, ease: easeOut }}
                          />
                        </div>
                      </div>
                    </LandingMotionCard>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Metric({
  k,
  v,
  tone = "neutral",
}: {
  k: string;
  v: string;
  tone?: "live" | "critical" | "neutral";
}) {
  return (
    <div className="rounded-md border border-border px-2.5 py-2">
      <dt className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd
        className={cn(
          "mt-0.5 font-mono text-[16px] font-semibold tabular-nums",
          tone === "live" && "text-primary",
          tone === "critical" && "text-[hsl(var(--severity-critical))]",
          tone === "neutral" && "text-foreground"
        )}
      >
        {v}
      </dd>
    </div>
  );
}

function ButtonLink({ href, live }: { href: string; live: boolean }) {
  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
    >
      {live ? "Watch live run" : "Open run"}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
