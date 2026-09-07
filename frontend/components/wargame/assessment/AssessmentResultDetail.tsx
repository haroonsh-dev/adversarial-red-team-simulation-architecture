"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TranscriptTurn } from "@/lib/campaignTranscript";
import { toScore05 } from "@/lib/assessmentResults";
import { isScanFinding } from "@/lib/redTeamScanMetrics";

interface AssessmentResultDetailProps {
  turn: TranscriptTurn | null;
  className?: string;
}

export function AssessmentResultDetail({ turn, className }: AssessmentResultDetailProps) {
  if (!turn) {
    return (
      <div
        className={cn(
          "flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border px-4 text-center",
          className
        )}
      >
        <p className="text-[13px] text-muted-foreground">Select a test to inspect the conversation.</p>
      </div>
    );
  }

  const harmful = isScanFinding(turn);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-background",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">{turn.attackName}</p>
          <p className="font-mono text-[10px] text-muted-foreground">
            Round {turn.roundNumber}
            {turn.asiCode ? ` · ${turn.asiCode}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={harmful ? "critical" : "success"} className="meta-badge">
            {harmful ? "Harmful" : "Safe"}
          </Badge>
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            {toScore05(turn.attackSuccessScore)}/5
          </span>
        </div>
      </div>

      <div className="grid border-b border-border lg:grid-cols-2">
        <div className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Attack prompt
          </p>
          <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {turn.attackPrompt || "—"}
          </pre>
        </div>
        <div className="p-4">
          <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
            Model response
          </p>
          <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
            {turn.blocked
              ? `[BLOCKED${turn.blockedBy ? ` · ${turn.blockedBy}` : ""}]\n${turn.targetResponse || "—"}`
              : turn.targetResponse || "—"}
          </pre>
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
          Evaluation
        </p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-mono text-foreground">{turn.verdict}</span>
          {turn.reasoning ? ` — ${turn.reasoning}` : " — No judge explanation captured."}
        </p>
      </div>
    </div>
  );
}
