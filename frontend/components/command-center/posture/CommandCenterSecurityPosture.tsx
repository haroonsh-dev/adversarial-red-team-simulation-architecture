"use client";

import { useMemo } from "react";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveRound } from "../prototype/liveRounds";

export type StrategicKpis = {
  trustChain: number;
  detectionRate: number;
  disagreementRate: number;
  openAlerts: number;
};

export function CommandCenterSecurityPosture({
  round,
  kpiData,
  onOpenAsiTaxonomy,
  className,
}: {
  round: LiveRound;
  kpiData?: StrategicKpis;
  onOpenAsiTaxonomy?: () => void;
  className?: string;
}) {
  const isBreach =
    round.badgeTone === "error" ||
    round.bars.some((b) => b.code === "HMAC" || b.label.includes("fail"));

  const hasHighThreat = round.bars.some((b) => b.pct >= 75 || b.tone === "alert");

  const overallRisk: "CRITICAL" | "ELEVATED" | "NOMINAL" = isBreach
    ? "CRITICAL"
    : hasHighThreat
      ? "ELEVATED"
      : "NOMINAL";

  const activeThreats = round.bars.length;
  const criticalThreats = round.bars.filter((b) => b.pct >= 75 || b.tone === "alert").length;
  const containedThreats = round.verdicts.filter(
    (v) => v.tone === "ok" || v.detail.toLowerCase().includes("contained") || v.detail.toLowerCase().includes("held")
  ).length;

  const agentsAtRisk = useMemo(() => {
    return Object.values(round.agents).filter(
      (s) => s === "active" || s === "responding" || s === "waiting"
    ).length;
  }, [round.agents]);

  const avgLatencyMs = useMemo(() => {
    if (!round.latencies) return 27;
    const vals = Object.values(round.latencies);
    if (vals.length === 0) return 27;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }, [round.latencies]);

  const riskBadgeClass =
    overallRisk === "CRITICAL"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : overallRisk === "ELEVATED"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";

  // If kpiData is provided, render the comprehensive Threat Posture & Readiness HUD
  if (kpiData) {
    return (
      <div
        aria-label="Threat Posture and Readiness HUD"
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-border bg-card/70 backdrop-blur-xs p-4 shadow-sm transition-colors",
          className
        )}
      >
        {/* Row 1: Primary Breach Anchor + Core Executive Defenses */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-center border-b border-border/70 pb-3">
          {/* Dominant Question Anchor: Are we under active breach? */}
          <div className="col-span-2 md:col-span-1 flex flex-col justify-center pr-3 border-r border-border/70 py-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-muted-foreground">
                BREACH RISK STATUS
              </span>
              <span className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground/70 hidden sm:inline">
                STATUS
              </span>
            </div>
            <div className="mt-1 flex items-center">
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-mono font-bold tracking-wide border transition-all duration-300 w-full justify-center sm:justify-start",
                  overallRisk === "CRITICAL"
                    ? "border-rose-500/70 bg-rose-500/15 text-rose-600 dark:text-rose-400 shadow-[0_0_14px_rgba(244,63,94,0.35)] ring-1 ring-rose-500/40"
                    : overallRisk === "ELEVATED"
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
                      : "border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.2)]"
                )}
              >
                {overallRisk === "CRITICAL" ? (
                  <ShieldAlert className="h-4 w-4 shrink-0 text-rose-500 animate-pulse" />
                ) : overallRisk === "ELEVATED" ? (
                  <Shield className="h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
                )}
                <span className="truncate">
                  {overallRisk} · {overallRisk === "CRITICAL" ? "78% RISK" : overallRisk === "ELEVATED" ? "SUSPICIOUS" : "CONTAINED"}
                </span>
              </span>
            </div>
          </div>

          {/* Defense 1: TRUST CHAIN */}
          <div>
            <h2 className="font-sans text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              TRUST CHAIN
            </h2>
            <p className="mt-1 font-sans tabular-nums font-semibold tracking-tight text-[26px] sm:text-[30px] leading-none text-foreground">
              {kpiData.trustChain}%
            </p>
          </div>

          {/* Defense 2: DETECTION RATE */}
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-sans text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                DETECTION RATE
              </h2>
              <span className="rounded bg-sky-500/10 px-1 py-0.2 font-mono text-[9px] font-semibold text-sky-600 dark:text-sky-400">
                +37% LIFT
              </span>
            </div>
            <p className="mt-1 font-sans tabular-nums font-semibold tracking-tight text-[26px] sm:text-[30px] leading-none text-foreground">
              {kpiData.detectionRate}%
            </p>
          </div>

          {/* Defense 3: DISAGREEMENT RATE */}
          <div>
            <h2 className="font-sans text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              DISAGREEMENT RATE
            </h2>
            <p className="mt-1 font-sans tabular-nums font-semibold tracking-tight text-[26px] sm:text-[30px] leading-none text-foreground">
              {kpiData.disagreementRate}%
            </p>
            <p className="mt-0.5 font-sans text-[10px] text-muted-foreground leading-tight">
              Judge vs Defender · lower is better
            </p>
          </div>

          {/* Defense 4: OPEN ALERTS */}
          <div>
            <h2 className="font-sans text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              OPEN ALERTS
            </h2>
            <p className="mt-1 font-sans tabular-nums font-semibold tracking-tight text-[26px] sm:text-[30px] leading-none text-foreground">
              {kpiData.openAlerts}
            </p>
          </div>
        </div>

        {/* Row 2: Secondary Threat Posture Signals & Taxonomy Trigger */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono pt-0.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-1.5 flex-1">
            {/* 1. Overall Risk */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
                OVERALL RISK
              </span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.2 text-[9px] font-semibold border",
                  riskBadgeClass
                )}
              >
                {overallRisk}
              </span>
            </div>

            {/* 2. Active Threats */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
                ACTIVE THREATS
              </span>
              <span className="text-foreground font-semibold tabular-nums">
                {activeThreats}
              </span>
            </div>

            {/* 3. Critical Threats */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
                CRITICAL THREATS
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  criticalThreats > 0 ? "text-rose-500 font-bold" : "text-muted-foreground"
                )}
              >
                {criticalThreats}
              </span>
            </div>

            {/* 4. Contained Threats */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
                CONTAINED
              </span>
              <span className="text-emerald-500 font-semibold tabular-nums">
                {containedThreats}
              </span>
            </div>

            {/* 5. Agents Engaged */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
                AGENTS ENGAGED
              </span>
              <span className="text-foreground font-semibold tabular-nums">
                {agentsAtRisk} of 6
              </span>
            </div>

            {/* 6. Mean Latency */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
                MEAN LATENCY
              </span>
              <span className="text-foreground font-semibold tabular-nums">
                {avgLatencyMs}ms
              </span>
            </div>
          </div>

          {/* Button to open OWASP ASI Matrix inline */}
          {onOpenAsiTaxonomy ? (
            <button
              type="button"
              onClick={onOpenAsiTaxonomy}
              className="shrink-0 rounded border border-border bg-muted/40 hover:bg-muted px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer"
              title="Open OWASP Agentic Security Taxonomy (ASI01–ASI10)"
            >
              OWASP TAXONOMY (ASI01–ASI10) →
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label="Security Posture Summary"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-muted/20 px-4 py-3 font-mono text-[11px] transition-colors",
        className
      )}
    >
      {/* 6 core posture signals */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 gap-y-2 flex-1">
        {/* 1. Overall Risk */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
            OVERALL RISK
          </span>
          <span className="flex items-center gap-1.5 font-bold">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[10px] border",
                riskBadgeClass
              )}
            >
              {overallRisk === "CRITICAL" ? (
                <ShieldAlert className="h-3 w-3" />
              ) : overallRisk === "ELEVATED" ? (
                <Shield className="h-3 w-3" />
              ) : (
                <ShieldCheck className="h-3 w-3" />
              )}
              {overallRisk}
            </span>
          </span>
        </div>

        {/* 2. Active Threats */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
            ACTIVE THREATS
          </span>
          <span className="text-foreground font-semibold tabular-nums">
            {activeThreats}
          </span>
        </div>

        {/* 3. Critical Threats */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
            CRITICAL THREATS
          </span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              criticalThreats > 0 ? "text-rose-500" : "text-muted-foreground"
            )}
          >
            {criticalThreats}
          </span>
        </div>

        {/* 4. Contained Threats */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
            CONTAINED
          </span>
          <span className="text-emerald-500 font-semibold tabular-nums">
            {containedThreats}
          </span>
        </div>

        {/* 5. Agents At Risk */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
            AGENTS ENGAGED
          </span>
          <span className="text-foreground font-semibold tabular-nums">
            {agentsAtRisk} of 6
          </span>
        </div>

        {/* 6. Detection Latency */}
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] font-sans font-medium uppercase tracking-wider text-muted-foreground">
            MEAN LATENCY
          </span>
          <span className="text-foreground font-semibold tabular-nums">
            {avgLatencyMs}ms
          </span>
        </div>
      </div>

      {/* Button to open OWASP ASI Matrix */}
      {onOpenAsiTaxonomy ? (
        <button
          type="button"
          onClick={onOpenAsiTaxonomy}
          className="shrink-0 rounded border border-border bg-card px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          title="Open OWASP Agentic Security Taxonomy (ASI01–ASI10)"
        >
          OWASP TAXONOMY (ASI01–ASI10) →
        </button>
      ) : null}
    </div>
  );
}
