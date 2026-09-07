"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CoverageBar } from "@/components/red-team/CoverageBar";
import { useCampaigns } from "@/lib/hooks/useCampaigns";
import { useProviders } from "@/lib/hooks/useProviders";
import { deriveRedTeamOverview } from "@/lib/redTeamOverview";
import { cn } from "@/lib/utils";

/** Attack surface from live campaigns + configured providers — no demo layer grid. */
export default function AttackSurfacePage() {
  const { campaigns, loading: campaignsLoading } = useCampaigns();
  const { providers, loading: providersLoading } = useProviders();
  const overview = useMemo(() => deriveRedTeamOverview(campaigns), [campaigns]);

  const testedFamilies = overview.coverage.filter((c) => c.tested > 0);
  const loading = campaignsLoading || providersLoading;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[13px] text-muted-foreground">
          What you have tested from campaigns and connected providers — not a static map.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Family exposure (from campaigns)
        </h3>
        {loading && campaigns.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Loading campaigns…</p>
        ) : testedFamilies.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
            No family coverage yet.{" "}
            <Link href="/red-team/campaigns/new" className="underline-offset-2 hover:underline">
              Run a campaign
            </Link>{" "}
            to measure surface.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {overview.coverage.map((row) => (
              <div key={row.family} className="rounded-md border border-border px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-medium">{row.family}</span>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase",
                      row.tested === 0
                        ? "text-muted-foreground"
                        : row.success > 0
                          ? "text-[hsl(var(--severity-critical))]"
                          : "text-[hsl(var(--severity-low))]"
                    )}
                  >
                    {row.tested === 0
                      ? "untested"
                      : row.success > 0
                        ? `${row.success} breach`
                        : "held"}
                  </span>
                </div>
                <CoverageBar
                  label={`${row.tested} tested · ${row.pct}% defended`}
                  pct={row.tested === 0 ? 0 : row.pct}
                />
              </div>
            ))}
          </div>
        )}
        {overview.untested.length > 0 && testedFamilies.length > 0 ? (
          <p className="text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">Still untested: </span>
            {overview.untested.join(" · ")}
          </p>
        ) : null}
      </section>

      <section className="rounded-md border border-border p-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Configured targets (API)
        </h3>
        {providersLoading ? (
          <p className="mt-2 text-[13px] text-muted-foreground">Loading providers…</p>
        ) : providers.length === 0 ? (
          <p className="mt-2 text-[13px] text-muted-foreground">
            No providers configured.{" "}
            <Link href="/admin/providers" className="underline-offset-2 hover:underline">
              Add a provider
            </Link>
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {providers.map((p) => (
              <li key={p.id ?? p.name} className="flex justify-between py-2 text-[13px]">
                <span className="font-medium">{p.name || p.id}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {p.model || "—"} · {p.configured ? "ready" : "not configured"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
