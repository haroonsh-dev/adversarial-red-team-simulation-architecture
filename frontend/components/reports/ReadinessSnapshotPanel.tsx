"use client";

import Link from "next/link";
import { ArrowRight, Download, Rocket, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardCard } from "@/components/shared/DashboardCard";
import {
  computeReadinessFromMilestones,
  READINESS_PHASE_META,
} from "@/lib/readinessFlow";
import { loadWargameReadinessRecords } from "@/lib/campaignReadiness";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { useMemo } from "react";

/** Go-live readiness snapshot for Reports / Settings — milestones + wargame appendix status. */
export function ReadinessSnapshotPanel({ hasTraffic = false }: { hasTraffic?: boolean }) {
  const { apiOnline, wsConnected } = useConnection();
  const flow = useMemo(
    () =>
      computeReadinessFromMilestones({
        apiOnline,
        wsConnected,
        hasTraffic,
      }),
    [apiOnline, wsConnected, hasTraffic]
  );
  const wargameCount = loadWargameReadinessRecords().length;
  const phaseMeta = READINESS_PHASE_META[flow.phase === "complete" ? "complete" : flow.phase];

  return (
    <DashboardCard
      title="Go-Live Compliance Readiness"
      description="Automated security suite tests, gateway integration, and wargame results."
      icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
      contentClassName="space-y-4"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-muted/40 border border-border">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-3xl font-semibold font-mono tabular-nums text-foreground">
              {flow.score}%
            </span>
            <Badge variant="outline" className="text-xs font-mono">
              {flow.productionReady ? "PRODUCTION READY" : phaseMeta.title.toUpperCase()}
            </Badge>
            {wargameCount > 0 && (
              <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                {wargameCount} wargame{wargameCount === 1 ? "" : "s"} archived
              </Badge>
            )}
          </div>
          <div className="w-full max-w-lg bg-muted rounded-full h-2 overflow-hidden border border-border">
            <div
              className="bg-foreground h-full transition-all duration-300 rounded-full"
              style={{ width: `${Math.max(flow.score, 5)}%` }}
            />
          </div>
          {flow.blockers.length > 0 && !flow.productionReady && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-amber-400 shrink-0" />
              {flow.blockers[0]}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button asChild size="sm" variant="outline" className="text-xs h-8">
            <Link href={flow.nextAction.href}>
              <Rocket className="h-3.5 w-3.5" />
              {flow.nextAction.label}
            </Link>
          </Button>
          <Button asChild size="sm" className="text-xs h-8 font-medium">
            <Link href="/reports">
              <Download className="h-3.5 w-3.5" />
              Export PDF
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>
    </DashboardCard>
  );
}
