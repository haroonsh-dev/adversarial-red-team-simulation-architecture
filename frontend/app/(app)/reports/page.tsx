"use client";

import { useEffect, useState } from "react";
import { FileText, Download, ChevronRight, Loader2 } from "lucide-react";
import { useCampaigns, type CampaignListItem } from "@/lib/hooks/useCampaigns";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageStack } from "@/components/shared/PageStack";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import Link from "next/link";

function statusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === "completed" || s === "complete") return "Complete";
  if (s === "running" || s === "in_progress") return "Running";
  if (s === "failed") return "Failed";
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function defenseOutOf100(summary: Record<string, unknown> | undefined): string {
  const raw = summary?.avg_defense_quality;
  if (raw == null || Number.isNaN(Number(raw))) return "—";
  const n = Number(raw);
  const score = n <= 10 ? Math.round(n * 10) : Math.round(n);
  return `${score}/100`;
}

export default function ReportsPage() {
  const { campaigns, loading } = useCampaigns();
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignListItem | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (campaigns.length && !selectedCampaign) {
      setSelectedCampaign(campaigns[0]);
    }
  }, [campaigns, selectedCampaign]);

  const summary = selectedCampaign?.summary as Record<string, unknown> | undefined;
  const verdicts = (summary?.results_by_verdict as Record<string, number> | undefined) ?? {};
  const blocked = verdicts.BLOCKED ?? 0;
  const gotThrough = verdicts.BREACHED ?? verdicts.ATTACK_SUCCESS ?? 0;
  const totalAttempts = Number(summary?.total_rounds ?? selectedCampaign?.rounds_completed ?? 0);

  const exportPdf = async () => {
    if (!summary) return;
    setExporting(true);
    try {
      const res = await fetch("/api/backend/api/v1/compliance/export?format=pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summary),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `artsa-report-${selectedCampaign?.id ?? "export"}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageStack>
      <PageHeader
        title="Reports"
        description="Pick an attack test and export a PDF for leadership."
        icon={<FileText className="h-5 w-5" />}
        actions={
          <Button asChild size="sm">
            <Link href="/red-team/lab">Attack Lab</Link>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <DashboardCard title="Attack tests" contentClassName="p-0">
          <ScrollArea className="h-[520px]">
            {loading ? (
              <div className="space-y-2 p-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No attack tests yet"
                description="Run a test in Attack Lab, then come back here to export a PDF."
                action={
                  <Button asChild size="sm">
                    <Link href="/red-team/lab">Attack Lab</Link>
                  </Button>
                }
                className="m-4 border-0"
              />
            ) : (
              <ul className="divide-y divide-border">
                {campaigns.map((c) => (
                  <li key={String(c.id)}>
                    <button
                      type="button"
                      onClick={() => setSelectedCampaign(c)}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/60",
                        selectedCampaign?.id === c.id && "bg-muted"
                      )}
                    >
                      <div>
                        <p className="text-sm font-medium">{String(c.name)}</p>
                        <p className="text-[13px] text-muted-foreground">
                          {String(c.model ?? "—")} · {statusLabel(String(c.status ?? ""))}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </ScrollArea>
        </DashboardCard>

        <DashboardCard
          className="lg:col-span-2"
          title={selectedCampaign ? String(selectedCampaign.name) : "Report"}
          contentClassName="space-y-6"
        >
          {selectedCampaign ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                <div>
                  <Badge variant="secondary" className="mb-2">
                    {statusLabel(String(selectedCampaign.status))}
                  </Badge>
                  <p className="text-[13px] text-muted-foreground">
                    {String(selectedCampaign.provider ?? "—")} · {String(selectedCampaign.model ?? "—")}
                  </p>
                </div>
                <Button size="sm" className="gap-2" onClick={() => void exportPdf()} disabled={!summary || exporting}>
                  {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Export PDF
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { label: "Attempts", value: totalAttempts },
                  { label: "Blocked", value: blocked },
                  { label: "Defense", value: defenseOutOf100(summary) },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border border-border bg-muted/20 p-4">
                    <p className="text-[13px] text-muted-foreground">{stat.label}</p>
                    <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{String(stat.value)}</p>
                  </div>
                ))}
              </div>
              {gotThrough > 0 ? (
                <p className="text-[13px] text-[hsl(var(--severity-critical))]">
                  {gotThrough} got through this test.
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              icon={FileText}
              title="Select a test"
              description="Choose an attack test on the left, or run a new one in Attack Lab."
              action={
                <Button asChild size="sm">
                  <Link href="/red-team/lab">Attack Lab</Link>
                </Button>
              }
            />
          )}
        </DashboardCard>
      </div>
    </PageStack>
  );
}
