"use client";

import { FeatureLinkCard } from "@/components/shared/FeatureLinkCard";
import { Crosshair, ScrollText, Bug, Network } from "lucide-react";
import { cn } from "@/lib/utils";

interface RedTeamQuickLinksProps {
  campaignId?: string | null;
  findingsCount?: number;
  className?: string;
}

/** workflow shortcuts from the console. */
export function RedTeamQuickLinks({ campaignId, findingsCount, className }: RedTeamQuickLinksProps) {
  const replayHref = campaignId
    ? `/replay?session=${encodeURIComponent(campaignId)}`
    : "/replay";

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      <FeatureLinkCard
        title="Attack Lab"
        description="Check a message before a full campaign"
        href="/red-team/lab"
        icon={Crosshair}
        badge="Fast"
      />
      <FeatureLinkCard
        title="Findings"
        description="Problems found from tests and live activity"
        href="/findings"
        icon={Bug}
        badge={findingsCount ? `${findingsCount} open` : undefined}
      />
      <FeatureLinkCard
        title="Sessions"
        description="Replay what an agent did"
        href={replayHref}
        icon={ScrollText}
      />
      <FeatureLinkCard
        title="AI Assets"
        description="Agents and how they pass work to each other"
        href="/pipeline"
        icon={Network}
      />
    </div>
  );
}
