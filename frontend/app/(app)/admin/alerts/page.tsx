"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Plus, Trash2, FlaskConical, Loader2, Cable, CheckCircle2, XCircle } from "lucide-react";
import { fetchFromBackend, unwrapEnvelope } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { PageStack } from "@/components/shared/PageStack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/stores/toast";

interface Integration {
  id: string;
  channel: string;
  label: string;
  target_url: string;
  risk_threshold: number;
  enabled: boolean;
  source: string;
}

interface Channel {
  code: string;
  label: string;
  env_configured: boolean;
}

export default function AdminAlertsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channel, setChannel] = useState("WEBHOOK");
  const [targetUrl, setTargetUrl] = useState("");
  const [threshold, setThreshold] = useState("70");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetchFromBackend<{ integrations?: Integration[] }>("/api/v1/alerts/integrations", { silent: true }).then(
      (d) => {
        if (d?.integrations) setIntegrations(d.integrations);
      }
    );
    fetchFromBackend<{ channels?: Channel[] }>("/api/v1/alerts/channels", { silent: true }).then((d) => {
      if (d?.channels) setChannels(d.channels);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async () => {
    if (!targetUrl.trim()) {
      toast("Missing target URL", { description: "Enter the endpoint URL for this channel.", variant: "error" });
      return;
    }
    setSaving(true);
    // Preserve a legitimate 0 ("alert on everything") instead of coercing it to the 70 default.
    const parsedThreshold = Number(threshold);
    const riskThreshold =
      threshold.trim() === "" || !Number.isFinite(parsedThreshold)
        ? 70
        : Math.max(0, Math.min(100, parsedThreshold));
    const res = await fetchFromBackend<{ status?: string }>("/api/v1/alerts/integrations", {
      method: "POST",
      body: JSON.stringify({
        channel,
        target_url: targetUrl.trim(),
        risk_threshold: riskThreshold,
        enabled: true,
      }),
    });
    setSaving(false);
    if (res?.status === "configured") {
      toast("Integration configured", { description: `${channel} → ${targetUrl}` });
      setTargetUrl("");
      load();
    }
  };

  const onDelete = async (id: string) => {
    const res = await fetchFromBackend<{ status?: string }>(`/api/v1/alerts/integrations/${id}`, {
      method: "DELETE",
      silent: true,
    });
    if (res?.status === "deleted") {
      toast("Integration removed", { description: id });
      load();
    }
  };

  const onTest = async (id: string) => {
    setTesting(id);
    setTestResults((prev) => ({ ...prev, [id]: "dispatching test alert..." }));
    try {
      const raw = await fetch(`/api/backend/api/v1/alerts/integrations/${id}/test`, { method: "POST" });
      const body = await raw.json().catch(() => ({}));
      const unwrapped = (unwrapEnvelope(body) ?? {}) as { status?: string; detail?: string };
      if (raw.ok && unwrapped?.status === "sent") {
        setTestResults((prev) => ({ ...prev, [id]: "test alert dispatched successfully" }));
      } else {
        setTestResults((prev) => ({ ...prev, [id]: `failed: ${unwrapped?.detail || raw.status}` }));
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: "failed: network error" }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <PageStack>
      <PageHeader
        title="Alerts"
        description="Send alerts to Slack, email, or your own URL when risk is above a threshold."
        icon={<BellRing className="h-5 w-5" />}
        actions={<Badge variant="outline" className="meta-badge">{integrations.length} integrations</Badge>}
      />

      <DashboardCard title="Add integration" description="Alerts above the risk threshold are dispatched to this channel.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              {channels.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Target URL</label>
            <Input
              placeholder="https://hooks.slack.com/... or https://your-siem.example.com/webhook"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Risk threshold</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-4">
          <Button onClick={onCreate} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            Configure integration
          </Button>
        </div>
      </DashboardCard>

      <DashboardCard title="Configured integrations" description="Channels with env-based configuration are read-only here.">
        {integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No integrations configured. Add one above, or set env values (e.g. SLACK_WEBHOOK_URL) in .env.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Channel</th>
                  <th className="pb-2 pr-4">Target</th>
                  <th className="pb-2 pr-4">Threshold</th>
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {integrations.map((it) => (
                  <tr key={it.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-4">
                      <Badge variant="secondary" className="gap-1 font-mono text-[10px]">
                        <Cable className="h-3 w-3" aria-hidden />
                        {it.label}
                      </Badge>
                    </td>
                    <td className="max-w-[260px] truncate py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                      {it.target_url || "env-configured"}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs">{it.risk_threshold}</td>
                    <td className="py-2.5 pr-4 text-xs capitalize text-muted-foreground">{it.source}</td>
                    <td className="py-2.5 pr-4">
                      <Badge variant={it.enabled ? "success" : "secondary"} className="text-[10px]">
                        {it.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => onTest(it.id)}
                          disabled={testing === it.id}
                        >
                          {testing === it.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : (
                            <FlaskConical className="h-3.5 w-3.5" aria-hidden />
                          )}
                          Test
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                          onClick={() => onDelete(it.id)}
                          disabled={it.source === "environment"}
                          aria-label={`Delete ${it.label} integration`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                      {testResults[it.id] && (
                        <p
                          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
                            testResults[it.id].startsWith("failed") ? "text-destructive" : "text-status-success"
                          }`}
                        >
                          {testResults[it.id].startsWith("failed") ? (
                            <XCircle className="h-3 w-3" aria-hidden />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" aria-hidden />
                          )}
                          {testResults[it.id]}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
    </PageStack>
  );
}
