"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ShieldAlert, Zap } from "lucide-react";
import { useTopologyThreats } from "@/lib/hooks/useTopologyThreats";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { SegmentedControl } from "@/components/shared/SegmentedControl";
import { ThreatRow } from "@/components/shared/ThreatRow";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { severityFromScore } from "@/lib/severity";
import { EMPTY_STATE_UI } from "@/lib/getStartedLabels";

const SEVERITY_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
] as const;

type SeverityFilter = (typeof SEVERITY_FILTERS)[number]["value"];

export function ThreatMatrix() {
  const router = useRouter();
  const { threats, loading } = useTopologyThreats();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<SeverityFilter>("ALL");

  const displayedThreats = threats;

  const filtered = useMemo(() => {
    return displayedThreats.filter((t) => {
      const severity = severityFromScore(t.risk_score);
      const matchesSearch =
        t.agent_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.session_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.status.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = selectedFilter === "ALL" || severity === selectedFilter;
      return matchesSearch && matchesFilter;
    });
  }, [displayedThreats, searchTerm, selectedFilter]);

  return (
    <DashboardCard
      title="Live Threat Matrix"
      description="Sessions that look risky — select one to open replay"
      badge={
        <Badge variant={displayedThreats.length ? "outline" : "secondary"} className="meta-badge font-mono">
          {loading ? "…" : `${displayedThreats.length} active`}
        </Badge>
      }
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input
            type="text"
            placeholder="Search by agent or session…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 font-mono text-xs"
            disabled={loading || displayedThreats.length === 0}
          />
        </div>
        <SegmentedControl
          options={[...SEVERITY_FILTERS]}
          value={selectedFilter}
          onChange={setSelectedFilter}
          layoutId="threat-matrix-filter"
          className="max-w-full overflow-x-auto"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        displayedThreats.length > 0 ? (
          <EmptyState
            icon={ShieldAlert}
            title="No threats match your filter"
            description="Try clearing the search or picking a different severity."
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedFilter("ALL");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ShieldAlert}
            title={EMPTY_STATE_UI.allClearTitle}
            description={EMPTY_STATE_UI.allClearDescription}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/get-started">{EMPTY_STATE_UI.openSetup}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/campaigns">{EMPTY_STATE_UI.runWargame}</Link>
                </Button>
              </div>
            }
          />
        )
      ) : (
        <div className="space-y-2">
          {filtered.map((threat, i) => (
            <ThreatRow key={threat.session_id} threat={threat} rank={i + 1} />
          ))}
        </div>
      )}

      {displayedThreats.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" className="gap-2 font-mono text-xs" onClick={() => router.push("/command-center/topology")}>
            <Zap className="h-3.5 w-3.5" aria-hidden />
            View topology graph
          </Button>
        </div>
      )}
    </DashboardCard>
  );
}
