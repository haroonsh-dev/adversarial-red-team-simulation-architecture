"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Cpu,
  Plus,
  Trash2,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Server,
} from "lucide-react";
import { fetchFromBackend, unwrapEnvelope, buildHeaders } from "@/lib/api";
import { PageHeader } from "@/components/shared/PageHeader";
import { DashboardCard } from "@/components/shared/DashboardCard";
import { PageStack } from "@/components/shared/PageStack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/stores/toast";

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

const FORM_INITIAL = {
  name: "",
  provider_type: "deepseek",
  api_key: "",
  base_url: "",
  default_model: "",
  enabled: true,
};

function extractDetail(body: unknown, fallback: string): string {
  const unwrapped = unwrapEnvelope(body);
  if (typeof unwrapped === "string" && unwrapped.trim()) return unwrapped;
  if (unwrapped && typeof unwrapped === "object") {
    const rec = unwrapped as Record<string, unknown>;
    const detail = rec.detail ?? rec.message;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (typeof rec.detail === "string" && rec.detail.trim()) return rec.detail;
  }
  return fallback;
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = useState<RegisteredProvider[]>([]);
  const [catalog, setCatalog] = useState<Record<string, CatalogMeta>>({});
  const [form, setForm] = useState(FORM_INITIAL);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail: string }>>({});
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const loadProviders = useCallback(() => {
    fetchFromBackend<{ providers?: RegisteredProvider[] }>("/api/v1/providers", { silent: true }).then(
      (d) => {
        if (d?.providers) setProviders(d.providers);
      }
    );
  }, []);

  useEffect(() => {
    loadProviders();
    fetchFromBackend<{ catalog?: Record<string, CatalogMeta> }>("/api/v1/providers/catalog", {
      silent: true,
    }).then((d) => {
      if (d?.catalog) setCatalog(d.catalog);
    });
  }, [loadProviders]);

  const selectedCatalog = catalog[form.provider_type];

  const onSave = async () => {
    if (!form.name.trim() || !form.api_key.trim()) {
      toast("Missing fields", { description: "Provider name and API key are required.", variant: "error" });
      return;
    }
    setSaving(true);
    setSaveNotice(null);
    const slug = form.name.trim();
    const wasUpdate = providers.some((p) => p.name === slug);
    const res = await fetchFromBackend<{ status?: string; provider?: RegisteredProvider }>(
      "/api/v1/providers",
      {
        method: "POST",
        body: JSON.stringify({
          name: slug,
          api_key: form.api_key,
          provider_type: form.provider_type,
          base_url: form.base_url.trim() || (selectedCatalog?.base_url ?? null),
          default_model: form.default_model.trim() || (selectedCatalog?.default_model ?? null),
          enabled: form.enabled,
        }),
        timeoutMs: 12_000,
      }
    );
    setSaving(false);
    if (res?.status === "ok") {
      const msg = wasUpdate
        ? `Updated “${slug}” — key stored encrypted. Click Test to verify the live API.`
        : `Added “${slug}” — key stored encrypted. Click Test to verify the live API.`;
      setSaveNotice(msg);
      toast(wasUpdate ? "Provider updated" : "Provider added", {
        description: `${slug} is ready. Use X-ARTSA-Provider: ${slug} on proxy calls.`,
        variant: "success",
      });
      setForm(FORM_INITIAL);
      loadProviders();
    }
  };

  const onDelete = async (name: string) => {
    const res = await fetchFromBackend<{ status?: string }>(`/api/v1/providers/${name}`, {
      method: "DELETE",
      silent: true,
      timeoutMs: 8_000,
    });
    if (res?.status === "ok") {
      toast("Provider removed", { description: name, variant: "success" });
      setTestResults((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      loadProviders();
    }
  };

  const onTest = async (name: string) => {
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
      const unwrapped = (unwrapEnvelope(body) ?? {}) as {
        status?: string;
        reply?: string;
        detail?: string;
        model?: string;
      };
      if (raw.ok && unwrapped?.status === "ok") {
        const reply = String(unwrapped.reply ?? "").slice(0, 80) || "(empty reply)";
        const detail = unwrapped.model
          ? `OK · ${unwrapped.model} · ${reply}`
          : `OK · ${reply}`;
        setTestResults((prev) => ({ ...prev, [name]: { ok: true, detail } }));
        toast("Provider test passed", { description: `${name} responded.`, variant: "success" });
      } else {
        const detail = extractDetail(
          body,
          "Test failed — the base URL is fine; check the API key and default model."
        );
        setTestResults((prev) => ({ ...prev, [name]: { ok: false, detail } }));
        toast("Provider test failed", { description: detail.slice(0, 160), variant: "error" });
      }
    } catch (err) {
      const detail =
        err instanceof Error && err.name === "TimeoutError"
          ? "Timed out waiting for the provider — key/model may be invalid or the API is slow."
          : "Network error — could not reach the backend.";
      setTestResults((prev) => ({ ...prev, [name]: { ok: false, detail } }));
      toast("Provider test failed", { description: detail, variant: "error" });
    } finally {
      setTesting(null);
    }
  };

  return (
    <PageStack>
      <PageHeader
        title="AI Providers"
        description="Add any AI provider key — stored encrypted, never shown in full, used only when ARTSA needs to call a model."
        icon={<Cpu className="h-5 w-5" />}
        actions={<Badge variant="outline" className="meta-badge">{providers.length} registered</Badge>}
      />

      <DashboardCard title="Add provider" description="Any provider type, any model, any OpenAI-compatible base URL.">
        {saveNotice ? (
          <div
            className="mb-4 flex items-start gap-2 rounded-[8px] border border-[hsl(var(--status-success-border))] bg-[hsl(var(--status-success-subtle))] px-3 py-2.5 text-sm text-foreground"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-status-success" aria-hidden />
            <div className="min-w-0">
              <p className="font-medium">{saveNotice}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Auto-filled base URL only sets the endpoint — Test still needs a valid key and model for that provider.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Name (slug, used as X-ARTSA-Provider)
            </label>
            <Input
              placeholder="e.g. my-groq"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Provider type</label>
            <select
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              value={form.provider_type}
              onChange={(e) => {
                const type = e.target.value;
                const meta = catalog[type];
                setForm({
                  ...form,
                  provider_type: type,
                  base_url: meta?.base_url ?? "",
                  default_model: meta?.default_model ?? "",
                });
              }}
            >
              {Object.entries(catalog).map(([key, meta]) => (
                <option key={key} value={key}>
                  {key} — {meta.description}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">API key</label>
            <Input
              type="password"
              placeholder="sk-..."
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Default model</label>
            <Input
              placeholder={selectedCatalog?.default_model ?? "any model"}
              value={form.default_model}
              onChange={(e) => setForm({ ...form, default_model: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Base URL (auto-filled from catalog — correct endpoint ≠ valid key)
            </label>
            <Input
              placeholder={selectedCatalog?.base_url ?? "https://api.example.com/v1"}
              value={form.base_url}
              onChange={(e) => setForm({ ...form, base_url: e.target.value })}
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            Enabled (visible to the proxy)
          </label>
          <Button onClick={() => void onSave()} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {providers.some((p) => p.name === form.name.trim()) ? "Update provider" : "Add provider"}
          </Button>
        </div>
      </DashboardCard>

      <DashboardCard
        title="Registered providers"
        description="Keys are stored encrypted and shown masked only. Test sends a live chat completion to the base URL."
      >
        {providers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No runtime providers yet. Add one above — DeepSeek and other env-configured keys are still
            available through their provider names.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Key</th>
                  <th className="pb-2 pr-4">Base URL</th>
                  <th className="pb-2 pr-4">Model</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const test = testResults[p.name];
                  return (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium">{p.name}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {p.provider_type}
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-xs text-muted-foreground">{p.api_key_masked}</td>
                      <td className="max-w-[220px] truncate py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                        {p.base_url ?? "default"}
                      </td>
                      <td className="max-w-[160px] truncate py-2.5 pr-4 font-mono text-xs text-muted-foreground">
                        {p.default_model ?? "any"}
                      </td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={p.enabled ? "success" : "secondary"} className="text-[10px]">
                          {p.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            onClick={() => void onTest(p.name)}
                            disabled={testing === p.name}
                          >
                            {testing === p.name ? (
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
                            onClick={() => void onDelete(p.name)}
                            aria-label={`Delete provider ${p.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        </div>
                        {test && (
                          <p
                            className={`mt-1 flex max-w-[280px] items-start justify-end gap-1 text-right text-[11px] ${
                              test.ok ? "text-status-success" : "text-destructive"
                            }`}
                          >
                            {test.ok ? (
                              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            ) : (
                              <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                            )}
                            <span className="break-words">{test.detail}</span>
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

      <DashboardCard
        title="All supported APIs"
        description="Pick a type above or register any custom OpenAI-compatible endpoint."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(catalog).map(([key, meta]) => (
            <div key={key} className="flex items-start gap-2.5 rounded-lg border border-border/60 p-3">
              <Server className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0">
                <p className="font-mono text-xs font-semibold">{key}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{meta.description}</p>
                <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground/70">
                  {meta.base_url ?? "custom"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>
    </PageStack>
  );
}
