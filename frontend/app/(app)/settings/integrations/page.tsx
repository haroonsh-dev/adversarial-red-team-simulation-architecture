"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Cable,
  Plus,
  Trash2,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
  BellRing,
  ChevronLeft,
  Cpu,
  ArrowRight,
} from "lucide-react";
import { fetchFromBackend, unwrapEnvelope, buildHeaders } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/stores/toast";
import { DATA_SOURCE_UI, INTEGRATION_UI, COMMAND_CENTER_UI, INTEGRATION_HEALTH_UI } from "@/lib/getStartedLabels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IntegrationHealthPanel } from "@/components/dashboard/IntegrationHealthPanel";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { useIntegrationStatus } from "@/lib/hooks/useIntegrationStatus";
import { useDashboardMetrics } from "@/lib/hooks/useDashboardMetrics";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RegisteredProvider {
  id: string;
  name: string;
  provider_type: string;
  api_key_masked: string;
  base_url: string | null;
  default_model: string | null;
  enabled: boolean;
  created_at: string | null;
}

interface CatalogMeta {
  base_url?: string | null;
  description?: string;
  default_model?: string | null;
}

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

// ---------------------------------------------------------------------------
// Integration Wizard
// ---------------------------------------------------------------------------

type WizardStep = "select" | "provider" | "alert" | "done";

function IntegrationWizard({
  catalog,
  channels,
  onProviderAdded,
  onAlertAdded,
}: {
  catalog: Record<string, CatalogMeta>;
  channels: Channel[];
  onProviderAdded: () => void;
  onAlertAdded: () => void;
}) {
  const [step, setStep] = useState<WizardStep>("select");
  const [wizardType, setWizardType] = useState<"provider" | "alert" | null>(null);

  // Provider form
  const [provForm, setProvForm] = useState({
    name: "",
    provider_type: "deepseek",
    api_key: "",
    base_url: "",
    default_model: "",
    enabled: true,
  });
  const [provSaving, setProvSaving] = useState(false);

  // Alert form
  const [alertChannel, setAlertChannel] = useState("WEBHOOK");
  const [alertUrl, setAlertUrl] = useState("");
  const [alertThreshold, setAlertThreshold] = useState("70");
  const [alertSaving, setAlertSaving] = useState(false);

  const selectedCatalog = catalog[provForm.provider_type];

  const saveProvider = async () => {
    if (!provForm.name.trim() || !provForm.api_key.trim()) {
      toast("Missing fields", { description: "Provider name and API key are required.", variant: "error" });
      return;
    }
    setProvSaving(true);
    const res = await fetchFromBackend<{ status?: string }>("/api/v1/providers", {
      method: "POST",
      body: JSON.stringify({
        name: provForm.name,
        api_key: provForm.api_key,
        provider_type: provForm.provider_type,
        base_url: provForm.base_url.trim() || (selectedCatalog?.base_url ?? null),
        default_model: provForm.default_model.trim() || (selectedCatalog?.default_model ?? null),
        enabled: provForm.enabled,
      }),
    });
    setProvSaving(false);
    if (res?.status === "ok") {
      toast("Provider added", { description: `${provForm.name} is ready.` });
      setProvForm({ name: "", provider_type: "deepseek", api_key: "", base_url: "", default_model: "", enabled: true });
      onProviderAdded();
      setStep("done");
    }
  };

  const saveAlert = async () => {
    if (!alertUrl.trim()) {
      toast("Missing URL", { description: "Enter the endpoint URL.", variant: "error" });
      return;
    }
    setAlertSaving(true);
    // Preserve a legitimate 0 ("alert on everything") instead of coercing it to the 70 default.
    const parsedThreshold = Number(alertThreshold);
    const riskThreshold =
      alertThreshold.trim() === "" || !Number.isFinite(parsedThreshold)
        ? 70
        : Math.max(0, Math.min(100, parsedThreshold));
    const res = await fetchFromBackend<{ status?: string }>("/api/v1/alerts/integrations", {
      method: "POST",
      body: JSON.stringify({
        channel: alertChannel,
        target_url: alertUrl.trim(),
        risk_threshold: riskThreshold,
        enabled: true,
      }),
    });
    setAlertSaving(false);
    if (res?.status === "configured") {
      toast("Integration configured", { description: `${alertChannel} → ${alertUrl}` });
      setAlertUrl("");
      onAlertAdded();
      setStep("done");
    }
  };

  const reset = () => {
    setStep("select");
    setWizardType(null);
  };

  if (step === "select") {
    return (
      <DashboardCard title="Add Integration" description="Choose what you want to connect." badge={<Cable className="h-4 w-4 text-muted-foreground" />}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => { setWizardType("provider"); setStep("provider"); }}
            className="flex flex-col items-start gap-3 rounded-xl border border-border p-5 text-left transition-all hover:border-border hover:bg-muted/40"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <Cpu className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">LLM Provider</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Connect OpenAI, Anthropic, Groq, DeepSeek, or any OpenAI-compatible API.
              </p>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400/90">
                {DATA_SOURCE_UI.llmProviderWizardNote}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
              Configure <ArrowRight className="h-3 w-3" />
            </span>
          </button>
          <button
            onClick={() => { setWizardType("alert"); setStep("alert"); }}
            className="flex flex-col items-start gap-3 rounded-xl border border-border p-5 text-left transition-all hover:border-border hover:bg-muted/40"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-foreground">
              <BellRing className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Alert Channel</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Route alerts to Slack, PagerDuty, Splunk, webhooks, or Datadog.
              </p>
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400/90">
                {DATA_SOURCE_UI.alertWizardNote}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
              Configure <ArrowRight className="h-3 w-3" />
            </span>
          </button>
        </div>
      </DashboardCard>
    );
  }

  if (step === "provider") {
    return (
      <DashboardCard
        title="Connect LLM Provider"
        description={`Step 1 of 2 — Enter your API credentials for ${provForm.provider_type}`}
        badge={
          <Button variant="ghost" size="sm" className="text-xs" onClick={reset}>
            Cancel
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Provider name (slug)</label>
            <Input placeholder="e.g. my-openai" value={provForm.name} onChange={(e) => setProvForm({ ...provForm, name: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Provider type</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={provForm.provider_type}
              onChange={(e) => {
                const t = e.target.value;
                const meta = catalog[t];
                setProvForm({ ...provForm, provider_type: t, base_url: meta?.base_url ?? "", default_model: meta?.default_model ?? "" });
              }}
            >
              {Object.entries(catalog).map(([k, m]) => (
                <option key={k} value={k}>{k} — {m.description}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">API key</label>
            <Input type="password" placeholder="sk-..." value={provForm.api_key} onChange={(e) => setProvForm({ ...provForm, api_key: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Default model</label>
            <Input placeholder={selectedCatalog?.default_model ?? "any model"} value={provForm.default_model} onChange={(e) => setProvForm({ ...provForm, default_model: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Base URL (custom endpoint)</label>
            <Input placeholder={selectedCatalog?.base_url ?? "https://api.example.com/v1"} value={provForm.base_url} onChange={(e) => setProvForm({ ...provForm, base_url: e.target.value })} />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={provForm.enabled} onChange={(e) => setProvForm({ ...provForm, enabled: e.target.checked })} className="h-4 w-4 rounded border-border" />
            Enabled
          </label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setStep("select")}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={saveProvider} disabled={provSaving} className="gap-2">
              {provSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add provider
            </Button>
          </div>
        </div>
      </DashboardCard>
    );
  }

  if (step === "alert") {
    return (
      <DashboardCard
        title="Configure Alert Channel"
        description="Step 1 of 2 — Enter the webhook URL and risk threshold."
        badge={
          <Button variant="ghost" size="sm" className="text-xs" onClick={reset}>
            Cancel
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Channel</label>
            <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" value={alertChannel} onChange={(e) => setAlertChannel(e.target.value)}>
              {channels.map((c) => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Target URL</label>
            <Input placeholder="https://hooks.slack.com/..." value={alertUrl} onChange={(e) => setAlertUrl(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Risk threshold</label>
            <Input type="number" min={0} max={100} value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep("select")}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button onClick={saveAlert} disabled={alertSaving} className="gap-2">
            {alertSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Configure integration
          </Button>
        </div>
      </DashboardCard>
    );
  }

  if (step === "done") {
    return (
      <DashboardCard title="Integration Added" badge={<CheckCircle2 className="h-5 w-5 text-status-success" />}>
        <p className="text-sm text-muted-foreground">
          Your {wizardType === "provider" ? "LLM provider" : "alert channel"} has been configured successfully.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            Add another
          </Button>
        </div>
      </DashboardCard>
    );
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function IntegrationsPage() {
  const { apiOnline, wsConnected } = useConnection();
  const { liveEvents } = useDashboardMetrics();
  const { status: integrationStatus, outboundConnected, outboundCount } = useIntegrationStatus(apiOnline);
  const [providers, setProviders] = useState<RegisteredProvider[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogMeta>>({});
  const [channels, setChannels] = useState<Channel[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string }>>({});

  const loadAll = useCallback(() => {
    fetchFromBackend<{ providers?: RegisteredProvider[] }>("/api/v1/providers", { silent: true }).then((d) => {
      if (d?.providers) setProviders(d.providers);
    });
    fetchFromBackend<{ catalog?: Record<string, CatalogMeta> }>("/api/v1/providers/catalog", { silent: true }).then((d) => {
      if (d?.catalog) setCatalog(d.catalog);
    });
    fetchFromBackend<{ integrations?: Integration[] }>("/api/v1/alerts/integrations", { silent: true }).then((d) => {
      if (d?.integrations) setIntegrations(d.integrations);
    });
    fetchFromBackend<{ channels?: Channel[] }>("/api/v1/alerts/channels", { silent: true }).then((d) => {
      if (d?.channels) setChannels(d.channels);
    });
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onDeleteProvider = async (name: string) => {
    const res = await fetchFromBackend<{ status?: string }>(`/api/v1/providers/${name}`, { method: "DELETE", silent: true });
    if (res?.status === "ok") { toast("Provider removed", { description: name }); loadAll(); }
  };

  const onTestProvider = async (name: string) => {
    setTesting(name);
    setTestResults((prev) => ({
      ...prev,
      [name]: { ok: true, detail: "Calling provider… (may take a few seconds)" },
    }));
    try {
      const raw = await fetch(`/api/backend/api/v1/providers/${encodeURIComponent(name)}/test`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(40_000),
      });
      const body = await raw.json().catch(() => ({}));
      const unwrapped = (unwrapEnvelope(body) ?? {}) as { status?: string; reply?: string; detail?: string };
      if (raw.ok && unwrapped?.status === "ok") {
        setTestResults((prev) => ({
          ...prev,
          [name]: { ok: true, detail: `replied: ${String(unwrapped.reply).slice(0, 80)}` },
        }));
        toast("Provider test passed", { description: name, variant: "success" });
      } else {
        const detail =
          (typeof unwrapped?.detail === "string" && unwrapped.detail) ||
          (body && typeof body === "object" && typeof (body as { detail?: string }).detail === "string"
            ? (body as { detail: string }).detail
            : null) ||
          "Test failed — check the API key and default model (base URL is usually fine).";
        setTestResults((prev) => ({ ...prev, [name]: { ok: false, detail } }));
        toast("Provider test failed", { description: detail.slice(0, 160), variant: "error" });
      }
    } catch {
      setTestResults((prev) => ({
        ...prev,
        [name]: { ok: false, detail: "network error — could not reach the backend" },
      }));
    } finally {
      setTesting(null);
    }
  };

  const onDeleteIntegration = async (id: string) => {
    const res = await fetchFromBackend<{ status?: string }>(`/api/v1/alerts/integrations/${id}`, { method: "DELETE", silent: true });
    if (res?.status === "deleted") { toast("Integration removed", { description: id }); loadAll(); }
  };

  const onTestIntegration = async (id: string) => {
    setTesting(id);
    try {
      const raw = await fetch(`/api/backend/api/v1/alerts/integrations/${id}/test`, { method: "POST" });
      const body = await raw.json().catch(() => ({}));
      const unwrapped = (unwrapEnvelope(body) ?? {}) as { status?: string; detail?: string };
      if (raw.ok && unwrapped?.status === "sent") {
        setTestResults((prev) => ({ ...prev, [id]: { ok: true, detail: COMMAND_CENTER_UI.sampleAlertDispatched } }));
      } else {
        setTestResults((prev) => ({ ...prev, [id]: { ok: false, detail: `failed: ${unwrapped?.detail || raw.status}` } }));
      }
    } catch {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, detail: "network error — could not reach the backend" } }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrations"
        description="Connect agents for live screening. Alert channels notify your team — they don't show traffic here."
        icon={<Cable className="h-5 w-5" />}
        actions={
          <div className="flex gap-2">
            <Badge variant="info">{providers.length} providers</Badge>
            <Badge variant="warning">{integrations.length} alert channels</Badge>
          </div>
        }
      />

      <IntegrationHealthPanel
        apiOnline={apiOnline}
        wsConnected={wsConnected}
        ingestKeyConfigured={integrationStatus.ingestKeyConfigured}
        outboundConnected={outboundConnected}
        outboundCount={outboundCount}
        hasInboundEvents={liveEvents.length > 0}
        compact
      />

      <Tabs defaultValue="inbound" className="space-y-6">
        <TabsList>
          <TabsTrigger value="inbound">{INTEGRATION_UI.inboundTab}</TabsTrigger>
          <TabsTrigger value="outbound">{INTEGRATION_UI.outboundTab}</TabsTrigger>
        </TabsList>

        <TabsContent value="inbound" className="space-y-6 mt-0">
          <div className="rounded-lg border border-border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
            {COMMAND_CENTER_UI.inboundDetail} Use{" "}
            <Link href="/get-started" className="font-medium text-foreground underline">
              API Keys
            </Link>{" "}
            to create an ARTSA key and send a test event, then watch{" "}
            <Link href="/command-center" className="font-medium text-foreground underline">
              Command Center
            </Link>.
          </div>

      {/* ----- Integration Wizard ----- */}
      <IntegrationWizard
        catalog={catalog}
        channels={channels}
        onProviderAdded={loadAll}
        onAlertAdded={loadAll}
      />

      {/* ----- Providers Table ----- */}
      <DashboardCard title="LLM Providers" description="Keys are encrypted at rest. Test connectivity after adding." badge={<Cpu className="h-4 w-4 text-muted-foreground" />}>
        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runtime providers yet. Use the wizard above to add one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Key</th>
                  <th className="pb-2 pr-4">Model</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const t = testResults[p.name];
                  return (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium">{p.name}</td>
                      <td className="py-2.5 pr-4"><Badge variant="secondary" className="font-mono text-[10px]">{p.provider_type}</Badge></td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{p.api_key_masked}</td>
                      <td className="max-w-[160px] truncate py-2.5 pr-4 font-mono text-xs text-muted-foreground">{p.default_model ?? "any"}</td>
                      <td className="py-2.5 pr-4"><Badge variant={p.enabled ? "success" : "secondary"} className="text-[10px]">{p.enabled ? "Enabled" : "Disabled"}</Badge></td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onTestProvider(p.name)} disabled={testing === p.name}>
                            {testing === p.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                            {INTEGRATION_UI.testProvider}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => onDeleteProvider(p.name)} aria-label={`Delete provider ${p.name}`}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                        {t && (
                          <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${t.ok ? "text-status-success" : "text-destructive"}`}>
                            {t.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {t.detail}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      {/* ----- Supported APIs ----- */}
      <DashboardCard title="Supported API Catalog" description="All provider types available. Custom endpoints always supported." badge={<Server className="h-4 w-4 text-muted-foreground" />}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(catalog).map(([key, meta]) => (
            <div key={key} className="flex items-start gap-2.5 rounded-lg border border-border/60 p-3">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold">{key}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">{meta.base_url ?? "custom"}</p>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
        </TabsContent>

        <TabsContent value="outbound" className="space-y-6 mt-0">
          <div className="rounded-lg border border-border bg-muted/15 px-4 py-3 text-sm text-muted-foreground">
            {INTEGRATION_HEALTH_UI.outboundReminder}{" "}
            <Link href="/settings/integrations/custom" className="font-medium text-foreground underline">
              Custom outbound connectors
            </Link>
          </div>

      {/* ----- Alert Integrations Table ----- */}
      <DashboardCard title="Alert Channels" description="SIEM/SOAR integrations with risk-based routing thresholds." badge={<BellRing className="h-4 w-4 text-muted-foreground" />}>
        {integrations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alert integrations. Use the wizard above, or set env values in .env.</p>
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
                {integrations.map((it) => {
                  const t = testResults[it.id];
                  return (
                    <tr key={it.id} className="border-b border-border/50">
                      <td className="py-2.5 pr-4"><Badge variant="secondary" className="gap-1 font-mono text-[10px]"><Cable className="h-3 w-3" />{it.label}</Badge></td>
                      <td className="max-w-[260px] truncate py-2.5 pr-4 font-mono text-xs text-muted-foreground">{it.target_url || "env-configured"}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{it.risk_threshold}</td>
                      <td className="py-2.5 pr-4 text-xs capitalize text-muted-foreground">{it.source}</td>
                      <td className="py-2.5 pr-4"><Badge variant={it.enabled ? "success" : "secondary"} className="text-[10px]">{it.enabled ? "Enabled" : "Disabled"}</Badge></td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => onTestIntegration(it.id)} disabled={testing === it.id}>
                            {testing === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-3.5 w-3.5" />}
                            {INTEGRATION_UI.sendSampleToUrl}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={() => onDeleteIntegration(it.id)} disabled={it.source === "environment"} aria-label={`Delete ${it.label} integration`}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                        {t && (
                          <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${t.ok ? "text-status-success" : "text-destructive"}`}>
                            {t.ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {t.detail}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
