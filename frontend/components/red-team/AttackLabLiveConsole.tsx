"use client";

import Link from "next/link";
import { LandingMotionCard } from "@/components/landing/LandingMotionCard";
import { Button } from "@/components/ui/button";
import type { LabProbeOutcome } from "@/lib/labActions";
import { probeRisk } from "@/lib/labActions";
import { cn } from "@/lib/utils";

type Props = {
  probing: boolean;
  launching: boolean;
  last: LabProbeOutcome | null;
  onProbe: (persist: boolean) => void;
  onLaunch: () => void;
  payloadChars: number;
  /** When false, only the last-check result is shown (actions live on the message card). */
  showActions?: boolean;
  hasProvider?: boolean;
};

/** Sticky action console — Probe hits situations/evaluate; Launch hits campaigns/baseline. */
export function AttackLabLiveConsole({
  probing,
  launching,
  last,
  onProbe,
  onLaunch,
  payloadChars,
  showActions = true,
  hasProvider = true,
}: Props) {
  const result = last?.result ?? null;
  const risk = probeRisk(result);
  const verdict = result?.verdict?.verdict ?? null;
  const action = result?.verdict?.recommended_action ?? null;
  const sessionId = result?.ingest_event?.session_id;
  const logsHref =
    result?.logs_href || (sessionId ? `/logs?session=${sessionId}` : null);

  const verdictTone =
    verdict === "BREACHED" || action === "KILL" || action === "QUARANTINE"
      ? "critical"
      : verdict === "SUSPICIOUS"
        ? "medium"
        : last?.ok
          ? "low"
          : "neutral";

  return (
    <LandingMotionCard instant
      index={0}
      glow={false}
      className="sticky top-2 z-20 overflow-hidden border border-[hsl(var(--severity-info-border))] bg-[hsl(var(--severity-info-subtle))] p-4 shadow-sm"
    >
      {showActions ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">Live actions</p>
            <p className="mt-1 text-[13px] text-foreground">
              <span className="font-medium">Check</span> scores this attack message now.{" "}
              <span className="font-medium">Start run</span> launches a full lab experiment.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={probing || launching || payloadChars === 0}
              onClick={() => onProbe(true)}
            >
              {probing ? "Checking…" : "Check"}
            </Button>
            <Button
              size="sm"
              disabled={probing || launching || payloadChars === 0 || !hasProvider}
              onClick={onLaunch}
            >
              {launching ? "Starting…" : hasProvider ? "Start run" : "Add provider first"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Last check result</p>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Live score from the message above — not a planning estimate.
          </p>
        </div>
      )}

      {last ? (
        <div
          className={cn(
            "mt-4 rounded-md border p-3",
            last.ok
              ? verdictTone === "critical"
                ? "border-[hsl(var(--severity-critical-border))] bg-[hsl(var(--severity-critical-subtle))]"
                : verdictTone === "medium"
                  ? "border-[hsl(var(--severity-medium-border))] bg-[hsl(var(--severity-medium-subtle))]"
                  : "border-[hsl(var(--severity-low-border))] bg-[hsl(var(--severity-low-subtle))]"
              : "border-[hsl(var(--severity-critical-border))] bg-[hsl(var(--severity-critical-subtle))]"
          )}
        >
          {!last.ok ? (
            <p className="text-[13px] text-foreground">{last.error}</p>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Last check · {last.reason}
                </span>
                {result?.persisted ? (
                  <span className="rounded-sm border border-primary/30 bg-card/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-primary">
                    saved
                  </span>
                ) : (
                  <span className="rounded-sm border border-border bg-card/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                    not saved
                  </span>
                )}
                <span className="font-mono text-[10px] text-muted-foreground">
                  {last.latencyMs} ms
                </span>
              </div>
              <div className="flex flex-wrap items-baseline gap-3">
                <p
                  className={cn(
                    "font-mono text-[22px] font-semibold tabular-nums",
                    verdictTone === "critical" && "text-[hsl(var(--severity-critical))]",
                    verdictTone === "medium" && "text-[hsl(var(--severity-medium))]",
                    verdictTone === "low" && "text-[hsl(var(--severity-low))]"
                  )}
                >
                  {verdict ?? "—"}
                </p>
                <p className="font-mono text-[15px] tabular-nums text-foreground">
                  risk {risk ?? "—"}
                </p>
                <p className="text-[12px] text-muted-foreground">{action ?? "—"}</p>
              </div>
              <p className="text-[12px] text-muted-foreground">
                {result?.classification?.situation ?? "—"} ·{" "}
                {result?.classification?.tool_name ?? "—"} ·{" "}
                {result?.classification?.agent_id ?? "—"}
              </p>
              {result?.verdict?.reasoning ? (
                <p className="text-[12px] leading-relaxed text-foreground">
                  {result.verdict.reasoning}
                </p>
              ) : result?.classification?.reason ? (
                <p className="text-[12px] leading-relaxed text-foreground">
                  {result.classification.reason}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-3 pt-1 text-[11px]">
                {logsHref && result?.persisted ? (
                  <Link
                    href={logsHref}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    Open in Logs
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                  onClick={onLaunch}
                  disabled={launching || !hasProvider}
                >
                  {hasProvider ? "Escalate to full run" : "Add provider to start a run"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-muted-foreground">
          No result yet — run a check to see how containment scores this message.
        </p>
      )}
    </LandingMotionCard>
  );
}
