"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { useCampaignTranscript } from "@/lib/hooks/useCampaignTranscript";
import { cn } from "@/lib/utils";

const TABS = ["Input", "Response", "Tool Trace", "Timeline"] as const;

export default function EvidencePage() {
  const search = useSearchParams();
  const campaignId = search.get("campaign");
  const { campaigns } = useCampaigns();
  const campaign = campaigns.find((c) => c.id === campaignId) ?? campaigns[0];
  const { turns, loading } = useCampaignTranscript(campaign?.id ?? null);
  const turn = turns[turns.length - 1] ?? null;
  const [tab, setTab] = useState<(typeof TABS)[number]>("Input");

  const timeline = useMemo(() => {
    if (!turn) return [];
    return [
      { t: "T+0s", label: "Attack received" },
      { t: "T+1s", label: "Model responded" },
      {
        t: "T+1s",
        label: turn.category ? `Category: ${turn.category}` : "Tool path evaluated",
      },
      {
        t: "T+2s",
        label: turn.blocked ? "Response blocked" : "Detection evaluated",
      },
    ];
  }, [turn]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {campaign ? (
          <Link
            href={`/red-team/monitor/${campaign.id}`}
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            {campaign.name} →
          </Link>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-2.5 py-1 text-[12px]",
              tab === t ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {loading && !turn ? (
        <p className="text-[13px] text-muted-foreground">Loading this session…</p>
      ) : !turn ? (
        <p className="text-[13px] text-muted-foreground">
          No rounds to inspect.{" "}
          <Link href="/red-team/campaigns" className="underline-offset-2 hover:underline">
            Open Campaigns
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {tab === "Input" ? (
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-[12px] whitespace-pre-wrap">
              {turn.attackPrompt || "—"}
            </pre>
          ) : null}
          {tab === "Response" ? (
            <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted/20 p-3 font-mono text-[12px] whitespace-pre-wrap">
              {turn.targetResponse || "—"}
            </pre>
          ) : null}
          {tab === "Tool Trace" ? (
            <div className="space-y-2 rounded-md border border-border p-3 text-[13px]">
              <p>
                <span className="text-muted-foreground">User</span> → Agent →{" "}
                <span className="font-mono">{turn.category || "tool"}</span>
              </p>
              <p className="text-muted-foreground">{turn.objective || turn.reasoning || "—"}</p>
              {turn.mutationsApplied.length > 0 ? (
                <p className="font-mono text-[11px]">
                  Mutations: {turn.mutationsApplied.join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}
          {tab === "Timeline" ? (
            <ul className="space-y-2 rounded-md border border-border p-3">
              {timeline.map((row) => (
                <li key={`${row.t}-${row.label}`} className="flex gap-3 text-[13px]">
                  <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {row.t}
                  </span>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
