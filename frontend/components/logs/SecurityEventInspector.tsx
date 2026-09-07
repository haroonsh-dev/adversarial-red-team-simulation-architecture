"use client";

import Link from "next/link";
import {
  Activity,
  Copy,
  Crosshair,
  ExternalLink,
  Network,
  ScrollText,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { SessionLayerStrip } from "@/components/shared/SessionLayerStrip";
import { formatDateTime } from "@/lib/dates";
import {
  actionToneClass,
  type SecurityLogRow,
} from "@/lib/securityLog";
import { cn } from "@/lib/utils";

interface SecurityEventInspectorProps {
  row: SecurityLogRow | null;
  className?: string;
}

export function SecurityEventInspector({ row, className }: SecurityEventInspectorProps) {
  if (!row) {
    return (
      <aside
        className={cn(
          "flex min-h-[420px] flex-col rounded-[8px] border border-border bg-card",
          className
        )}
      >
        <header className="border-b border-border px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.85px] text-[#67b3ef]">
            Event inspector
          </p>
          <h3 className="mt-1 text-[15px] font-medium tracking-[-0.19px] text-foreground">
            Select an event
          </h3>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Investigate containment decision, blast radius, and replay evidence.
          </p>
        </header>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
          Click a row in the security event log to open forensics.
        </div>
      </aside>
    );
  }

  const evaluation = {
    verdict: row.verdict,
    risk_score: row.riskScore,
    layer_scores: row.raw.layer_scores,
    rule_based_score: row.raw.rule_based_score,
    semantic_score: row.raw.semantic_score,
    injection_score: row.raw.injection_score,
  } as Record<string, unknown>;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(row.id);
    } catch {
      /* ignore */
    }
  };

  return (
    <aside
      className={cn(
        "flex min-h-[420px] flex-col rounded-[8px] border border-border bg-card",
        className
      )}
    >
      <header className="border-b border-border px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.85px] text-[#67b3ef]">
          Event inspector
        </p>
        <h3 className="mt-1 truncate text-[15px] font-medium tracking-[-0.19px] text-foreground">
          {row.tool}
        </h3>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {formatDateTime(row.timestamp)}
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={row.severity} />
          <Badge variant="outline" className={cn("font-mono text-[10px]", actionToneClass(row.action))}>
            {row.action}
          </Badge>
          {row.verdict ? (
            <Badge variant="secondary" className="font-mono text-[10px] uppercase">
              {row.verdict}
            </Badge>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Metric label="Risk" value={String(Math.round(row.riskScore))} hot={row.riskScore >= 50} />
          <Metric label="Action" value={row.action} hot={row.action === "KILL" || row.action === "QUARANTINE"} />
        </div>

        <dl className="space-y-2 font-mono text-[11px]">
          <Field label="Event ID" value={row.id} mono />
          <Field label="Session" value={row.sessionId || "—"} mono />
          <Field label="Agent" value={row.agentId || "—"} mono />
          <Field label="Tool" value={row.tool} />
          <Field label="Raw action" value={row.actionRaw || "—"} />
        </dl>

        <div>
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            Detector layers
          </p>
          <SessionLayerStrip evaluation={evaluation} />
        </div>

        <div className="space-y-2 pt-1">
          <Button type="button" variant="outline" size="sm" className="w-full justify-start gap-2" onClick={() => void copyId()}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Copy event ID
          </Button>
          {row.sessionId ? (
            <>
              <Button asChild size="sm" className="w-full justify-start gap-2">
                <Link href={`/replay?session=${encodeURIComponent(row.sessionId)}`}>
                  <Activity className="h-3.5 w-3.5" aria-hidden />
                  Open session replay
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
                <Link href={`/logs?session=${encodeURIComponent(row.sessionId)}`}>
                  <ScrollText className="h-3.5 w-3.5" aria-hidden />
                  Filter this session
                </Link>
              </Button>
            </>
          ) : null}
          <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
            <Link href="/command-center/topology">
              <Network className="h-3.5 w-3.5" aria-hidden />
              Attack topology
            </Link>
          </Button>
          {(row.severity === "CRITICAL" || row.severity === "HIGH") && (
            <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
              <Link href="/sandbox">
                <Crosshair className="h-3.5 w-3.5" aria-hidden />
                Retest in sandbox
              </Link>
            </Button>
          )}
        </div>
      </div>

      <footer className="border-t border-border px-4 py-3">
        <div className="flex items-start gap-2 text-[12px] text-muted-foreground">
          {row.action === "KILL" || row.action === "QUARANTINE" ? (
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--severity-critical))]" aria-hidden />
          ) : (
            <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#67b3ef]" aria-hidden />
          )}
          <span>
            {row.action === "KILL" || row.action === "QUARANTINE"
              ? "Containment enforced — review replay before clearing."
              : "Screened event — export for SIEM or continue triage."}
          </span>
        </div>
      </footer>
    </aside>
  );
}

function Metric({
  label,
  value,
  hot,
}: {
  label: string;
  value: string;
  hot?: boolean;
}) {
  return (
    <div className="rounded-[6px] border border-border bg-background px-2.5 py-2">
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 font-mono text-[14px] font-medium",
          hot ? "text-[hsl(var(--severity-critical))]" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2 last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-all text-right text-muted-foreground", mono && "text-[10px]")}>
        {value}
      </dd>
    </div>
  );
}
