import { describe, expect, it } from "vitest";
import {
  deriveActiveOperations,
  deriveSecurityPosture,
  normalizeTelemetryEvent,
} from "@/lib/commandCenterDomain";
import type { CommandGraphModel } from "@/lib/commandGraph";
import type { DashboardMetrics } from "@/lib/hooks/useDashboardMetrics";

const emptyGraph: CommandGraphModel = {
  nodes: [],
  edges: [],
  source: "idle",
  compromisedCount: 0,
  activeCount: 0,
  maxRisk: 0,
  totalEvents: 0,
};

const baseMetrics: DashboardMetrics = {
  severity_counts: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 1 },
  defense_layers: {},
  defense_score: 80,
  risk_trend: [],
  avg_risk_score: 10,
  max_risk_score: 20,
  active_sessions: 1,
  event_rate: 1,
  total_events: 4,
};

describe("commandCenterDomain", () => {
  it("fail-closes when API is offline", () => {
    const p = deriveSecurityPosture({
      apiOnline: false,
      wsConnected: false,
      metrics: baseMetrics,
      metricsLoading: false,
      graph: emptyGraph,
      findings: [],
      campaigns: [],
    });
    expect(p.status).toBe("offline");
    expect(p.dataReliable).toBe(false);
  });

  it("marks incident on critical findings", () => {
    const p = deriveSecurityPosture({
      apiOnline: true,
      wsConnected: true,
      metrics: {
        ...baseMetrics,
        severity_counts: { CRITICAL: 1, HIGH: 0, MEDIUM: 0, LOW: 0 },
      },
      metricsLoading: false,
      graph: emptyGraph,
      findings: [
        {
          id: "f1",
          title: "exfil",
          severity: "CRITICAL",
          category: "data",
          asi_code: null,
          asi_label: null,
          status: "open",
          source: "agent",
          timestamp: new Date().toISOString(),
        },
      ],
      campaigns: [],
    });
    expect(p.status).toBe("incident");
    expect(p.label).toBe("INCIDENT");
  });

  it("maps campaigns into active operations without inventing them", () => {
    expect(deriveActiveOperations([])).toHaveLength(0);
    const ops = deriveActiveOperations([
      {
        id: "c1",
        name: "Prompt Injection",
        status: "running",
        provider: "openai",
        model: "gpt",
        rounds_completed: 7,
        total_rounds: 10,
        summary: { findings: 2, blocked: 5, target: "support" },
      },
    ]);
    expect(ops).toHaveLength(1);
    expect(ops[0]?.progressPct).toBe(70);
  });

  it("normalizes telemetry into SOC event schema", () => {
    const e = normalizeTelemetryEvent({
      event_id: "e1",
      tool_name: "list_orders",
      agent_id: "support",
      session_id: "s1",
      risk_score: 12,
      verdict: "ALLOW",
      triggered_at: new Date().toISOString(),
    });
    expect(e.type).toBe("tool_call");
    expect(e.result).toBe("allowed");
  });
});
