"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Play, X } from "lucide-react";
import { useProviders } from "@/lib/hooks/useProviders";
import { useCampaignRun } from "@/lib/hooks/useCampaignRun";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { ATTACK_PROFILES, CATEGORY_LABELS } from "@/lib/redTeamProfiles";
import { asiCodesForProfileCategories } from "@/lib/asiCategories";
import { lensForCategory } from "@/lib/assessmentResults";

function buildCampaignLabel(name: string, focus: string): string {
  const n = name.trim();
  const f = focus.trim();
  if (n) return n;
  if (f) return f.slice(0, 80);
  return "";
}

interface RedTeamScanWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTargetId?: string | null;
  initialCategory?: string | null;
}

/** Modal wizard — arm target + depth + start. Navigates to live engagement on launch. */
export function RedTeamScanWizard({
  open,
  onOpenChange,
  initialTargetId,
  initialCategory,
}: RedTeamScanWizardProps) {
  const router = useRouter();
  const { providers, loading: providersLoading } = useProviders();
  const { isRunning, campaignId, launch } = useCampaignRun();

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [modelName, setModelName] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [focusObjective, setFocusObjective] = useState("");
  const [attackProfile, setAttackProfile] = useState("quick_scan");
  const [rounds, setRounds] = useState(5);
  const [baseUrl, setBaseUrl] = useState("");
  const [useLlmJudge, setUseLlmJudge] = useState(false);

  const provider = providers.find((p) => p.id === selectedProvider);
  const profileMeta = ATTACK_PROFILES.find((p) => p.id === attackProfile) ?? ATTACK_PROFILES[0];
  const canLaunch = Boolean(selectedProvider && attackProfile && rounds >= 1 && !isRunning);
  const profileAsi = asiCodesForProfileCategories([...profileMeta.categories]);

  const lenses = useMemo(() => {
    const set = new Set(profileMeta.categories.map((c) => lensForCategory(c)));
    return Array.from(set);
  }, [profileMeta.categories]);

  useEffect(() => {
    if (!open) return;
    if (initialTargetId && providers.some((p) => p.id === initialTargetId)) {
      setSelectedProvider(initialTargetId);
      const found = providers.find((p) => p.id === initialTargetId);
      if (found) setModelName(found.model);
    }
    if (initialCategory && ["DEX", "MSE"].includes(initialCategory.toUpperCase())) {
      setAttackProfile("comprehensive");
    }
  }, [open, initialTargetId, initialCategory, providers]);

  useEffect(() => {
    if (provider && !modelName) setModelName(provider.model);
  }, [provider, modelName]);

  useEffect(() => {
    if (isRunning && campaignId) {
      onOpenChange(false);
      router.push(`/red-team/monitor/${campaignId}`);
    }
  }, [isRunning, campaignId, router, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isRunning) onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isRunning, onOpenChange]);

  const handleLaunch = useCallback(() => {
    if (!selectedProvider || isRunning) return;
    void launch({
      provider: selectedProvider,
      modelName,
      attackProfile,
      rounds,
      baseUrl,
      useLlmJudge,
      campaignName: buildCampaignLabel(campaignName, focusObjective),
    });
  }, [
    selectedProvider,
    isRunning,
    launch,
    modelName,
    attackProfile,
    rounds,
    baseUrl,
    useLlmJudge,
    campaignName,
    focusObjective,
  ]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Close"
        disabled={isRunning}
        onClick={() => !isRunning && onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-wizard-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-border bg-background sm:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p id="scan-wizard-title" className="text-sm font-semibold text-foreground">
              New scan
            </p>
            <p className="font-mono text-[10px] text-muted-foreground">
              Target · depth · start engagement
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            disabled={isRunning}
            onClick={() => onOpenChange(false)}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-5 overflow-y-auto p-4 sm:p-5">
          <section className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#67b3ef]">
              1 · Target
            </p>
            {providersLoading ? (
              <Skeleton className="h-20 w-full rounded-[8px]" />
            ) : providers.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No providers.{" "}
                <Link href="/red-team/surface" className="text-[#67b3ef] hover:underline">
                  Add a target
                </Link>
              </p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto">
                {providers.map((p) => {
                  const active = selectedProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!p.configured}
                      onClick={() => {
                        setSelectedProvider(p.id);
                        setModelName(p.model);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-[8px] border px-3 py-2 text-left",
                        active
                          ? "border-primary/45 bg-primary/10"
                          : "border-border bg-muted hover:border-border",
                        !p.configured && "opacity-50"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-foreground">{p.name}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">{p.model}</p>
                      </div>
                      <Badge
                        variant={p.configured ? "success" : "secondary"}
                        className="meta-badge shrink-0"
                      >
                        {p.configured ? "Ready" : "No key"}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
            {provider?.type === "local" || selectedProvider === "custom" ? (
              <Input
                placeholder="Base URL"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="h-9 font-mono text-[12px]"
              />
            ) : null}
          </section>

          <section className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#67b3ef]">
              2 · Attack depth
            </p>
            <div className="grid gap-2">
              {ATTACK_PROFILES.map((profile) => {
                const Icon = profile.icon;
                const active = attackProfile === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setAttackProfile(profile.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-[8px] border px-3 py-2.5 text-left",
                      active
                        ? "border-primary/45 bg-primary/10"
                        : "border-border bg-muted hover:border-border"
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#67b3ef]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-medium text-foreground">{profile.label}</span>
                        {profile.depthBadge ? (
                          <Badge variant="outline" className="meta-badge">
                            {profile.depthBadge}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{profile.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1">
              {lenses.map((L) => (
                <Badge key={L} variant="secondary" className="meta-badge">
                  {L}
                </Badge>
              ))}
              {profileMeta.categories.map((c) => (
                <Badge key={c} variant="outline" className="meta-badge font-mono">
                  {c}
                </Badge>
              ))}
            </div>
            {profileAsi.length > 0 && (
              <p className="font-mono text-[10px] text-muted-foreground">
                ASI: {profileAsi.map((a) => a.code).join(" · ")}
              </p>
            )}
            {/* silence unused CATEGORY_LABELS warning via intentional use */}
            <span className="sr-only">
              {profileMeta.categories.map((c) => CATEGORY_LABELS[c]).join(" ")}
            </span>
          </section>

          <section className="space-y-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#67b3ef]">
              3 · Session
            </p>
            <Input
              placeholder="Scan label (optional)"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
            <textarea
              className="min-h-[64px] w-full rounded-md border border-input bg-background px-3 py-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Focus objective (optional)"
              value={focusObjective}
              onChange={(e) => setFocusObjective(e.target.value)}
            />
            <div className="flex items-center justify-between gap-3">
              <label className="text-[12px] text-muted-foreground">
                Rounds
                <Input
                  type="number"
                  min={1}
                  max={50}
                  className="mt-1 h-9 w-24"
                  value={rounds}
                  onChange={(e) => setRounds(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
              <label className="flex items-center gap-2 text-[12px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={useLlmJudge}
                  onChange={(e) => setUseLlmJudge(e.target.checked)}
                />
                LLM judge
              </label>
            </div>
          </section>
        </div>

        <div className="border-t border-border p-4">
          <Button
            size="lg"
            className="w-full gap-2"
            disabled={!canLaunch}
            onClick={handleLaunch}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Engaging…
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Start red team
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
