"use client";

import { useEffect, useState } from "react";
import {
  Settings2,
  Cable,
  Users,
  Shield,
  Cpu,
  KeyRound,
} from "lucide-react";
import { fetchFromBackend } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageStack } from "@/components/shared/PageStack";
import { ReadinessSnapshotPanel } from "@/components/reports/ReadinessSnapshotPanel";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { SettingsHubCard } from "@/components/shared/SettingsHubCard";
import { QuickActionTile } from "@/components/shared/QuickActionTile";
import { Badge } from "@/components/ui/badge";

interface SettingsSummary {
  providers: number;
  integrations: number;
  team_members: number;
  audit_entries: number;
  keys_configured: number;
  guardrails: number;
  active_channels: number;
}

interface NotificationPrefsShape {
  email_digest_enabled?: boolean;
  slack_enabled?: boolean;
  pagerduty_enabled?: boolean;
  splunk_enabled?: boolean;
  teams_enabled?: boolean;
}

export default function SettingsOverviewPage() {
  const [loaded, setLoaded] = useState(false);
  const [summary, setSummary] = useState<SettingsSummary>({
    providers: 0,
    integrations: 0,
    team_members: 0,
    audit_entries: 0,
    keys_configured: 0,
    guardrails: 0,
    active_channels: 0,
  });

  useEffect(() => {
    Promise.all([
      fetchFromBackend<{ providers?: unknown[] }>("/api/v1/providers", { silent: true }),
      fetchFromBackend<{ total?: number }>("/api/v1/alerts/integrations", { silent: true }),
      fetchFromBackend<{ members?: unknown[] }>("/api/v1/settings/team", { silent: true }),
      // limit=1 + total gives the real event count without pulling the whole log.
      fetchFromBackend<{ total?: number }>("/api/v1/settings/audit-log?limit=1", { silent: true }),
      fetchFromBackend<{ summary?: { total_configured: number; guardrails_configured: number } }>(
        "/api/v1/config/keys",
        { silent: true }
      ),
      fetchFromBackend<{ preferences?: NotificationPrefsShape }>("/api/v1/settings/notifications", { silent: true }),
    ]).then(([providers, integrations, team, audit, keys, notifications]) => {
      const prefs = notifications?.preferences;
      const activeChannels = prefs
        ? [
            prefs.email_digest_enabled,
            prefs.slack_enabled,
            prefs.pagerduty_enabled,
            prefs.splunk_enabled,
            prefs.teams_enabled,
          ].filter(Boolean).length
        : 0;
      setSummary({
        providers: Array.isArray(providers?.providers) ? providers.providers.length : 0,
        integrations: integrations?.total ?? 0,
        team_members: Array.isArray(team?.members) ? team.members.length : 0,
        audit_entries: audit?.total ?? 0,
        keys_configured: keys?.summary?.total_configured ?? 0,
        guardrails: keys?.summary?.guardrails_configured ?? 0,
        active_channels: activeChannels,
      });
      setLoaded(true);
    });
  }, []);

  const cards = [
    {
      title: "Integrations",
      description: "Connect apps and alert channels.",
      href: "/settings/integrations",
      icon: Cable,
      stats: [
        { label: "Providers", value: summary.providers },
        { label: "Alert channels", value: summary.integrations },
      ],
    },
    {
      title: "AI Providers",
      description: "Model keys ARTSA uses when it needs to call a model.",
      href: "/admin/providers",
      icon: Cpu,
      stats: [{ label: "Registered", value: summary.providers }],
    },
    {
      title: "API Keys",
      description: "Keys for your app to send activity to ARTSA.",
      href: "/get-started",
      icon: KeyRound,
      stats: [{ label: "Keys configured", value: summary.keys_configured }],
    },
    {
      title: "Team & Access",
      description: "People, roles, and who can do what.",
      href: "/settings/team",
      icon: Users,
      stats: [{ label: "Members", value: summary.team_members }],
    },
  ];

  return (
    <PageStack>
      <PageHeader
        title="Settings"
        description="Integrations, providers, keys, and who can access ARTSA."
        icon={<Settings2 className="h-5 w-5" />}
        actions={
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="interactive-pill font-mono">
              {loaded ? summary.keys_configured : "…"} keys
            </Badge>
            <Badge variant="secondary" className="interactive-pill font-mono">
              {loaded ? summary.guardrails : "…"} guardrails
            </Badge>
          </div>
        }
      />

      <ReadinessSnapshotPanel />

      {loaded ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <SettingsHubCard
              key={card.href}
              title={card.title}
              description={card.description}
              href={card.href}
              icon={card.icon}
              stats={card.stats}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-2xl border border-border/70 bg-muted/60" />
          ))}
        </div>
      )}

      <DashboardCard
        title="Quick Actions"
        description="Common configuration tasks"
        badge={<Shield className="h-4 w-4 text-muted-foreground" />}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <QuickActionTile
            href="/settings/integrations"
            title="Integrations"
            description="Connect apps and alerts"
            icon={Cable}
          />
          <QuickActionTile
            href="/admin/providers"
            title="AI Providers"
            description="Add a model key"
            icon={Cpu}
          />
          <QuickActionTile
            href="/get-started"
            title="API Keys"
            description="Create a key for your app"
            icon={KeyRound}
          />
          <QuickActionTile
            href="/settings/team"
            title="Team & Access"
            description="Invite people and set roles"
            icon={Users}
          />
        </div>
      </DashboardCard>
    </PageStack>
  );
}
