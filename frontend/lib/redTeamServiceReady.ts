/** Service readiness for Red Team — real product gates, not demo chrome. */

export type ReadyCheckId = "service" | "provider" | "traffic" | "campaign";

export type ReadyCheck = {
  id: ReadyCheckId;
  label: string;
  ok: boolean;
  detail: string;
  href: string;
  cta: string;
};

export type ServiceReadyModel = {
  checks: ReadyCheck[];
  readyCount: number;
  total: number;
  /** True when service + provider are green (minimum to run real attacks). */
  canRun: boolean;
  /** True when canRun and at least one traffic or campaign signal exists. */
  shareReady: boolean;
  summary: string;
};

export function deriveRedTeamServiceReady(input: {
  apiOnline: boolean;
  providerCount: number;
  providersLoading?: boolean;
  liveEventCount: number;
  campaignCount: number;
}): ServiceReadyModel {
  const providersOk = input.providerCount > 0;
  const trafficOk = input.liveEventCount > 0;
  const campaignOk = input.campaignCount > 0;

  const checks: ReadyCheck[] = [
    {
      id: "service",
      label: "ARTSA service",
      ok: input.apiOnline,
      detail: input.apiOnline
        ? "API is reachable"
        : "Service offline — start the API before sharing access",
      href: "/get-started",
      cta: "Open Get Started",
    },
    {
      id: "provider",
      label: "Target provider",
      ok: providersOk,
      detail: input.providersLoading
        ? "Checking providers…"
        : providersOk
          ? `${input.providerCount} provider${input.providerCount === 1 ? "" : "s"} ready for real runs`
          : "Add a model provider — campaigns cannot start without one",
      href: "/settings/integrations",
      cta: "Add provider",
    },
    {
      id: "traffic",
      label: "Live traffic",
      ok: trafficOk,
      detail: trafficOk
        ? `${input.liveEventCount} live event${input.liveEventCount === 1 ? "" : "s"} seen`
        : "No agent traffic yet — run a check in Attack Lab or send traffic from a customer app",
      href: "/red-team/lab",
      cta: "Run a check",
    },
    {
      id: "campaign",
      label: "Campaign run",
      ok: campaignOk,
      detail: campaignOk
        ? `${input.campaignCount} campaign${input.campaignCount === 1 ? "" : "s"} on record`
        : "No campaign yet — start one to prove multi-round scoring",
      href: "/red-team/campaigns/new",
      cta: "Start campaign",
    },
  ];

  const readyCount = checks.filter((c) => c.ok).length;
  const canRun = input.apiOnline && providersOk;
  const shareReady = canRun && (trafficOk || campaignOk);

  let summary: string;
  if (shareReady) {
    summary = "Ready to share — service, target, and real traffic or campaigns are in place.";
  } else if (canRun) {
    summary = "You can run attacks now. Add a check or campaign before handing the API to a customer.";
  } else if (!input.apiOnline) {
    summary = "Service is offline. Bring the API up first.";
  } else {
    summary = "Add a target provider so lab and campaign runs hit a real model — not a dry UI.";
  }

  return {
    checks,
    readyCount,
    total: checks.length,
    canRun,
    shareReady,
    summary,
  };
}
