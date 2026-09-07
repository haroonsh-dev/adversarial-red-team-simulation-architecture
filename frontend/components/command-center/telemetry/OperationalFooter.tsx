"use client";

import { useState } from "react";
import { ExternalLink, ShieldAlert, ShieldCheck } from "lucide-react";
import { CockpitCard } from "../cockpit/CockpitCard";
import { cn } from "@/lib/utils";
import type { CampaignRound, TechniqueBar } from "../prototype/model";

export function OperationalFooter({
  events,
  techniques,
  campaignRounds,
  onOpenInspect,
  onSelectRound,
  selectedRoundId,
}: {
  events: Array<Record<string, unknown>>;
  techniques: TechniqueBar[];
  campaignRounds: CampaignRound[];
  onOpenInspect: (kind: "campaign" | "asi", id: string) => void;
  onSelectRound: (id: string, playbook: string | null) => void;
  selectedRoundId: string | null;
}) {
  const [rightTab, setRightTab] = useState<"vectors" | "rounds">("vectors");

  return (
    <div className="grid h-[220px] shrink-0 grid-cols-1 gap-3 px-4 pb-4 xl:grid-cols-[1fr_420px]">
      {/* Left Column: High-Density Real-Time Telemetry Stream */}
      <CockpitCard className="h-full">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border-default)] px-3.5 py-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-text-muted)]">
              Live Adversarial Telemetry Feed
            </span>
            <span className="rounded bg-[var(--cc-bg-surface-3)] px-1.5 py-0.2 font-mono text-[9px] text-[var(--cc-text-muted)]">
              {events.length} events
            </span>
          </div>
          <span className="font-mono text-[9px] text-[var(--cc-text-dim)]">
            Auto-scrolling · Ring Buffer (100 max)
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:thin]">
          {events.length === 0 ? (
            <div className="flex h-full items-center justify-center font-mono text-[11px] text-[var(--cc-text-dim)]">
              Standby · Awaiting live probe activity...
            </div>
          ) : (
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="sticky top-0 bg-[var(--cc-bg-surface-2)] border-b border-[var(--cc-border-subtle)] text-[9px] uppercase tracking-wider text-[var(--cc-text-muted)]">
                <tr>
                  <th className="px-3 py-1 font-medium">Time (UTC)</th>
                  <th className="px-2 py-1 font-medium">Origin Agent</th>
                  <th className="px-2 py-1 font-medium">Vector Code</th>
                  <th className="px-2 py-1 font-medium">Risk Score</th>
                  <th className="px-2 py-1 font-medium">Verdict</th>
                  <th className="px-2 py-1 font-medium text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cc-border-subtle)]">
                {events.slice(0, 30).map((evt, idx) => {
                  const id = String(evt.event_id || evt.id || `evt-${idx}`);
                  const agent = String(evt.agent || evt.source_agent || "Recon");
                  const vector = String(evt.technique || evt.vector || "ASI-01");
                  const risk = Number(evt.risk_score || evt.risk || 45);
                  const verdict = String(evt.verdict || "ALLOWED").toUpperCase();
                  const isBreach = verdict.includes("BLOCK") || verdict.includes("QUARANTINE") || risk >= 80;

                  return (
                    <tr
                      key={id}
                      className="hover:bg-[var(--cc-bg-surface-hover)] transition-colors cursor-pointer"
                      onClick={() => onOpenInspect("asi", vector)}
                    >
                      <td className="px-3 py-1 text-[var(--cc-text-muted)] tabular-nums">
                        {String(evt.timestamp || "14:02:18").slice(-8)}
                      </td>
                      <td className="px-2 py-1 font-medium text-[var(--cc-text-primary)]">
                        {agent}
                      </td>
                      <td className="px-2 py-1 text-[var(--cc-text-muted)]">
                        {vector}
                      </td>
                      <td className="px-2 py-1 tabular-nums">
                        <span
                          className={cn(
                            "font-semibold",
                            risk >= 80
                              ? "text-red-500"
                              : risk >= 50
                                ? "text-amber-500"
                                : "text-emerald-500"
                          )}
                        >
                          {risk}/100
                        </span>
                      </td>
                      <td className="px-2 py-1">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase",
                            isBreach
                              ? "border border-red-500/40 bg-red-500/10 text-red-400"
                              : "border border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                          )}
                        >
                          {isBreach ? (
                            <ShieldAlert className="h-2.5 w-2.5" />
                          ) : (
                            <ShieldCheck className="h-2.5 w-2.5" />
                          )}
                          {verdict}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-right">
                        <ExternalLink className="h-3 w-3 inline text-[var(--cc-text-dim)] hover:text-[var(--cc-text-primary)]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </CockpitCard>

      {/* Right Column: Threat Vectors & Round Comparison */}
      <CockpitCard className="h-full">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--cc-border-default)] px-3.5 py-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRightTab("vectors")}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] font-medium transition-colors",
                rightTab === "vectors"
                  ? "bg-[var(--cc-bg-surface-3)] text-[var(--cc-text-primary)] font-semibold"
                  : "text-[var(--cc-text-muted)] hover:text-[var(--cc-text-primary)]"
              )}
            >
              Dominant threat vectors
            </button>
            <button
              type="button"
              onClick={() => setRightTab("rounds")}
              className={cn(
                "rounded px-2 py-1 font-mono text-[10px] font-medium transition-colors",
                rightTab === "rounds"
                  ? "bg-[var(--cc-bg-surface-3)] text-[var(--cc-text-primary)] font-semibold"
                  : "text-[var(--cc-text-muted)] hover:text-[var(--cc-text-primary)]"
              )}
            >
              Round History
            </button>
          </div>
          <span className="font-mono text-[9px] text-[var(--cc-text-dim)]">
            {rightTab === "vectors" ? `${techniques.length} Techniques` : `${campaignRounds.length} Rounds`}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 [scrollbar-width:thin]">
          {rightTab === "vectors" ? (
            <div className="space-y-2">
              {techniques.map((t) => (
                <div
                  key={t.name}
                  onClick={() => onOpenInspect("asi", t.asiCode ?? t.name)}
                  className="group cursor-pointer space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-[var(--cc-text-primary)] group-hover:text-[var(--cc-primary)] transition-colors truncate">
                      {t.name}
                    </span>
                    <span className="text-[var(--cc-text-muted)] tabular-nums">
                      {t.pct}% ({t.count})
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--cc-border-default)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--cc-primary)] rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(4, t.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="text-[9px] uppercase tracking-wider text-[var(--cc-text-muted)] border-b border-[var(--cc-border-subtle)]">
                <tr>
                  <th className="py-1">Campaign</th>
                  <th className="py-1 text-center">R</th>
                  <th className="py-1 text-right">ARTSA</th>
                  <th className="py-1 text-right">Base</th>
                  <th className="py-1 text-right">Δ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cc-border-subtle)]">
                {campaignRounds.map((r) => {
                  const rid = `${r.campaignId}:${r.round}`;
                  const isSelected = selectedRoundId === rid;

                  return (
                    <tr
                      key={rid}
                      onClick={() => {
                        onSelectRound(rid, r.playbook);
                        onOpenInspect("campaign", rid);
                      }}
                      className={cn(
                        "cursor-pointer hover:bg-[var(--cc-bg-surface-hover)] transition-colors",
                        isSelected && "bg-[var(--cc-primary-subtle)] text-[var(--cc-text-primary)]"
                      )}
                    >
                      <td className="py-1.5 truncate max-w-[140px] text-[var(--cc-text-primary)]">
                        {r.campaignName}
                      </td>
                      <td className="py-1.5 text-center tabular-nums text-[var(--cc-text-muted)]">
                        {r.round}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[var(--cc-primary)] font-semibold">
                        {r.artsa}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[var(--cc-text-dim)]">
                        {r.baseline}%
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-500 font-semibold">
                        +{r.delta}pp
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </CockpitCard>
    </div>
  );
}
