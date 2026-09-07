"use client";

import { useEffect, useState } from "react";
import { Shield, Plus, Trash2, GitBranch } from "lucide-react";
import { fetchFromBackend } from "@/lib/api";
import { useAuthRole } from "@/lib/hooks/useAuthRole";
import { useAppData } from "@/lib/context/AppDataProvider";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageStack } from "@/components/shared/PageStack";
import { PlaybookVersionHistory } from "@/components/playbook/PlaybookVersionHistory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface PolicyRule {
  name: string;
  pattern: string;
  event_type: string;
  severity: string;
  risk_score: number;
  description: string;
}

export default function PoliciesPage() {
  const { capabilities, loading: authLoading } = useAuthRole();
  const {
    policyRules: rules,
    playbookVersion,
    policyVersions,
    policiesLoading,
    refreshPolicies,
  } = useAppData();
  const [localRules, setLocalRules] = useState<PolicyRule[]>([]);
  const [draft, setDraft] = useState<PolicyRule>({
    name: "",
    pattern: "",
    event_type: "SANDBOX_ESCAPE",
    severity: "HIGH",
    risk_score: 75,
    description: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalRules(rules);
  }, [rules]);

  const saveAll = async () => {
    setSaving(true);
    await fetchFromBackend("/api/v1/policies", {
      method: "PUT",
      body: JSON.stringify({ rules: localRules }),
    });
    setSaving(false);
    void refreshPolicies();
  };

  const addRule = async () => {
    if (!draft.name || !draft.pattern) return;
    await fetchFromBackend("/api/v1/policies/rules", {
      method: "POST",
      body: JSON.stringify(draft),
    });
    setDraft({ name: "", pattern: "", event_type: "SANDBOX_ESCAPE", severity: "HIGH", risk_score: 75, description: "" });
    void refreshPolicies();
  };

  const removeRule = (index: number) => {
    setLocalRules((prev) => prev.filter((_, i) => i !== index));
  };

  if (!authLoading && !capabilities.can_manage_policies) {
    return (
      <PageStack>
        <PageHeader
          title="Policies"
          description="Detection rules ARTSA applies when it checks each action."
          icon={<Shield className="h-5 w-5" />}
        />
        <EmptyState
          icon={Shield}
          title="Policy management restricted"
          description="Your role does not include permission to view or edit organization policies."
        />
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageHeader
        title="Policies"
        description="Detection rules ARTSA applies when it checks each action."
        icon={<Shield className="h-5 w-5" />}
        actions={
          <Button size="sm" onClick={saveAll} disabled={saving}>
            {saving ? "Saving…" : "Save all"}
          </Button>
        }
      />

      <DashboardCard title="Add Rule" badge={<Badge variant="secondary">{localRules.length} active · v{playbookVersion || localRules.length}</Badge>}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input placeholder="Rule name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <Input placeholder="What this rule catches (plain English)" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="md:col-span-2" />
          <Input placeholder="Pattern (regex — engineers only)" value={draft.pattern} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} className="font-mono md:col-span-2" />
        </div>
        <Button size="sm" className="mt-3 gap-2" onClick={addRule}>
          <Plus className="h-4 w-4" />
          Add rule
        </Button>
      </DashboardCard>

      <DashboardCard
        title="Playbook version history"
        description="Git-log style changelog — each promote or rule edit bumps the version."
        icon={<GitBranch className="h-4 w-4" />}
      >
        <PlaybookVersionHistory
          versions={policyVersions}
          loading={policiesLoading}
          currentVersion={playbookVersion}
        />
      </DashboardCard>

      <div className="space-y-3">
        {localRules.map((rule, i) => (
          <DashboardCard key={`${rule.name}-${i}`} title={rule.name} badge={<Badge variant={rule.severity === "CRITICAL" ? "critical" : rule.severity === "HIGH" ? "warning" : rule.severity === "MEDIUM" ? "secondary" : "success"}>{rule.severity}</Badge>}>
            <p className="text-sm text-foreground">
              {rule.description || "Custom detection rule for agent tool calls."}
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                Technical pattern (for engineers)
              </summary>
              <p className="mt-2 rounded-md border border-border bg-muted/20 px-2 py-1.5 font-mono text-[10px] text-muted-foreground break-all">
                /{rule.pattern}/
              </p>
            </details>
            <div className="mt-3 flex items-center justify-between">
              <RiskScoreInline score={rule.risk_score} />
              <Button variant="ghost" size="sm" onClick={() => removeRule(i)} aria-label={`Remove ${rule.name}`}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </DashboardCard>
        ))}
      </div>
    </PageStack>
  );
}

function RiskScoreInline({ score }: { score: number }) {
  return <span className="font-mono text-xs text-muted-foreground">Risk threshold: {score}</span>;
}
