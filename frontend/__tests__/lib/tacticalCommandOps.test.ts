import { describe, expect, it } from "vitest";
import {
  deriveBlastRadius,
  deriveConfidenceDecoupling,
  deriveEmbeddingDrift,
  deriveGuardrailFriction,
  deriveTacticalPosture,
  eventHex,
  formatSocLog,
  iocFromRisk,
} from "@/lib/tacticalCommandOps";

const sample = [
  {
    event_id: "e1",
    agent_id: "red-agent-01",
    tool_name: "shell_exec",
    risk_score: 88,
    verdict: "BREACHED",
    triggered_at: new Date().toISOString(),
  },
  {
    event_id: "e2",
    agent_id: "judge-01",
    tool_name: "alignment_check",
    risk_score: 54,
    verdict: "SUSPICIOUS",
    triggered_at: new Date().toISOString(),
  },
  {
    event_id: "e3",
    agent_id: "defender-01",
    tool_name: "quarantine",
    risk_score: 12,
    verdict: "ALLOW",
    triggered_at: new Date().toISOString(),
  },
];

describe("tacticalCommandOps", () => {
  it("maps risk/verdict into IoC classes", () => {
    expect(iocFromRisk(88, "BREACHED")).toBe("breach");
    expect(iocFromRisk(54, "SUSPICIOUS")).toBe("anomaly");
    expect(iocFromRisk(12, "ALLOW")).toBe("nominal");
  });

  it("computes blast radius and privilege vectors on compromise", () => {
    const blast = deriveBlastRadius(sample);
    expect(blast.compromised).toBeGreaterThan(0);
    expect(blast.nodes.some((n) => n.escalate.includes("lateral_subnet") || n.escalate.includes("tool_priv"))).toBe(
      true
    );
    expect(blast.maxBlastMs).toBeGreaterThan(0);
  });

  it("builds four telemetry vectors from the same bus", () => {
    expect(deriveEmbeddingDrift(sample).length).toBeGreaterThan(0);
    expect(deriveGuardrailFriction(sample).some((c) => c.triggers > 0)).toBe(true);
    expect(deriveConfidenceDecoupling(sample).length).toBeGreaterThan(0);
  });

  it("formats SOC shell log lines with hex + actor + verdict", () => {
    const lines = formatSocLog(sample, 3);
    expect(lines[0]?.line).toMatch(/actor=/);
    expect(lines[0]?.line).toMatch(/verdict=/);
    expect(eventHex(sample[0]!).length).toBe(8);
  });

  it("derives breach posture when compromised nodes exist", () => {
    const blast = deriveBlastRadius(sample);
    const friction = deriveGuardrailFriction(sample);
    const posture = deriveTacticalPosture(blast, friction);
    expect(posture.ioc).toBe("breach");
  });
});
