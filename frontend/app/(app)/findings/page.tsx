"use client";

import Link from "next/link";
import { FileSearch, ShieldPlus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageStack } from "@/components/shared/PageStack";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { FindingsTable } from "@/components/findings/FindingsTable";
import { FindingCustodyTrail } from "@/components/findings/FindingCustodyTrail";
import { PromoteToPlaybookPanel } from "@/components/wargame/PromoteToPlaybookPanel";
import { Button } from "@/components/ui/button";
import { useFindings, type ServerFinding } from "@/lib/hooks/useFindings";
import { useAppData } from "@/lib/context/AppDataProvider";
import { useState } from "react";
import type { TranscriptTurn } from "@/lib/campaignTranscript";

function findingToTurn(row: ServerFinding): TranscriptTurn {
  return {
    roundNumber: 0,
    attackPrompt: row.attack_prompt ?? row.title,
    attackName: row.title,
    category: row.category,
    asiCode: row.asi_code,
    asiLabel: row.asi_label,
    templateId: null,
    objective: null,
    mutationsApplied: [],
    targetResponse: "",
    blocked: false,
    blockedBy: null,
    targetError: false,
    errorDetail: null,
    verdict: row.verdict ?? "UNKNOWN",
    attackSuccessScore: 0,
    defenseQualityScore: 0,
    bypassDepth: 0,
    reasoning: row.reasoning ?? "",
    severity: row.severity,
    timestamp: null,
    durationMs: 0,
    latencyMs: 0,
    informationLeakageScore: 0,
    mitreAtlas: null,
    owaspLlm: null,
    guardrailTrace: [],
  };
}

export default function FindingsPage() {
  const { findings, playbookVersion, loading, refresh } = useFindings();
  const { refreshPolicies } = useAppData();
  const [selected, setSelected] = useState<ServerFinding | null>(null);

  const pending = findings.filter((r) => r.status === "new" || r.status === "validated").length;

  const handlePromoted = () => {
    void refresh();
    void refreshPolicies();
  };

  return (
    <PageStack>
      <PageHeader
        title="Findings"
        description="Problems found from tests and live activity, with a trail of what happened and what to do next."
        icon={<FileSearch className="h-5 w-5" />}
        badge={
          playbookVersion > 0 ? (
            <span className="meta-badge rounded-md border border-border px-2 py-0.5 font-mono text-[10px]">
              Playbook v{playbookVersion}
            </span>
          ) : null
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="interactive-pill">
              <Link href="/admin/policies">Policies</Link>
            </Button>
            <Button asChild size="sm" className="interactive-pill">
              <Link href="/red-team/lab">
                <ShieldPlus className="h-3.5 w-3.5" />
                Attack Lab
              </Link>
            </Button>
          </div>
        }
      />

      {!loading && findings.length === 0 ? (
        <EmptyState
          icon={FileSearch}
          title="No findings yet"
          description="Run an attack test or send live activity. Findings are stored and tracked."
          action={
            <Button asChild size="sm">
                <Link href="/red-team/lab">Attack Lab</Link>
            </Button>
          }
          variant="hero"
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <DashboardCard
            title="Findings queue"
            description={`${pending} pending triage`}
            className="lg:col-span-2"
            contentClassName="pt-2"
          >
            <FindingsTable
              rows={findings}
              loading={loading}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
            />
          </DashboardCard>

          <div className="space-y-4">
            {selected?.custody_chain?.length ? (
              <FindingCustodyTrail chain={selected.custody_chain} />
            ) : (
              <DashboardCard title="Chain of custody" description="Select a finding to inspect the agent hop trail">
                <p className="text-sm text-muted-foreground">
                  Each finding traces Research → Curator → Red Team → Target → Judge → Defender.
                </p>
              </DashboardCard>
            )}
            <PromoteToPlaybookPanel
              turn={selected ? findingToTurn(selected) : null}
              findingId={selected?.id ?? null}
              onPromoted={handlePromoted}
            />
          </div>
        </div>
      )}
    </PageStack>
  );
}
