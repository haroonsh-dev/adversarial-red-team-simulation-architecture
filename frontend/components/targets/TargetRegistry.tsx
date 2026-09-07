"use client";

import { useState } from "react";
import Link from "next/link";
import { Crosshair, Loader2, Radar, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthRole } from "@/lib/hooks/useAuthRole";
import { useTargets } from "@/lib/hooks/useTargets";
import { useProviders } from "@/lib/hooks/useProviders";
import {
  CAPABILITY_LABELS,
  DISCOVERY_STATE_COPY,
  TARGET_KINDS,
  discoveryState,
  kindLabel,
  presentCapabilities,
  surfaceCoverage,
  type CapabilityId,
  type Target,
  type TargetDraft,
  type TargetKind,
} from "@/lib/targets";
import { cn } from "@/lib/utils";

const EMPTY_DRAFT: TargetDraft = {
  name: "",
  kind: "agent",
  version: "v1",
  provider: "",
  model: "",
  authorized: false,
};

const STATE_TONE: Record<string, string> = {
  unauthorized: "text-muted-foreground",
  undiscovered: "text-muted-foreground",
  unreachable: "text-[hsl(var(--severity-high))]",
  mapped: "text-[hsl(var(--severity-low))]",
};

export function TargetRegistry() {
  const { targets, loading, busyId, createTarget, updateTarget, deleteTarget, discover } =
    useTargets();
  const { providers } = useProviders();
  const { capabilities } = useAuthRole();
  const canManage = capabilities.can_manage_targets;

  const [draft, setDraft] = useState<TargetDraft>(EMPTY_DRAFT);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const canSave = draft.name.trim().length > 0 && draft.model.trim().length > 0;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    const created = await createTarget({ ...draft, name: draft.name.trim() });
    setSaving(false);
    if (created) {
      setDraft(EMPTY_DRAFT);
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted-foreground">
          {loading
            ? "Loading targets…"
            : `${targets.length} ${targets.length === 1 ? "target" : "targets"} registered`}
        </p>
        {canManage ? (
          <Button size="sm" onClick={() => setAdding((v) => !v)}>
            {adding ? "Cancel" : "Register target"}
          </Button>
        ) : null}
      </div>

      {adding && canManage ? (
        <div className="space-y-3 rounded-md border border-border bg-card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium">Name</span>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Customer support agent"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium">System type</span>
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as TargetKind })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-[13px]"
              >
                {TARGET_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium">Provider</span>
              <select
                value={draft.provider}
                onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-[13px]"
              >
                <option value="">Select a provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                    {p.configured ? "" : " (no key)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium">Model</span>
              <Input
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="gpt-4o-mini"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium">Version</span>
              <Input
                value={draft.version}
                onChange={(e) => setDraft({ ...draft, version: e.target.value })}
                placeholder="v1"
              />
              <span className="block text-[11px] text-muted-foreground">
                Regression compares runs across versions.
              </span>
            </label>
            <label className="space-y-1.5">
              <span className="text-[12px] font-medium">Base URL (optional)</span>
              <Input
                value={draft.base_url ?? ""}
                onChange={(e) => setDraft({ ...draft, base_url: e.target.value || null })}
                placeholder="https://api.example.com/v1"
              />
            </label>
          </div>

          <label className="space-y-1.5 block">
            <span className="text-[12px] font-medium">System prompt (optional)</span>
            <textarea
              value={draft.system_prompt ?? ""}
              onChange={(e) => setDraft({ ...draft, system_prompt: e.target.value || null })}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px]"
              placeholder="The instructions this system runs with, if you know them."
            />
          </label>

          <label className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 p-3">
            <input
              type="checkbox"
              checked={draft.authorized}
              onChange={(e) => setDraft({ ...draft, authorized: e.target.checked })}
              className="mt-0.5"
            />
            <span className="text-[12px]">
              <span className="font-medium">I am authorized to test this system.</span>
              <span className="mt-0.5 block text-muted-foreground">
                ARTSA sends live traffic during discovery and campaigns. Nothing is sent
                until this is checked.
              </span>
            </span>
          </label>

          <div className="flex justify-end">
            <Button size="sm" disabled={!canSave || saving} onClick={() => void submit()}>
              {saving ? "Saving…" : "Register"}
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : targets.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
          <p className="text-[13px] text-muted-foreground">
            No targets registered yet.
          </p>
          <p className="mx-auto mt-1 max-w-md text-[12px] text-muted-foreground">
            A target is the system you want tested. Registering it lets ARTSA compare
            results across versions instead of treating every run as new.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {targets.map((target) => (
            <TargetRow
              key={target.id}
              target={target}
              canManage={canManage}
              busy={busyId === target.id}
              expanded={expandedId === target.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === target.id ? null : target.id))
              }
              onAuthorize={() => void updateTarget(target.id, { authorized: true })}
              onDiscover={() => void discover(target.id)}
              onDelete={() => void deleteTarget(target.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function TargetRow({
  target,
  canManage,
  busy,
  expanded,
  onToggle,
  onAuthorize,
  onDiscover,
  onDelete,
}: {
  target: Target;
  canManage: boolean;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onAuthorize: () => void;
  onDiscover: () => void;
  onDelete: () => void;
}) {
  const state = discoveryState(target);
  const copy = DISCOVERY_STATE_COPY[state];
  const coverage = surfaceCoverage(target.surface);
  const present = presentCapabilities(target.surface);

  return (
    <li className="rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 p-3.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">{target.name}</span>
            <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {kindLabel(target.kind)}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {target.version}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {target.provider || "no provider"} · {target.model || "no model"}
          </p>
          <p className={cn("mt-1.5 text-[12px]", STATE_TONE[state])}>
            {copy.label}
            <span className="text-muted-foreground"> — {copy.hint}</span>
          </p>
        </button>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {state === "mapped" ? (
            <span className="font-mono text-[11px] text-muted-foreground">
              {coverage.open}/{coverage.total} categories
            </span>
          ) : null}
          {canManage ? (
            !target.authorized ? (
              <Button size="sm" variant="outline" disabled={busy} onClick={onAuthorize}>
                Authorize
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled={busy} onClick={onDiscover}>
                {busy ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    Probing…
                  </>
                ) : (
                  <>
                    <Radar className="h-3.5 w-3.5" aria-hidden />
                    {target.surface ? "Re-discover" : "Discover"}
                  </>
                )}
              </Button>
            )
          ) : null}
          {state === "mapped" ? (
            <Button size="sm" asChild>
              <Link href={`/red-team/campaigns/new?target=${encodeURIComponent(target.id)}`}>
                <Crosshair className="h-3.5 w-3.5" aria-hidden />
                Test
              </Link>
            </Button>
          ) : null}
          {canManage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onDelete}
              aria-label={`Remove ${target.name}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>

      {expanded ? (
        <div className="space-y-4 border-t border-border p-3.5">
          {!target.surface ? (
            <p className="text-[12px] text-muted-foreground">
              {target.authorized
                ? "Run discovery to map this target."
                : "Authorize this target, then run discovery."}
            </p>
          ) : !target.surface.reachable ? (
            <div>
              <p className="text-[12px] font-medium text-[hsl(var(--severity-high))]">
                Discovery could not reach this target
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                {target.surface.unreachable_reason}
              </p>
              <p className="mt-2 text-[12px] text-muted-foreground">
                Its attack surface is unknown, not empty.
              </p>
            </div>
          ) : (
            <>
              <section>
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Capabilities · {target.surface.probes_run} probes
                </h4>
                {present.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted-foreground">
                    No additional capabilities detected beyond text in, text out.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {present.map((cap) => (
                      <li
                        key={cap.id}
                        title={cap.evidence}
                        className="rounded-sm border border-border bg-muted/40 px-2 py-1 text-[11px]"
                      >
                        {CAPABILITY_LABELS[cap.id as CapabilityId] ?? cap.id}
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                          {Math.round(cap.confidence * 100)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {target.surface.reported_model ? (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    Self-reported model: {target.surface.reported_model}
                  </p>
                ) : null}
              </section>

              <section>
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Attack surface
                </h4>
                <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                  {target.surface.surface.map((item) => (
                    <li key={item.taxonomy_id} className="px-3 py-2">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-mono text-[11px] text-foreground">
                          {item.taxonomy_id}
                        </span>
                        <span className="text-[12px] font-medium">{item.title}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {item.rationale}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Trust boundaries
                </h4>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {target.surface.trust_boundaries.map((b) => (
                    <li
                      key={b}
                      className="rounded-sm border border-border px-2 py-1 font-mono text-[11px] text-muted-foreground"
                    >
                      {b}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}
