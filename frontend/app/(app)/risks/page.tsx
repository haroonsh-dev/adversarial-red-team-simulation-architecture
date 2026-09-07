"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Search, Crosshair, ScrollText } from "lucide-react";
import {
  CATEGORY_LABELS,
  DEFENSE_LAYER_LABELS,
} from "@/lib/agenticRisks";
import type { AgenticRisk } from "@/lib/types";
import { useRiskFramework } from "@/lib/hooks/useRiskFramework";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageLoadingSkeleton } from "@/components/shared/PageSkeleton";
import { LiveIndicator } from "@/components/shared/LiveIndicator";
import { StatCard } from "@/components/shared/StatCard";
import { PageStack } from "@/components/shared/PageStack";
import { SeverityBadge } from "@/components/shared/SeverityBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SeverityFilter = "ALL" | AgenticRisk["severity"];

function SeverityChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "interactive-pill rounded-md border px-2.5 py-1 font-mono text-[11px] tabular-nums",
        active
          ? "border-foreground/25 bg-muted text-foreground shadow-sm"
          : "border-border bg-card text-muted-foreground hover:border-foreground/15 hover:text-foreground"
      )}
    >
      {label}
      <span className="ml-1.5 text-foreground/70">{count}</span>
    </button>
  );
}

function RiskListRow({
  risk,
  selected,
  onSelect,
}: {
  risk: AgenticRisk;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      data-selected={selected ? "true" : "false"}
      className={cn(
        "selection-list-item flex gap-3 px-4 py-3",
        selected && "border-l-foreground bg-muted/60"
      )}
    >
      <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {risk.rank}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{risk.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <SeverityBadge severity={risk.severity} />
          <span className="text-[12px] text-muted-foreground tabular-nums">
            {risk.live_events} seen · {risk.blocked_events} stopped
            {risk.breached_events > 0 && (
              <span className="text-severity-critical"> · {risk.breached_events} got through</span>
            )}
          </span>
        </div>
      </div>
    </button>
  );
}

function RiskDetail({ risk }: { risk: AgenticRisk }) {
  const categories = risk.attack_categories
    .map((c) => CATEGORY_LABELS[c] ?? c)
    .filter(Boolean);

  return (
    <div key={risk.id} className="flex h-full flex-col">
      <div className="border-b border-border px-5 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">#{risk.rank}</span>
          <SeverityBadge severity={risk.severity} />
        </div>
        <h2 className="mt-2 text-base font-semibold leading-snug sm:text-lg">{risk.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{risk.description}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-[12px] text-muted-foreground">Seen</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums">{risk.live_events}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">Stopped</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-status-success">
              {risk.blocked_events}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">Got through</dt>
            <dd
              className={cn(
                "mt-1 font-mono text-lg font-semibold tabular-nums",
                risk.breached_events > 0 ? "text-severity-critical" : "text-foreground"
              )}
            >
              {risk.breached_events}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted-foreground">Highest risk</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tabular-nums text-muted-foreground">
              {Number.isFinite(risk.max_risk_score) ? `${Math.round(risk.max_risk_score)}/100` : "—"}
            </dd>
          </div>
        </dl>

        <div className="mt-6 space-y-5">
          {categories.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-foreground">Kinds of attack</h3>
              <p className="mt-2 text-sm text-muted-foreground">{categories.join(", ")}</p>
            </div>
          ) : null}

          {risk.defense_layers.length > 0 ? (
            <div>
              <h3 className="text-sm font-medium text-foreground">How ARTSA stops it</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {risk.defense_layers.map((layer) => (
                  <li key={layer}>{DEFENSE_LAYER_LABELS[layer] ?? layer}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <h3 className="text-sm font-medium text-foreground">What to do</h3>
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              {risk.mitigations.map((m) => (
                <li key={m} className="leading-relaxed">{m}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border px-5 py-4 sm:px-6">
        <Button asChild size="sm">
          <Link href="/logs">
            <ScrollText className="h-3.5 w-3.5" aria-hidden />
            See matching activity
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href="/sandbox">
            <Crosshair className="h-3.5 w-3.5" aria-hidden />
            Try this attack
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function RiskFrameworkPage() {
  const { data, loading } = useRiskFramework();
  const { apiOnline, wsConnected } = useConnection();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const framework = data?.framework ?? [];

  const visible = useMemo(() => {
    return framework.filter((r) => {
      if (severity !== "ALL" && r.severity !== severity) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.attack_categories.some((c) => c.toLowerCase().includes(q))
      );
    });
  }, [framework, query, severity]);

  const selected = visible.find((r) => r.id === selectedId) ?? visible[0] ?? null;

  useEffect(() => {
    if (visible.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((r) => r.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  const selectByOffset = useCallback(
    (offset: number) => {
      if (visible.length === 0) return;
      const currentIndex = visible.findIndex((r) => r.id === (selectedId ?? visible[0]?.id));
      const nextIndex = Math.max(0, Math.min(visible.length - 1, currentIndex + offset));
      setSelectedId(visible[nextIndex].id);
    },
    [visible, selectedId]
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        selectByOffset(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        selectByOffset(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        setSelectedId(visible[0]?.id ?? null);
      } else if (event.key === "End") {
        event.preventDefault();
        setSelectedId(visible[visible.length - 1]?.id ?? null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectByOffset, visible]);

  useEffect(() => {
    if (!selectedId || !listRef.current) return;
    const active = listRef.current.querySelector('[aria-current="true"]');
    if (active instanceof HTMLElement) {
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedId]);

  const criticalCount = framework.filter((r) => r.severity === "CRITICAL").length;
  const highCount = framework.filter((r) => r.severity === "HIGH").length;
  const mediumCount = framework.filter((r) => r.severity === "MEDIUM").length;
  const lowCount = framework.filter((r) => r.severity === "LOW").length;
  const seen = framework.reduce((sum, r) => sum + r.live_events, 0);
  const stopped = framework.reduce((sum, r) => sum + r.blocked_events, 0);
  const slipped = framework.reduce((sum, r) => sum + r.breached_events, 0);
  const peak = framework.reduce((max, r) => Math.max(max, r.max_risk_score || 0), 0);

  return (
    <PageStack>
      <PageHeader
        title="Risk"
        description="The ten risks ARTSA watches, with live counts from what it has already checked."
        icon={<ShieldAlert className="h-5 w-5" />}
        badge={<LiveIndicator connected={apiOnline && wsConnected} className="meta-badge" />}
      />

      {loading ? (
        <PageLoadingSkeleton />
      ) : framework.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Risk framework unavailable"
          description="Could not load this list. Check that ARTSA is running."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Seen" value={data?.total_events ?? seen} variant="compact" />
            <StatCard label="Stopped" value={stopped} variant="compact" />
            <StatCard
              label="Got through"
              value={slipped}
              severity={slipped > 0 ? "CRITICAL" : undefined}
              variant="compact"
            />
            <StatCard
              label="Highest risk"
              value={peak > 0 ? `${Math.round(peak)}/100` : "—"}
              variant="compact"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-[13px] text-muted-foreground">Filter by severity</p>
            <SeverityChip
              label="All"
              count={framework.length}
              active={severity === "ALL"}
              onClick={() => setSeverity("ALL")}
            />
            <SeverityChip
              label="Critical"
              count={criticalCount}
              active={severity === "CRITICAL"}
              onClick={() => setSeverity("CRITICAL")}
            />
            <SeverityChip
              label="High"
              count={highCount}
              active={severity === "HIGH"}
              onClick={() => setSeverity("HIGH")}
            />
            <SeverityChip
              label="Medium"
              count={mediumCount}
              active={severity === "MEDIUM"}
              onClick={() => setSeverity("MEDIUM")}
            />
            <SeverityChip
              label="Low"
              count={lowCount}
              active={severity === "LOW"}
              onClick={() => setSeverity("LOW")}
            />
            {!apiOnline && (
              <Badge variant="outline" className="meta-badge">API offline</Badge>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(280px,320px)_1fr] lg:items-start">
            <div className="surface-panel overflow-hidden">
              <div className="space-y-3 border-b border-border p-3">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search risks"
                    aria-label="Search risks"
                    className="pl-9"
                  />
                </div>
                <p className="text-[12px] text-muted-foreground">
                  {visible.length} of {framework.length} shown
                </p>
              </div>

              {visible.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-muted-foreground">No matches.</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => {
                      setQuery("");
                      setSeverity("ALL");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div
                  ref={listRef}
                  className="max-h-[min(560px,65vh)] overflow-y-auto scroll-smooth"
                  role="listbox"
                  aria-label="Risks"
                >
                  {visible.map((risk) => (
                    <RiskListRow
                      key={risk.id}
                      risk={risk}
                      selected={selected?.id === risk.id}
                      onSelect={() => setSelectedId(risk.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="surface-panel min-h-[420px] overflow-hidden lg:min-h-[560px]">
              {selected ? (
                <RiskDetail risk={selected} />
              ) : (
                <EmptyState
                  icon={ShieldAlert}
                  title="No risk selected"
                  description="Select a risk from the list."
                  className="min-h-[420px] border-0 bg-transparent shadow-none lg:min-h-[560px]"
                />
              )}
            </div>
          </div>
        </>
      )}
    </PageStack>
  );
}
