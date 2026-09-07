import { describe, expect, it } from "vitest";
import {
  buildOrbit,
  nodeRadiusAndRisk,
  orbitStats,
  selectOrbitCampaigns,
} from "@/lib/campaignOrbit";
import type { CampaignListItem } from "@/lib/hooks/useCampaigns";

function camp(partial: Partial<CampaignListItem> & { id: string; status: string }): CampaignListItem {
  return {
    name: partial.name ?? `C-${partial.id}`,
    provider: "ollama",
    model: "llama3.2",
    rounds_completed: 0,
    total_rounds: 10,
    summary: null,
    ...partial,
  } as CampaignListItem;
}

describe("campaignOrbit live field", () => {
  it("live mode prefers running and does not dump all failures", () => {
    const campaigns = [
      camp({ id: "r1", status: "RUNNING", rounds_completed: 3 }),
      ...Array.from({ length: 12 }, (_, i) =>
        camp({ id: `f${i}`, status: "FAILED", name: `Lab · fail ${i}` })
      ),
      camp({ id: "d1", status: "COMPLETED", summary: { risk_score: 40 } as never }),
    ];
    const field = selectOrbitCampaigns(campaigns, "live");
    expect(field.some((c) => c.id === "r1")).toBe(true);
    expect(field.length).toBeLessThan(campaigns.length);
    expect(field.filter((c) => c.status === "FAILED").length).toBeLessThanOrEqual(6);
  });

  it("live node radius grows with round progress", () => {
    const early = nodeRadiusAndRisk(
      camp({ id: "a", status: "RUNNING", rounds_completed: 1, total_rounds: 10 }),
      "running"
    );
    const late = nodeRadiusAndRisk(
      camp({ id: "b", status: "RUNNING", rounds_completed: 9, total_rounds: 10 }),
      "running"
    );
    expect(late.radiusPct).toBeGreaterThan(early.radiusPct);
  });

  it("does not invent risk for failed without summary", () => {
    const nodes = buildOrbit([camp({ id: "f", status: "FAILED" })]);
    expect(nodes[0].risk).toBeNull();
    expect(nodes[0].riskKnown).toBe(false);
  });

  it("idle stats say field idle; live stats report progress", () => {
    const idle = orbitStats(buildOrbit([camp({ id: "f", status: "FAILED" })]), 1, "live");
    expect(idle.live).toBe(0);
    expect(idle.finding.toLowerCase()).toContain("idle");

    const liveNodes = buildOrbit([
      camp({ id: "r", status: "RUNNING", rounds_completed: 5, total_rounds: 10 }),
    ]);
    const live = orbitStats(liveNodes, 1, "live");
    expect(live.live).toBe(1);
    expect(live.liveProgress).toBe(50);
  });
});
