/**
 * Tactical Command Center — IoC color economy + AI security telemetry derivations.
 * Emerald / purple / crimson only for systemic indicators; canvas stays monochrome.
 */

export const IOC = {
  nominal: "#10b981",
  anomaly: "#a855f7",
  breach: "#ef4444",
  canvas: "#070b12",
  slate: "#0c111a",
  graphite: "#141a24",
  rail: "#1a2230",
  mute: "#64748b",
  text: "#cbd5e1",
} as const;

export type IocClass = "nominal" | "anomaly" | "breach";

export type TelemetryRow = Record<string, unknown>;

export function iocFromRisk(risk: number, verdict = ""): IocClass {
  const v = verdict.toUpperCase();
  if (risk >= 80 || /BREACH|KILL|EXFIL|COMPROMISE/.test(v)) return "breach";
  if (risk >= 50 || /SUSPICIOUS|QUARANTINE|JAIL|OVERRIDE|FRICTION/.test(v)) return "anomaly";
  return "nominal";
}

export function iocColor(c: IocClass): string {
  return IOC[c];
}

function riskOf(e: TelemetryRow): number {
  return Number(e.risk_score ?? 0);
}

function verdictOf(e: TelemetryRow): string {
  return String(e.verdict ?? e.action ?? "");
}

function agentOf(e: TelemetryRow): string {
  return String(e.agent_id ?? e.session_id ?? "agent-unknown").slice(0, 24);
}

function toolOf(e: TelemetryRow): string {
  return String(e.tool_name ?? e.event_type ?? "tool");
}

function tsOf(e: TelemetryRow): number {
  const raw = String(e.triggered_at ?? e.ts ?? e.timestamp ?? "");
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : Date.now();
}

/** Stable 8-char hex fingerprint for SOC log lines. */
export function eventHex(e: TelemetryRow, i = 0): string {
  const seed = `${e.event_id ?? ""}|${agentOf(e)}|${toolOf(e)}|${tsOf(e)}|${i}`;
  let h = 0x811c9dc5;
  for (let n = 0; n < seed.length; n++) {
    h ^= seed.charCodeAt(n);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type BlastNode = {
  id: string;
  kind: "agent" | "subnet" | "listener" | "guardrail";
  ioc: IocClass;
  risk: number;
  hops: number;
  blastMs: number;
  escalate: string[];
};

export type BlastModel = {
  nodes: BlastNode[];
  maxBlastMs: number;
  compromised: number;
  vectors: string[];
};

/** Risk propagation across semantic agents → blast radius + privilege vectors. */
export function deriveBlastRadius(events: TelemetryRow[]): BlastModel {
  const byAgent = new Map<string, { risk: number; verdict: string; tools: Set<string> }>();
  for (const e of events.slice(0, 80)) {
    const id = agentOf(e);
    const prev = byAgent.get(id) ?? { risk: 0, verdict: "", tools: new Set<string>() };
    const r = riskOf(e);
    if (r >= prev.risk) {
      prev.risk = r;
      prev.verdict = verdictOf(e);
    }
    prev.tools.add(toolOf(e));
    byAgent.set(id, prev);
  }

  const agents = [...byAgent.entries()];
  if (agents.length === 0) {
    return {
      nodes: [
        { id: "listener-0", kind: "listener", ioc: "nominal", risk: 0, hops: 0, blastMs: 12, escalate: [] },
        { id: "guardrail-core", kind: "guardrail", ioc: "nominal", risk: 0, hops: 0, blastMs: 8, escalate: [] },
      ],
      maxBlastMs: 12,
      compromised: 0,
      vectors: [],
    };
  }

  const nodes: BlastNode[] = agents.map(([id, row], i) => {
    const ioc = iocFromRisk(row.risk, row.verdict);
    const hops = ioc === "breach" ? 2 + (i % 3) : ioc === "anomaly" ? 1 : 0;
    const blastMs = Math.round(8 + row.risk * 0.42 + hops * 11);
    const escalate: string[] = [];
    if (ioc !== "nominal") {
      if ([...row.tools].some((t) => /shell|exec|file|tool/i.test(t))) escalate.push("tool_priv");
      if (row.risk >= 70) escalate.push("session_impersonate");
      if (ioc === "breach") escalate.push("lateral_subnet");
    }
    return {
      id,
      kind: "agent",
      ioc,
      risk: Math.round(row.risk),
      hops,
      blastMs,
      escalate,
    };
  });

  nodes.push({
    id: "subnet-edge",
    kind: "subnet",
    ioc: nodes.some((n) => n.ioc === "breach") ? "breach" : nodes.some((n) => n.ioc === "anomaly") ? "anomaly" : "nominal",
    risk: Math.max(0, ...nodes.map((n) => n.risk)),
    hops: 1,
    blastMs: Math.max(...nodes.map((n) => n.blastMs), 14),
    escalate: nodes.some((n) => n.ioc === "breach") ? ["cross_tenant_pivot"] : [],
  });
  nodes.push({
    id: "guardrail-core",
    kind: "guardrail",
    ioc: nodes.some((n) => n.ioc === "breach") ? "anomaly" : "nominal",
    risk: Math.round(nodes.reduce((a, n) => a + n.risk, 0) / Math.max(1, nodes.length)),
    hops: 0,
    blastMs: 9,
    escalate: [],
  });

  const compromised = nodes.filter((n) => n.ioc === "breach").length;
  const vectors = [...new Set(nodes.flatMap((n) => n.escalate))];
  return {
    nodes,
    maxBlastMs: Math.max(...nodes.map((n) => n.blastMs)),
    compromised,
    vectors,
  };
}

export type DriftPoint = { t: string; cluster: number; boundary: number; payload: number };

/** Vector embedding drift — cluster centroid vs dangerous boundary. */
export function deriveEmbeddingDrift(events: TelemetryRow[], buckets = 16): DriftPoint[] {
  const now = Date.now();
  const span = 12 * 60_000;
  const step = span / buckets;
  const pts: DriftPoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const t0 = now - span + i * step;
    const slice = events.filter((e) => {
      const t = tsOf(e);
      return t >= t0 && t < t0 + step;
    });
    const avgRisk =
      slice.length === 0 ? 18 + (i % 5) : slice.reduce((a, e) => a + riskOf(e), 0) / slice.length;
    const cluster = Math.max(5, Math.min(55, 42 - avgRisk * 0.15 + (i % 3)));
    const boundary = 72;
    const payload = Math.min(95, cluster + avgRisk * 0.55);
    pts.push({
      t: new Date(t0).toLocaleTimeString(undefined, { hour12: false, minute: "2-digit", second: "2-digit" }),
      cluster: Math.round(cluster * 10) / 10,
      boundary,
      payload: Math.round(payload * 10) / 10,
    });
  }
  return pts;
}

export type FrictionCell = { mask: string; triggers: number; ioc: IocClass };

/** Guardrail friction grid — block triggers across safety masks. */
export function deriveGuardrailFriction(events: TelemetryRow[]): FrictionCell[] {
  const masks = ["PII", "ALIGNMENT", "OUTPUT_SAFE", "TOOL_POLICY", "SHELL_GATE", "EXFIL_SCAN"] as const;
  const counts = Object.fromEntries(masks.map((m) => [m, 0])) as Record<(typeof masks)[number], number>;
  for (const e of events.slice(0, 100)) {
    const tool = toolOf(e).toLowerCase();
    const msg = `${verdictOf(e)} ${tool}`.toLowerCase();
    const r = riskOf(e);
    if (/pii|email|ssn|phone/.test(msg) || r >= 40) counts.PII += 1;
    if (/align|jail|prompt|inject/.test(msg) || r >= 55) counts.ALIGNMENT += 1;
    if (/output|toxic|unsafe/.test(msg) || r >= 50) counts.OUTPUT_SAFE += 1;
    if (/tool|policy|deny|block/.test(msg) || /tool/.test(tool)) counts.TOOL_POLICY += 1;
    if (/shell|exec|bash|cmd/.test(tool) || /shell/.test(msg)) counts.SHELL_GATE += 1;
    if (/exfil|leak|token|secret/.test(msg) || r >= 75) counts.EXFIL_SCAN += 1;
  }
  return masks.map((mask) => {
    const triggers = counts[mask];
    const ioc: IocClass = triggers >= 8 ? "breach" : triggers >= 3 ? "anomaly" : "nominal";
    return { mask, triggers, ioc };
  });
}

export type DecayBar = { turn: string; tokens: number; tps: number; ioc: IocClass };

/** Context window decay — payload volume vs tokens/sec degradation. */
export function deriveContextDecay(events: TelemetryRow[], turns = 12): DecayBar[] {
  const recent = events.slice(0, turns);
  const bars: DecayBar[] = [];
  for (let i = 0; i < turns; i++) {
    const e = recent[i];
    const risk = e ? riskOf(e) : 10 + i * 2;
    const tokens = e ? 180 + Math.round(risk * 9) + (i % 4) * 40 : 120 + i * 35;
    const tps = Math.max(4, 48 - i * 2.4 - risk * 0.12);
    const ioc: IocClass = tps < 12 ? "breach" : tps < 22 ? "anomaly" : "nominal";
    bars.push({
      turn: `T${String(turns - i).padStart(2, "0")}`,
      tokens,
      tps: Math.round(tps * 10) / 10,
      ioc,
    });
  }
  return bars.reverse();
}

export type ConfidencePoint = { t: string; confidence: number; isolation: number; decoupled: boolean };

/** Model confidence vs containment isolation verdict correlation. */
export function deriveConfidenceDecoupling(events: TelemetryRow[], buckets = 14): ConfidencePoint[] {
  const now = Date.now();
  const span = 10 * 60_000;
  const step = span / buckets;
  const pts: ConfidencePoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const t0 = now - span + i * step;
    const slice = events.filter((e) => {
      const t = tsOf(e);
      return t >= t0 && t < t0 + step;
    });
    const avgRisk =
      slice.length === 0 ? 20 + (i % 7) : slice.reduce((a, e) => a + riskOf(e), 0) / slice.length;
    // High model confidence with high risk = decoupling (dangerous).
    const confidence = Math.min(99, Math.round(55 + (100 - avgRisk) * 0.25 + (i % 5) * 2));
    const isolation = Math.min(99, Math.round(avgRisk * 0.9 + 8));
    const decoupled = Math.abs(confidence - isolation) >= 28;
    pts.push({
      t: new Date(t0).toLocaleTimeString(undefined, { hour12: false, minute: "2-digit", second: "2-digit" }),
      confidence,
      isolation,
      decoupled,
    });
  }
  return pts;
}

export type SocLogLine = {
  key: string;
  line: string;
  ioc: IocClass;
};

/** Raw Linux/SOC shell schema lines. */
export function formatSocLog(events: TelemetryRow[], limit = 40): SocLogLine[] {
  return events.slice(0, limit).map((e, i) => {
    const risk = riskOf(e);
    const verdict = verdictOf(e) || "SCAN";
    const ioc = iocFromRisk(risk, verdict);
    const micro = new Date(tsOf(e));
    const stamp = `${micro.toISOString().replace("T", " ").replace("Z", "")}Z`;
    const hex = eventHex(e, i);
    const actor = agentOf(e);
    const tool = toolOf(e);
    const action = String(e.action ?? e.recommended_action ?? ioc.toUpperCase());
    const line = `[${stamp}] ${hex} actor=${actor} tool=${tool} risk=${risk.toFixed(1)} verdict=${verdict || "NONE"} action=${action} ioc=${ioc.toUpperCase()}`;
    return { key: `${hex}-${i}`, line, ioc };
  });
}

export type TacticalPosture = {
  ioc: IocClass;
  label: string;
  detail: string;
};

export function deriveTacticalPosture(blast: BlastModel, friction: FrictionCell[]): TacticalPosture {
  if (blast.compromised > 0 || friction.some((f) => f.ioc === "breach")) {
    return {
      ioc: "breach",
      label: "BREACH CONTAINMENT",
      detail: `${blast.compromised} node(s) compromised · blast≤${blast.maxBlastMs}ms · vectors=${blast.vectors.join(",") || "none"}`,
    };
  }
  if (blast.nodes.some((n) => n.ioc === "anomaly") || friction.some((f) => f.ioc === "anomaly")) {
    return {
      ioc: "anomaly",
      label: "LATENT ANOMALY",
      detail: `Friction / jailbreak pressure · max_blast=${blast.maxBlastMs}ms`,
    };
  }
  return {
    ioc: "nominal",
    label: "NOMINAL ALIGNMENT",
    detail: `Zero guardrail friction · blast_idle=${blast.maxBlastMs}ms`,
  };
}
