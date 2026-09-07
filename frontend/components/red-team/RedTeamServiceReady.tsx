"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useConnection } from "@/lib/context/ConnectionProvider";
import { useDashboardMetrics } from "@/lib/context/DashboardMetricsProvider";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { useProviders } from "@/lib/hooks/useProviders";
import { deriveRedTeamServiceReady } from "@/lib/redTeamServiceReady";
import { cn } from "@/lib/utils";

/** Real-product gate: service + provider + traffic/campaign — for sharing API access. */
export function RedTeamServiceReady({ className }: { className?: string }) {
  const { apiOnline } = useConnection();
  const { liveEvents } = useDashboardMetrics();
  const { campaigns } = useCampaigns();
  const { providers, loading: providersLoading } = useProviders();

  const ready = useMemo(
    () =>
      deriveRedTeamServiceReady({
        apiOnline,
        providerCount: providers.filter((p) => p.configured !== false).length || providers.length,
        providersLoading,
        liveEventCount: liveEvents.length,
        campaignCount: campaigns.length,
      }),
    [apiOnline, providers, providersLoading, liveEvents.length, campaigns.length]
  );

  return (
    <section
      className={cn(
        "rounded-md border p-4",
        ready.shareReady
          ? "border-[hsl(var(--severity-low-border))] bg-[hsl(var(--severity-low-subtle))]"
          : ready.canRun
            ? "border-[hsl(var(--severity-info-border))] bg-[hsl(var(--severity-info-subtle))]"
            : "border-[hsl(var(--severity-medium-border))] bg-[hsl(var(--severity-medium-subtle))]",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">Service readiness</p>
          <p className="mt-1 text-[14px] leading-relaxed text-foreground">{ready.summary}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {ready.readyCount}/{ready.total} checks ·{" "}
            {ready.shareReady ? "share-ready" : ready.canRun ? "run-ready" : "blocked"}
          </p>
        </div>
        {!ready.canRun ? (
          <Button size="sm" asChild>
            <Link href={ready.checks.find((c) => !c.ok)?.href ?? "/settings/integrations"}>
              {ready.checks.find((c) => !c.ok)?.cta ?? "Fix setup"}
            </Link>
          </Button>
        ) : !ready.shareReady ? (
          <Button size="sm" asChild>
            <Link href="/red-team/lab">Run a check</Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <Link href="/get-started">Get started</Link>
          </Button>
        )}
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {ready.checks.map((c) => (
          <li
            key={c.id}
            className={cn(
              "rounded-md border px-3 py-2.5",
              c.ok
                ? "border-[hsl(var(--severity-low-border))]/60 bg-card/70"
                : "border-border bg-card/50"
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  c.ok ? "bg-[hsl(var(--severity-low))]" : "bg-muted-foreground/40"
                )}
                aria-hidden
              />
              <p className="text-[12px] font-medium text-foreground">{c.label}</p>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{c.detail}</p>
            {!c.ok ? (
              <Link
                href={c.href}
                className="mt-2 inline-block text-[11px] text-primary underline-offset-2 hover:underline"
              >
                {c.cta}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
