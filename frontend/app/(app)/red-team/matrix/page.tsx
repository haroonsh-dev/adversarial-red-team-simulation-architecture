"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { OutcomeBadge } from "@/components/red-team/OutcomeBadge";
import { Button } from "@/components/ui/button";
import { getTechnique, type LabTechniqueId } from "@/lib/attackLab";
import { parseTopFindings, type TranscriptTurn } from "@/lib/campaignTranscript";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { runLabProbe } from "@/lib/labActions";
import { deriveRoundSecurity } from "@/lib/liveMonitorSecurity";
import { downloadJson, downloadTextFile, rowsToCsv } from "@/lib/redTeamExport";
import { classifyFindingFamily } from "@/lib/redTeamOverview";
import { toast } from "@/lib/stores/toast";
import { cn } from "@/lib/utils";

const FAMILY_TO_TECH: Record<string, LabTechniqueId> = {
  "Prompt Injection": "Prompt Injection",
  "Tool Abuse": "Tool Abuse",
  "Data Exfiltration": "Exfiltration",
  Exfiltration: "Exfiltration",
  "Goal Manipulation": "Goal Drift",
  "Goal Drift": "Goal Drift",
  "Memory Attacks": "Memory Attack",
  "Memory Attack": "Memory Attack",
  "Privilege Escalation": "Privilege",
  Privilege: "Privilege",
  "Context Attack": "Context Attack",
};

type OutcomeRow = {
  key: string;
  attack: string;
  detection: string;
  prevention: string;
  leak: string;
  result: string;
  campaignId: string;
  campaignName: string;
  href: string;
  labHref: string;
  turn: TranscriptTurn;
};

export default function ResultMatrixPage() {
  const { campaigns } = useCampaigns();
  const [probingKey, setProbingKey] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const rows = useMemo(() => {
    const out: OutcomeRow[] = [];

    for (const c of campaigns) {
      for (const f of parseTopFindings(c.summary ?? null)) {
        const family = classifyFindingFamily(`${f.attackName} ${f.category}`);
        const axes = deriveRoundSecurity(f);
        if (!axes) continue;
        const tech = FAMILY_TO_TECH[family] ?? "Prompt Injection";
        out.push({
          key: `${c.id}-${family}-${out.length}`,
          attack: family,
          detection: axes.detection,
          prevention: axes.prevention,
          leak: axes.leak,
          result: axes.result,
          campaignId: c.id,
          campaignName: c.name,
          href: `/red-team/monitor/${c.id}`,
          labHref: `/red-team/lab?technique=${encodeURIComponent(tech)}`,
          turn: f,
        });
      }
    }

    return out.slice(0, 24);
  }, [campaigns]);

  const selected = rows.find((r) => r.key === selectedKey) ?? null;

  const retestProbe = async (family: string, key: string) => {
    const tech = FAMILY_TO_TECH[family] ?? "Prompt Injection";
    const payload = getTechnique(tech).templates.Direct;
    setProbingKey(key);
    const outcome = await runLabProbe(payload, {
      persist: true,
      reason: `outcomes retest · ${family}`,
    });
    setProbingKey(null);
    if (!outcome.ok) {
      toast("Retest failed", { description: outcome.error ?? "API error", variant: "error" });
      return;
    }
    toast("Retest probed", {
      description: `${family} · ${outcome.result?.verdict?.verdict ?? "scored"} · ${outcome.latencyMs}ms`,
      variant: "success",
    });
  };

  const exportCsv = () => {
    const csv = rowsToCsv(
      [
        "attack",
        "detection",
        "prevention",
        "leak",
        "result",
        "verdict",
        "severity",
        "blocked_by",
        "campaign",
        "campaign_id",
        "prompt",
        "response",
        "reasoning",
      ],
      rows.map((r) => [
        r.attack,
        r.detection,
        r.prevention,
        r.leak,
        r.result,
        r.turn.verdict,
        r.turn.severity,
        r.turn.blockedBy ?? "",
        r.campaignName,
        r.campaignId,
        r.turn.attackPrompt,
        r.turn.targetResponse,
        r.turn.reasoning,
      ])
    );
    downloadTextFile(`artsa-outcomes-${Date.now()}.csv`, csv);
    toast("Exported CSV", { description: `${rows.length} outcome rows`, variant: "success" });
  };

  const exportJson = () => {
    downloadJson(
      `artsa-outcomes-${Date.now()}.json`,
      rows.map((r) => ({
        attack: r.attack,
        detection: r.detection,
        prevention: r.prevention,
        leak: r.leak,
        result: r.result,
        campaignId: r.campaignId,
        campaignName: r.campaignName,
        evidence: {
          prompt: r.turn.attackPrompt,
          response: r.turn.targetResponse,
          verdict: r.turn.verdict,
          severity: r.turn.severity,
          blockedBy: r.turn.blockedBy,
          detectors: r.turn.guardrailTrace.map((g) => g.layer),
          reasoning: r.turn.reasoning,
          action: r.turn.blocked ? "BLOCK" : r.turn.verdict,
        },
      }))
    );
    toast("Exported JSON", { description: `${rows.length} outcome rows`, variant: "success" });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted-foreground">
          Each row is a judged attack — open a session for the prompt, response, and what ARTSA did.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={exportCsv}>
            Export CSV
          </Button>
          <Button size="sm" variant="outline" disabled={rows.length === 0} onClick={exportJson}>
            Export JSON
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/red-team/lab">Attack Lab</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/red-team/campaigns/new">Launch campaign</Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-border px-4 py-8 text-center">
          <p className="text-[13px] text-muted-foreground">No evaluated attacks yet.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button size="sm" asChild>
              <Link href="/red-team/lab">Probe in Lab</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/red-team/campaigns/new">Launch campaign</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Attack</th>
                <th className="px-3 py-2 font-medium">Detection</th>
                <th className="px-3 py-2 font-medium">Prevention</th>
                <th className="px-3 py-2 font-medium">Leak</th>
                <th className="px-3 py-2 font-medium">Result</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.key}
                  className={cn(
                    "cursor-pointer border-b border-border last:border-0 hover:bg-muted/20",
                    selectedKey === row.key && "bg-[hsl(var(--severity-info-subtle))]"
                  )}
                  onClick={() => setSelectedKey(row.key)}
                >
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{row.attack}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <OutcomeBadge kind="detection" value={row.detection} />
                  </td>
                  <td className="px-3 py-2.5">
                    <OutcomeBadge kind="prevention" value={row.prevention} />
                  </td>
                  <td className="px-3 py-2.5">
                    <OutcomeBadge kind="leak" value={row.leak} />
                  </td>
                  <td className="px-3 py-2.5">
                    <OutcomeBadge kind="result" value={row.result} />
                  </td>
                  <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => setSelectedKey(row.key)}
                      >
                        Evidence
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" asChild>
                        <Link href={`${row.href}?follow=1`}>Theater</Link>
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" asChild>
                        <Link href={row.labHref}>Lab</Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={probingKey === row.key}
                        onClick={() => void retestProbe(row.attack, row.key)}
                      >
                        {probingKey === row.key ? "…" : "Check"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/40"
            aria-label="Close evidence"
            onClick={() => setSelectedKey(null)}
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-card shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="outcomes-evidence-title"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p
                  id="outcomes-evidence-title"
                  className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
                >
                  Evidence
                </p>
                <p className="mt-1 truncate text-[15px] font-medium text-foreground">
                  {selected.attack}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {selected.campaignName}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setSelectedKey(null)}>
                Close
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-[13px]">
              <div className="flex flex-wrap gap-2">
                <OutcomeBadge kind="result" value={selected.result} />
                <OutcomeBadge kind="detection" value={selected.detection} />
                <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px]">
                  {selected.turn.verdict}
                </span>
                <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px]">
                  {selected.turn.severity}
                </span>
              </div>

              <EvidenceBlock
                label="Action"
                body={
                  selected.turn.blocked
                    ? `Blocked${selected.turn.blockedBy ? ` by ${selected.turn.blockedBy}` : ""}`
                    : selected.turn.verdict || "Allow / flag"
                }
              />
              <EvidenceBlock
                label="Detectors / layers"
                body={
                  selected.turn.guardrailTrace.length
                    ? selected.turn.guardrailTrace
                        .map((g) => `${g.layer}${g.passed ? " ✓" : " ✕"}${g.details ? ` — ${g.details}` : ""}`)
                        .join("\n")
                    : selected.turn.blockedBy || "—"
                }
                mono
              />
              <EvidenceBlock label="Prompt" body={selected.turn.attackPrompt || "—"} mono />
              <EvidenceBlock label="Response" body={selected.turn.targetResponse || "—"} mono />
              <EvidenceBlock label="Judge reasoning" body={selected.turn.reasoning || "—"} />
              {(selected.turn.owaspLlm || selected.turn.mitreAtlas) && (
                <p className="font-mono text-[11px] text-muted-foreground">
                  {[selected.turn.owaspLlm, selected.turn.mitreAtlas].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
              <Button size="sm" asChild>
                <Link href={`${selected.href}?follow=1`}>Open theater</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={selected.labHref}>Retest in Lab</Link>
              </Button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function EvidenceBlock({
  label,
  body,
  mono,
}: {
  label: string;
  body: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <pre
        className={cn(
          "mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 px-2.5 py-2 text-[12px] leading-relaxed text-foreground",
          mono && "font-mono text-[11px]"
        )}
      >
        {body}
      </pre>
    </div>
  );
}
