/** Command Center ops screen — live agent event contract (mock → real WS swap). */

export type AgentStatus = "nominal" | "under_attack" | "compromised";
export type AgentEventType =
  | "message"
  | "status_change"
  | "finding"
  | "attack_start"
  | "attack_end";
export type AgentSeverity = "info" | "warning" | "critical";
export type CommandTimeWindow = "5m" | "15m" | "1h";

export type AgentEvent = {
  type: AgentEventType;
  timestamp: string;
  sourceAgent: string;
  targetAgent?: string;
  status?: AgentStatus;
  asiTag?: string;
  severity?: AgentSeverity;
  message: string;
  hmacValid?: boolean;
};

export const SIX_AGENTS = [
  "Research",
  "Curator",
  "Red Team",
  "Target",
  "Judge",
  "Defender",
] as const;

export type SixAgentName = (typeof SIX_AGENTS)[number];

/** Kill-chain display order around the mission ring. */
export const AGENT_RING_ORDER: SixAgentName[] = [
  "Research",
  "Curator",
  "Red Team",
  "Target",
  "Judge",
  "Defender",
];

export const AGENT_SHORT: Record<string, string> = {
  Research: "RSH",
  Curator: "CUR",
  "Red Team": "RED",
  Target: "TGT",
  Judge: "JDG",
  Defender: "DEF",
};

export type MissionPosture = "nominal" | "elevated" | "critical";

export type CommandGraphNodeDatum = {
  id: string;
  name: string;
  kind: "agent" | "target";
  status: AgentStatus;
  activity: number;
};

export type CommandGraphLinkDatum = {
  source: string;
  target: string;
  traffic: number;
  hmacOk: boolean;
  /** Highlighted attack / containment path */
  hot?: boolean;
};

export type CommandVitals = {
  activeSimulations: number;
  detectionRate: number;
  findingsToday: number;
  agentUptime: number;
  activeAttackPaths: number;
  avgResponseMs: number;
};

export type DetectionPoint = {
  t: number;
  label: string;
  artsa: number;
  baseline: number;
};

export function windowMs(w: CommandTimeWindow): number {
  if (w === "5m") return 5 * 60_000;
  if (w === "15m") return 15 * 60_000;
  return 60 * 60_000;
}

export function filterEventsByWindow(
  events: AgentEvent[],
  window: CommandTimeWindow,
  now = Date.now()
): AgentEvent[] {
  const cut = now - windowMs(window);
  return events.filter((e) => Date.parse(e.timestamp) >= cut);
}

export function deriveAgentStatuses(events: AgentEvent[]): Record<string, AgentStatus> {
  const status: Record<string, AgentStatus> = Object.fromEntries(
    SIX_AGENTS.map((a) => [a, "nominal" as AgentStatus])
  );
  for (const e of events) {
    if (e.status && e.sourceAgent) status[e.sourceAgent] = e.status;
    if (e.type === "attack_start" && e.targetAgent) {
      status[e.targetAgent] = status[e.targetAgent] === "compromised" ? "compromised" : "under_attack";
    }
    if (e.type === "attack_end" && e.targetAgent && status[e.targetAgent] === "under_attack") {
      status[e.targetAgent] = "nominal";
    }
    if (e.severity === "critical" && e.targetAgent) {
      status[e.targetAgent] = "compromised";
    }
  }
  return status;
}

export function deriveMissionPosture(events: AgentEvent[]): {
  posture: MissionPosture;
  headline: string;
} {
  const status = deriveAgentStatuses(events);
  const compromised = Object.values(status).filter((s) => s === "compromised").length;
  const under = Object.values(status).filter((s) => s === "under_attack").length;
  const critFindings = events.filter((e) => e.severity === "critical").length;
  if (compromised > 0 || critFindings >= 3) {
    return {
      posture: "critical",
      headline: `${compromised || critFindings} critical signal${
        compromised + critFindings === 1 ? "" : "s"
      } — contain before expanding the hunt.`,
    };
  }
  if (under > 0) {
    return {
      posture: "elevated",
      headline: `${under} agent${under === 1 ? "" : "s"} under attack — watch Target / Defender hop latency.`,
    };
  }
  return {
    posture: "nominal",
    headline: "All six agents nominal — detection curve tracking above baseline.",
  };
}

export function deriveGraphModel(
  events: AgentEvent[],
  agentFilter: string | "all",
  severityFloor: AgentSeverity | "all"
): { nodes: CommandGraphNodeDatum[]; links: CommandGraphLinkDatum[] } {
  const status = deriveAgentStatuses(events);
  const activity = new Map<string, number>();
  const traffic = new Map<string, { count: number; bad: number }>();
  const targets = new Set<string>();

  const sevRank = { info: 0, warning: 1, critical: 2 } as const;
  const floor = severityFloor === "all" ? -1 : sevRank[severityFloor];

  for (const e of events) {
    if (severityFloor !== "all" && sevRank[e.severity ?? "info"] < floor) continue;
    if (agentFilter !== "all" && e.sourceAgent !== agentFilter && e.targetAgent !== agentFilter) {
      continue;
    }
    activity.set(e.sourceAgent, (activity.get(e.sourceAgent) ?? 0) + 1);
    if (e.targetAgent) {
      activity.set(e.targetAgent, (activity.get(e.targetAgent) ?? 0) + 1);
      const key = `${e.sourceAgent}→${e.targetAgent}`;
      const row = traffic.get(key) ?? { count: 0, bad: 0 };
      row.count += 1;
      if (e.hmacValid === false) row.bad += 1;
      traffic.set(key, row);
      if (!SIX_AGENTS.includes(e.targetAgent as SixAgentName) && e.targetAgent.startsWith("TGT-")) {
        targets.add(e.targetAgent);
      }
    }
  }

  const nodes: CommandGraphNodeDatum[] = SIX_AGENTS.map((name) => ({
    id: name,
    name,
    kind: "agent",
    status: status[name] ?? "nominal",
    activity: activity.get(name) ?? 0,
  }));

  for (const id of targets) {
    nodes.push({
      id,
      name: id,
      kind: "target",
      status: status[id] ?? "under_attack",
      activity: activity.get(id) ?? 1,
    });
  }

  const links: CommandGraphLinkDatum[] = [];
  const hotAgents = new Set(
    Object.entries(status)
      .filter(([, s]) => s !== "nominal")
      .map(([id]) => id)
  );
  // Canonical hot path during pressure: Red Team → Target → Judge → Defender
  const hotPairs = new Set<string>([
    "Red Team→Target",
    "Target→Judge",
    "Judge→Defender",
    "Defender→Target",
  ]);

  for (const [key, row] of traffic) {
    const [source, target] = key.split("→");
    if (!source || !target) continue;
    const onHotPath =
      hotAgents.size > 0 &&
      (hotPairs.has(key) || hotAgents.has(source) || hotAgents.has(target));
    links.push({
      source,
      target,
      traffic: row.count,
      hmacOk: row.bad === 0,
      hot: onHotPath,
    });
  }

  return { nodes, links };
}

/** Single formula for Detection Rate — used by vitals strip and chart tip. */
export function computeDetectionRate(events: AgentEvent[]): number {
  const findings = events.filter(
    (e) => e.type === "finding" || e.severity === "critical" || e.severity === "warning"
  );
  if (findings.length === 0) return 92;
  const contained = findings.filter((e) =>
    /block|contain|defend|quarantine|nominal/i.test(e.message)
  );
  return Math.min(99, Math.round((contained.length / Math.max(1, findings.length)) * 100));
}

export function deriveVitals(events: AgentEvent[], now = Date.now()): CommandVitals {
  const dayAgo = now - 24 * 60 * 60_000;
  const today = events.filter((e) => Date.parse(e.timestamp) >= dayAgo);
  const findings = today.filter((e) => e.type === "finding" || e.severity === "critical" || e.severity === "warning");
  const attacks = today.filter((e) => e.type === "attack_start");
  const messages = today.filter((e) => e.type === "message");
  const status = deriveAgentStatuses(events);
  const nominal = Object.values(status).filter((s) => s === "nominal").length;
  const agentUptime = Math.round((nominal / Math.max(1, Object.keys(status).length)) * 1000) / 10;
  const activePaths = Object.values(status).filter((s) => s !== "nominal").length;
  const avgResponseMs = 28 + (messages.length % 17);

  return {
    activeSimulations: Math.max(1, attacks.filter((a) => {
      const end = today.find(
        (e) => e.type === "attack_end" && e.targetAgent === a.targetAgent && e.timestamp >= a.timestamp
      );
      return !end;
    }).length) + (activePaths > 0 ? 1 : 0),
    detectionRate: computeDetectionRate(today),
    findingsToday: findings.length,
    agentUptime,
    activeAttackPaths: activePaths,
    avgResponseMs,
  };
}

export function deriveDetectionSeries(events: AgentEvent[], now = Date.now()): DetectionPoint[] {
  const buckets = 24;
  const span = 15 * 60_000;
  const step = span / buckets;
  const liveRate = computeDetectionRate(events);
  const points: DetectionPoint[] = [];
  for (let i = 0; i < buckets; i++) {
    const t0 = now - span + i * step;
    const t1 = t0 + step;
    const slice = events.filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= t0 && t < t1;
    });
    const isLiveBucket = i === buckets - 1;
    // Last bucket always equals the vital so the two surfaces cannot drift.
    const artsa = isLiveBucket
      ? liveRate
      : slice.length === 0
        ? Math.max(55, liveRate - (buckets - 1 - i) * 0.4)
        : computeDetectionRate(slice);
    points.push({
      t: t0,
      label: new Date(t0).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      artsa: Math.round(artsa),
      baseline: 62,
    });
  }
  return points;
}

/** Hop keys that should pulse right now (recent message / finding traffic). */
export function recentActiveHops(events: AgentEvent[], limit = 10, maxAgeMs = 8_000): Set<string> {
  const now = Date.now();
  const keys = new Set<string>();
  for (const e of events) {
    if (keys.size >= limit) break;
    if (!e.targetAgent) continue;
    if (now - Date.parse(e.timestamp) > maxAgeMs) continue;
    keys.add(`${e.sourceAgent}→${e.targetAgent}`);
  }
  return keys;
}

export function agentMessages(events: AgentEvent[], agentId: string, limit = 12): AgentEvent[] {
  return events
    .filter((e) => e.sourceAgent === agentId || e.targetAgent === agentId)
    .slice(0, limit);
}

export function statusColor(status: AgentStatus): string {
  if (status === "compromised") return "#ef4444";
  if (status === "under_attack") return "#f59e0b";
  return "#22c55e";
}

export function severityColor(sev: AgentSeverity | undefined): string {
  if (sev === "critical") return "#ef4444";
  if (sev === "warning") return "#f59e0b";
  return "#22c55e";
}

/** Map Command Center / ingest telemetry rows into the AgentEvent contract. */
export function telemetryToAgentEvents(
  rows: Array<Record<string, unknown>>
): AgentEvent[] {
  return rows.map((evt) => {
    const risk = Number(evt.risk_score ?? 0);
    const verdict = String(evt.verdict ?? evt.action ?? "").toUpperCase();
    const tool = String(evt.tool_name ?? "tool");
    const agent = String(evt.agent_id ?? "agent");
    const ts = String(evt.timestamp ?? evt.triggered_at ?? new Date().toISOString());
    const severity: AgentSeverity =
      risk >= 80 || verdict.includes("BREACH") || verdict.includes("KILL")
        ? "critical"
        : risk >= 50 || verdict.includes("SUSPICIOUS")
          ? "warning"
          : "info";
    const asiIdx = Math.min(10, Math.max(1, Math.ceil(risk / 10) || 1));
    const targetAgent =
      severity === "critical" || severity === "warning" ? "Target" : "Judge";
    return {
      type: severity === "info" ? "message" : "finding",
      timestamp: ts,
      sourceAgent: mapIngestAgent(agent, tool),
      targetAgent,
      status:
        severity === "critical"
          ? "compromised"
          : severity === "warning"
            ? "under_attack"
            : "nominal",
      asiTag: `ASI${String(asiIdx).padStart(2, "0")}`,
      severity,
      message: `${agent} · ${tool} · ${verdict || "SCAN"} · R${Math.round(risk)}`,
    };
  });
}

function mapIngestAgent(agentId: string, tool: string): string {
  const a = agentId.toLowerCase();
  const t = tool.toLowerCase();
  if (a.includes("red") || t.includes("prompt")) return "Red Team";
  if (a.includes("defend") || t.includes("guard")) return "Defender";
  if (a.includes("judge") || t.includes("verdict")) return "Judge";
  if (a.includes("curat")) return "Curator";
  if (a.includes("research")) return "Research";
  if (a.includes("target") || t.includes("model") || t.includes("shell")) return "Target";
  return "Target";
}

/** Merge live ingest (preferred) with mock stream; newest-first, de-duped by ts+message. */
export function mergeAgentStreams(
  live: AgentEvent[],
  mock: AgentEvent[],
  max = 240
): AgentEvent[] {
  const seen = new Set<string>();
  const out: AgentEvent[] = [];
  for (const e of [...live, ...mock]) {
    const key = `${e.timestamp}|${e.message}|${e.sourceAgent}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}
