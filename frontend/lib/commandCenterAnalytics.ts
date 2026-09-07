/** Derive chart-ready aggregates from live screening events. */

import { eventTimestamp, extractDetectorScores } from "@/lib/commandCenterLive";
import { verdictStatus } from "@/lib/commandCenterUi";

type EventRow = Record<string, unknown>;

export function verdictBreakdown(events: EventRow[]) {
  let ok = 0;
  let warn = 0;
  let block = 0;
  for (const e of events) {
    const s = verdictStatus(String(e.verdict ?? ""), Number(e.risk_score ?? 0));
    if (s === "block") block += 1;
    else if (s === "warn") warn += 1;
    else ok += 1;
  }
  return [
    { name: "Clear", value: ok, fill: "#22c55e" },
    { name: "Flagged", value: warn, fill: "#f59e0b" },
    { name: "Blocked", value: block, fill: "#ef4444" },
  ].filter((d) => d.value > 0);
}

export function severityBreakdown(events: EventRow[]) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const e of events) {
    const r = Number(e.risk_score ?? 0);
    if (r >= 80) counts.critical += 1;
    else if (r >= 60) counts.high += 1;
    else if (r >= 40) counts.medium += 1;
    else if (r > 0) counts.low += 1;
  }
  return [
    { name: "Critical", value: counts.critical, fill: "#ef4444" },
    { name: "High", value: counts.high, fill: "#f97316" },
    { name: "Medium", value: counts.medium, fill: "#f59e0b" },
    { name: "Low", value: counts.low, fill: "#71717a" },
  ].filter((d) => d.value > 0);
}

export function topTools(events: EventRow[], limit = 6) {
  const map = new Map<string, number>();
  for (const e of events) {
    const t = String(e.tool_name ?? e.event_type ?? "unknown");
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name: name.length > 18 ? `${name.slice(0, 16)}…` : name, count }));
}

export function eventVolumeSeries(events: EventRow[], buckets = 12, windowMs = 30 * 60_000) {
  const now = Date.now();
  const cut = now - windowMs;
  const step = windowMs / buckets;
  const counts = Array.from({ length: buckets }, () => 0);

  for (const e of events) {
    const t = eventTimestamp(e);
    if (t < cut || t <= 0) continue;
    const idx = Math.min(buckets - 1, Math.floor((t - cut) / step));
    counts[idx] += 1;
  }

  return counts.map((count, i) => {
    const ts = cut + i * step;
    return {
      t: new Date(ts).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" }),
      count,
    };
  });
}

export function detectorAverages(events: EventRow[]) {
  let rule = 0;
  let semantic = 0;
  let injection = 0;
  let nRule = 0;
  let nSem = 0;
  let nInj = 0;

  for (const e of events) {
    const s = extractDetectorScores(e);
    if (s.rule != null) {
      rule += s.rule;
      nRule += 1;
    }
    if (s.semantic != null) {
      semantic += s.semantic;
      nSem += 1;
    }
    if (s.injection != null) {
      injection += s.injection;
      nInj += 1;
    }
  }

  return [
    { name: "Policy", score: nRule ? Math.round(rule / nRule) : 0, has: nRule > 0 },
    { name: "Semantic", score: nSem ? Math.round(semantic / nSem) : 0, has: nSem > 0 },
    { name: "Injection", score: nInj ? Math.round(injection / nInj) : 0, has: nInj > 0 },
  ].filter((d) => d.has);
}

export function uniqueSessionCount(events: EventRow[]): number {
  return new Set(events.map((e) => String(e.session_id ?? "")).filter(Boolean)).size;
}

export function uniqueAgentCount(events: EventRow[]): number {
  return new Set(events.map((e) => String(e.agent_id ?? "")).filter(Boolean)).size;
}

export type AgentRiskRow = {
  id: string;
  label: string;
  events: number;
  avgRisk: number;
  maxRisk: number;
  threats: number;
};

/** Agents ranked by average risk (highest first). */
export function topAgentsByRisk(events: EventRow[], limit = 8): AgentRiskRow[] {
  const map = new Map<string, { risks: number[]; threats: number }>();

  for (const e of events) {
    const id = String(e.agent_id ?? "").trim();
    if (!id) continue;
    const risk = Number(e.risk_score ?? 0);
    const row = map.get(id) ?? { risks: [], threats: 0 };
    row.risks.push(risk);
    if (risk >= 50 || /QUARANTINE|BREACH|BLOCK|KILL/i.test(String(e.verdict ?? ""))) {
      row.threats += 1;
    }
    map.set(id, row);
  }

  return [...map.entries()]
    .map(([id, row]) => {
      const avgRisk = Math.round(row.risks.reduce((a, b) => a + b, 0) / row.risks.length);
      const maxRisk = Math.max(...row.risks);
      return {
        id,
        label: id.length > 16 ? `${id.slice(0, 14)}…` : id,
        events: row.risks.length,
        avgRisk,
        maxRisk,
        threats: row.threats,
      };
    })
    .sort((a, b) => b.avgRisk - a.avgRisk || b.maxRisk - a.maxRisk)
    .slice(0, limit);
}

export function defenseLayersSeries(layers: Record<string, number> | undefined) {
  if (!layers || !Object.keys(layers).length) return [];
  return Object.entries(layers)
    .map(([name, score]) => ({
      name: name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 14),
      score: Math.round(score),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

export type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

export function severityOfScore(score: number): SeverityFilter {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  if (score > 0) return "low";
  return "low";
}

export function matchesSeverityFilter(e: EventRow, filter: SeverityFilter): boolean {
  if (filter === "all") return true;
  const risk = Number(e.risk_score ?? 0);
  return severityOfScore(risk) === filter;
}

export function recentThreats(events: EventRow[], limit = 8): EventRow[] {
  return [...events]
    .filter((e) => {
      const risk = Number(e.risk_score ?? 0);
      return risk >= 50 || /QUARANTINE|BREACH|BLOCK|KILL/i.test(String(e.verdict ?? ""));
    })
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
    .slice(0, limit);
}

/** Risk score trend from live events (fallback when metrics.risk_trend is empty). */
export function riskTrendFromEvents(events: EventRow[], limit = 40) {
  return [...events]
    .filter((e) => eventTimestamp(e) > 0)
    .sort((a, b) => eventTimestamp(a) - eventTimestamp(b))
    .slice(-limit)
    .map((e) => ({
      t: new Date(eventTimestamp(e)).toLocaleTimeString(undefined, {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      risk: Math.round(Number(e.risk_score ?? 0)),
      tool: String(e.tool_name ?? "request").slice(0, 14),
    }));
}

/** Stacked severity counts per time bucket for heatmap-style charts. */
export function riskHeatmapSeries(events: EventRow[], buckets = 14, windowMs = 30 * 60_000) {
  const now = Date.now();
  const cut = now - windowMs;
  const step = windowMs / buckets;
  const rows = Array.from({ length: buckets }, (_, i) => ({
    t: new Date(cut + i * step).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" }),
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: 0,
  }));

  for (const e of events) {
    const ts = eventTimestamp(e);
    if (ts < cut || ts <= 0) continue;
    const idx = Math.min(buckets - 1, Math.floor((ts - cut) / step));
    const risk = Number(e.risk_score ?? 0);
    const row = rows[idx]!;
    row.total += 1;
    if (risk >= 80) row.critical += 1;
    else if (risk >= 60) row.high += 1;
    else if (risk >= 40) row.medium += 1;
    else if (risk > 0) row.low += 1;
  }

  return rows;
}

export type AgentToolCell = {
  agent: string;
  tool: string;
  avgRisk: number;
  count: number;
};

/** Agent × tool matrix for risk heatmap table. */
export function agentToolMatrix(events: EventRow[], maxAgents = 6, maxTools = 8): {
  agents: string[];
  tools: string[];
  cells: AgentToolCell[];
} {
  const map = new Map<string, number[]>();

  for (const e of events) {
    const agent = String(e.agent_id ?? "").trim() || "unknown";
    const tool = String(e.tool_name ?? e.event_type ?? "unknown").trim();
    const key = `${agent}\0${tool}`;
    const risks = map.get(key) ?? [];
    risks.push(Number(e.risk_score ?? 0));
    map.set(key, risks);
  }

  const agentTotals = new Map<string, number>();
  const toolTotals = new Map<string, number>();
  for (const [key, risks] of map) {
    const [agent, tool] = key.split("\0");
    agentTotals.set(agent!, (agentTotals.get(agent!) ?? 0) + risks.length);
    toolTotals.set(tool!, (toolTotals.get(tool!) ?? 0) + risks.length);
  }

  const agents = [...agentTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxAgents).map(([a]) => a);
  const tools = [...toolTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTools).map(([t]) => t);

  const cells: AgentToolCell[] = [];
  for (const agent of agents) {
    for (const tool of tools) {
      const risks = map.get(`${agent}\0${tool}`);
      if (!risks?.length) continue;
      cells.push({
        agent,
        tool,
        avgRisk: Math.round(risks.reduce((a, b) => a + b, 0) / risks.length),
        count: risks.length,
      });
    }
  }

  return { agents, tools, cells };
}

export function blockRatePercent(events: EventRow[]): number {
  if (!events.length) return 0;
  let blocked = 0;
  for (const e of events) {
    if (verdictStatus(String(e.verdict ?? ""), Number(e.risk_score ?? 0)) === "block") blocked += 1;
  }
  return Math.round((blocked / events.length) * 100);
}

/** Volume + average risk per time bucket — for composed activity charts. */
export function activityVolumeRiskSeries(events: EventRow[], buckets = 14, windowMs = 30 * 60_000) {
  const now = Date.now();
  const cut = now - windowMs;
  const step = windowMs / buckets;
  const rows = Array.from({ length: buckets }, (_, i) => ({
    t: new Date(cut + i * step).toLocaleTimeString(undefined, { hour12: false, hour: "2-digit", minute: "2-digit" }),
    count: 0,
    avgRisk: 0,
    blocked: 0,
    _risks: [] as number[],
  }));

  for (const e of events) {
    const ts = eventTimestamp(e);
    if (ts < cut || ts <= 0) continue;
    const idx = Math.min(buckets - 1, Math.floor((ts - cut) / step));
    const row = rows[idx]!;
    const risk = Number(e.risk_score ?? 0);
    row.count += 1;
    row._risks.push(risk);
    if (verdictStatus(String(e.verdict ?? ""), risk) === "block") row.blocked += 1;
  }

  return rows.map(({ _risks, ...row }) => ({
    ...row,
    avgRisk: _risks.length ? Math.round(_risks.reduce((a, b) => a + b, 0) / _risks.length) : 0,
  }));
}

export type AgentActivityLane = {
  id: string;
  label: string;
  points: number[];
  total: number;
  maxRisk: number;
};

/** Per-agent event counts in recent time buckets (sparkline lanes). */
export function agentActivityLanes(events: EventRow[], buckets = 10, windowMs = 15 * 60_000, limit = 5): AgentActivityLane[] {
  const now = Date.now();
  const cut = now - windowMs;
  const step = windowMs / buckets;
  const agentIds = topAgentsByRisk(events, limit).map((a) => a.id);

  return agentIds.map((id) => {
    const points = Array.from({ length: buckets }, () => 0);
    let maxRisk = 0;
    let total = 0;
    for (const e of events) {
      if (String(e.agent_id ?? "") !== id) continue;
      const ts = eventTimestamp(e);
      if (ts < cut || ts <= 0) continue;
      const idx = Math.min(buckets - 1, Math.floor((ts - cut) / step));
      points[idx] += 1;
      total += 1;
      maxRisk = Math.max(maxRisk, Number(e.risk_score ?? 0));
    }
    return {
      id,
      label: id.length > 14 ? `${id.slice(0, 12)}…` : id,
      points,
      total,
      maxRisk,
    };
  });
}

/** Recent events for live activity strip — newest first. */
export function recentActivityStream(events: EventRow[], limit = 8): Array<{
  id: string;
  tool: string;
  agent: string;
  risk: number;
  verdict: string;
  age: string;
  event: EventRow;
}> {
  return [...events]
    .filter((e) => eventTimestamp(e) > 0)
    .sort((a, b) => eventTimestamp(b) - eventTimestamp(a))
    .slice(0, limit)
    .map((e, i) => {
      const ts = eventTimestamp(e);
      const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
      const age = sec < 60 ? `${sec}s` : sec < 3600 ? `${Math.floor(sec / 60)}m` : `${Math.floor(sec / 3600)}h`;
      return {
        id: String(e.event_id ?? e.id ?? `${e.session_id}-${i}`),
        tool: String(e.tool_name ?? "request"),
        agent: String(e.agent_id ?? "—"),
        risk: Number(e.risk_score ?? 0),
        verdict: String(e.verdict ?? ""),
        age,
        event: e,
      };
    });
}
