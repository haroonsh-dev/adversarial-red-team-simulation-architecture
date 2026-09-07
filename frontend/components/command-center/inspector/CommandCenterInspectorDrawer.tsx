"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Ban,
  ExternalLink,
  RotateCcw,
  Shield,
  ShieldAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InspectorSelection = {
  kind: "threat" | "agent" | "highlight" | "log" | "asi" | "step";
  title: string;
  threatCode?: string;
  severity?: "critical" | "warning" | "info";
  sourceAgent?: string;
  targetAgent?: string;
  evidence?: string;
  detectionSignal?: string;
  action?: string;
  confidence?: number;
  round?: string | number;
  timestamp?: string;
  eventId?: string;
  traceId?: string;
  fields?: Array<{ label: string; value: string }>;
  links?: Array<{ label: string; href: string }>;
};

export function CommandCenterInspectorDrawer({
  isOpen,
  onClose,
  selection,
  onQuarantineAgent,
  onBlockTool,
  onReplayRound,
}: {
  isOpen: boolean;
  onClose: () => void;
  selection: InspectorSelection | null;
  onQuarantineAgent?: (agent: string) => void;
  onBlockTool?: (tool: string) => void;
  onReplayRound?: (round: number) => void;
}) {
  // Listen for Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !selection) return null;

  const severity = selection.severity ?? "warning";
  const sevStyle =
    severity === "critical"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
      : severity === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
        : "border-sky-500/40 bg-sky-500/10 text-sky-400";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Threat and Event Inspector"
      className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-xs transition-opacity duration-300"
    >
      {/* Backdrop clickable */}
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Panel */}
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 overflow-hidden [scrollbar-width:thin]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              {selection.kind.toUpperCase()} DETAILS
            </span>
            {selection.threatCode ? (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase border",
                  sevStyle
                )}
              >
                {selection.threatCode}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            title="Close Inspector (Esc)"
            aria-label="Close inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Title & Quick Overview */}
        <div className="border-b border-border/70 p-4 bg-muted/10">
          <h2 className="font-sans text-[16px] font-semibold tracking-tight text-foreground">
            {selection.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px]">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold uppercase border",
                sevStyle
              )}
            >
              {severity === "critical" ? (
                <ShieldAlert className="h-3 w-3" />
              ) : (
                <Shield className="h-3 w-3" />
              )}
              <span>{severity.toUpperCase()} SEVERITY</span>
            </span>

            {selection.action ? (
              <span className="rounded border border-border bg-muted/40 px-2 py-0.5 font-semibold uppercase text-foreground">
                ACTION: {selection.action}
              </span>
            ) : null}

            {selection.confidence != null ? (
              <span className="rounded border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground">
                CONFIDENCE:{" "}
                <span className="text-foreground font-semibold">
                  {selection.confidence}%
                </span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 [scrollbar-width:thin]">
          {/* Key-Value Specifications */}
          <div>
            <h3 className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              TELEMETRY TRACEABILITY
            </h3>
            <dl className="rounded-lg border border-border bg-muted/20 p-3 space-y-2 font-mono text-[11px]">
              {selection.sourceAgent ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    SOURCE AGENT
                  </dt>
                  <dd className="font-medium text-foreground">
                    {selection.sourceAgent}
                  </dd>
                </div>
              ) : null}

              {selection.targetAgent ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    TARGET AGENT
                  </dt>
                  <dd className="font-medium text-foreground">
                    {selection.targetAgent}
                  </dd>
                </div>
              ) : null}

              {selection.detectionSignal ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    DETECTION SIGNAL
                  </dt>
                  <dd className="font-medium text-foreground text-right">
                    {selection.detectionSignal}
                  </dd>
                </div>
              ) : null}

              {selection.round ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    SIMULATION ROUND
                  </dt>
                  <dd className="font-medium text-foreground">
                    {typeof selection.round === "number"
                      ? `R${selection.round}`
                      : selection.round}
                  </dd>
                </div>
              ) : null}

              {selection.timestamp ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    TIMESTAMP
                  </dt>
                  <dd className="text-muted-foreground tabular-nums">
                    {selection.timestamp}
                  </dd>
                </div>
              ) : null}

              {selection.eventId ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    EVENT ID
                  </dt>
                  <dd className="font-mono text-[10px] text-foreground font-semibold">
                    {selection.eventId}
                  </dd>
                </div>
              ) : null}

              {selection.traceId ? (
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    TRACE ID
                  </dt>
                  <dd className="font-mono text-[10px] text-sky-400">
                    {selection.traceId}
                  </dd>
                </div>
              ) : null}

              {/* Custom fields if passed */}
              {selection.fields?.map((f) => (
                <div key={f.label} className="flex items-center justify-between">
                  <dt className="text-muted-foreground text-[10px] uppercase">
                    {f.label}
                  </dt>
                  <dd className="font-medium text-foreground text-right">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Evidence / Prompt Payload Box */}
          {selection.evidence ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  PAYLOAD EVIDENCE
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  RAW STREAM
                </span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100 dark:border-white/[0.08] dark:bg-[#05070a] dark:text-slate-200 break-words whitespace-pre-wrap">
                <code>{selection.evidence}</code>
              </div>
            </div>
          ) : null}

          {/* Destructive Operator Quick Controls */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                OPERATOR REMEDIATION ACTIONS
              </span>
              <span className="font-mono text-[9px] text-amber-500 font-medium">
                REQUIRES CONFIRMATION
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
              <button
                type="button"
                onClick={() =>
                  onQuarantineAgent?.(
                    selection.targetAgent || selection.sourceAgent || "Target"
                  )
                }
                className="flex items-center justify-center gap-1.5 rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-2 font-semibold text-rose-500 hover:bg-rose-500/20 active:scale-[0.98] transition-colors cursor-pointer"
              >
                <Shield className="h-3.5 w-3.5" />
                QUARANTINE AGENT
              </button>

              <button
                type="button"
                onClick={() => onBlockTool?.("invoice_export")}
                className="flex items-center justify-center gap-1.5 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 font-semibold text-amber-500 hover:bg-amber-500/20 active:scale-[0.98] transition-colors cursor-pointer"
              >
                <Ban className="h-3.5 w-3.5" />
                BLOCK TOOL
              </button>

              <button
                type="button"
                onClick={() =>
                  onReplayRound?.(
                    typeof selection.round === "number"
                      ? selection.round
                      : parseInt(String(selection.round).replace(/\D/g, "") || "1", 10)
                  )
                }
                className="col-span-2 flex items-center justify-center gap-1.5 rounded border border-border bg-muted/40 px-2.5 py-2 font-semibold text-foreground hover:bg-muted active:scale-[0.98] transition-colors cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                REPLAY ROUND IN ISOLATION
              </button>
            </div>
          </div>

          {/* SOC Deep Links */}
          <div className="border-t border-border pt-3">
            <span className="font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground block mb-2">
              SOC DEEP LINKS & CONTEXT
            </span>
            <div className="flex flex-col gap-1.5 font-mono text-[10px]">
              <Link
                href={`/red-team/monitor?threat=${encodeURIComponent(selection.threatCode || "ASI01")}`}
                className="flex items-center justify-between rounded border border-border bg-muted/20 px-2.5 py-1.5 text-foreground hover:border-sky-500/50 hover:bg-sky-500/5 transition-colors"
              >
                <span>Open Detections Desk →</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </Link>

              <Link
                href="/findings"
                className="flex items-center justify-between rounded border border-border bg-muted/20 px-2.5 py-1.5 text-foreground hover:border-sky-500/50 hover:bg-sky-500/5 transition-colors"
              >
                <span>View Security Findings Log →</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </Link>

              <Link
                href="/logs"
                className="flex items-center justify-between rounded border border-border bg-muted/20 px-2.5 py-1.5 text-foreground hover:border-sky-500/50 hover:bg-sky-500/5 transition-colors"
              >
                <span>Inspect Raw Agent Event Logs →</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </Link>

              <Link
                href="/admin/alerts"
                className="flex items-center justify-between rounded border border-border bg-muted/20 px-2.5 py-1.5 text-foreground hover:border-sky-500/50 hover:bg-sky-500/5 transition-colors"
              >
                <span>Open Strategic Alerts Console →</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
