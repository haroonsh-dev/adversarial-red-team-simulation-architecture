import { describe, expect, it } from "vitest";
import {
  computeDetectionRate,
  deriveDetectionSeries,
  deriveGraphModel,
  deriveMissionPosture,
  deriveVitals,
  filterEventsByWindow,
  mergeAgentStreams,
  recentActiveHops,
  telemetryToAgentEvents,
  type AgentEvent,
} from "@/lib/commandCenterOps";

const sample: AgentEvent[] = [
  {
    type: "message",
    timestamp: new Date().toISOString(),
    sourceAgent: "Red Team",
    targetAgent: "Target",
    severity: "info",
    message: "Red Team → Target: hop ack",
    hmacValid: true,
  },
  {
    type: "finding",
    timestamp: new Date().toISOString(),
    sourceAgent: "Defender",
    targetAgent: "Target",
    severity: "warning",
    asiTag: "ASI08",
    message: "Unauthorized tool call contained",
    hmacValid: true,
  },
  {
    type: "attack_start",
    timestamp: new Date().toISOString(),
    sourceAgent: "Red Team",
    targetAgent: "Target",
    status: "under_attack",
    severity: "critical",
    message: "Active attack path opened against Target",
  },
];

describe("commandCenterOps", () => {
  it("keeps recent events in the analysis window", () => {
    expect(filterEventsByWindow(sample, "15m")).toHaveLength(3);
  });

  it("builds six-agent graph with traffic links", () => {
    const g = deriveGraphModel(sample, "all", "all");
    expect(g.nodes.some((n) => n.id === "Red Team")).toBe(true);
    expect(g.links.length).toBeGreaterThan(0);
    expect(g.links.some((l) => l.hot)).toBe(true);
  });

  it("derives vitals from the same stream", () => {
    const v = deriveVitals(sample);
    expect(v.findingsToday).toBeGreaterThan(0);
    expect(v.detectionRate).toBeGreaterThan(0);
  });

  it("maps ingest telemetry into AgentEvent contract", () => {
    const mapped = telemetryToAgentEvents([
      {
        timestamp: new Date().toISOString(),
        agent_id: "red-team-1",
        tool_name: "user_prompt",
        risk_score: 88,
        verdict: "BREACHED",
      },
    ]);
    expect(mapped[0]?.severity).toBe("critical");
    expect(mapped[0]?.sourceAgent).toBe("Red Team");
    expect(mapped[0]?.hmacValid).toBeUndefined();
  });

  it("merges live ahead of mock without dupes", () => {
    const live = sample.slice(0, 1);
    const merged = mergeAgentStreams(live, sample, 10);
    expect(merged[0]?.message).toBe(live[0]!.message);
    expect(merged.length).toBeLessThanOrEqual(sample.length);
  });

  it("derives elevated/critical mission posture from pressure", () => {
    const elevated = deriveMissionPosture(sample);
    expect(["elevated", "critical"]).toContain(elevated.posture);
    expect(elevated.headline.length).toBeGreaterThan(10);

    const quiet = deriveMissionPosture([
      {
        type: "message",
        timestamp: new Date().toISOString(),
        sourceAgent: "Judge",
        targetAgent: "Curator",
        severity: "info",
        message: "quiet hop",
      },
    ]);
    expect(quiet.posture).toBe("nominal");
  });

  it("keeps Detection Rate vital and chart tip in lockstep", () => {
    const rate = computeDetectionRate(sample);
    const vitals = deriveVitals(sample);
    const series = deriveDetectionSeries(sample);
    expect(vitals.detectionRate).toBe(rate);
    expect(series[series.length - 1]?.artsa).toBe(rate);
  });

  it("flags recent hops for edge pulse", () => {
    const hops = recentActiveHops(sample, 10, 60_000);
    expect(hops.has("Red Team→Target")).toBe(true);
  });
});
